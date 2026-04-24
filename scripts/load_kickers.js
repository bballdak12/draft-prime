'use strict';

const { parse }      = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const KICKING_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_kicking.csv';

// Draft Prime half-PPR kicker scoring
// under 40 yd FG = 3 pts | 40-49 = 4 pts | 50+ = 5 pts | PAT = 1 pt
function kickerPoints(agg) {
  const under40  = (agg.fg_made_0_19 + agg.fg_made_20_29 + agg.fg_made_30_39) * 3;
  const fg40_49  =  agg.fg_made_40_49  * 4;
  const fg50plus = (agg.fg_made_50_59 + agg.fg_made_60_)  * 5;
  const pat      =  agg.pat_made       * 1;
  return under40 + fg40_49 + fg50plus + pat;
}

const MIN_GAMES   = 8;
const MIN_FPPG    = 6;   // bronze threshold for kickers

// Players already in a higher tier — skip them
const SKIP_NAMES  = new Set([
  'Justin Tucker',    // Legend
  'Gary Anderson',    // Hero
  'David Akers',      // Hero
]);

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Download ──────────────────────────────────────────────────────────
  console.log('\n[1/5] Downloading player_stats_kicking.csv …');
  const res = await fetch(KICKING_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  console.log(`  ${(text.length / 1024).toFixed(0)} KB downloaded`);

  // ── 2. Parse & aggregate to seasons ─────────────────────────────────────
  console.log('[2/5] Parsing and aggregating …');
  const rows = parse(text, { columns: true, skip_empty_lines: true });
  console.log(`  Weekly rows: ${rows.length.toLocaleString()}`);

  const n = v => parseFloat(v) || 0;

  // player_id → season → aggregated stats
  const byPlayerSeason = {};

  for (const r of rows) {
    if (r.season_type !== 'REG') continue;
    const pid    = r.player_id;
    const season = parseInt(r.season);
    if (!pid || !season) continue;

    if (!byPlayerSeason[pid])         byPlayerSeason[pid] = {};
    if (!byPlayerSeason[pid][season]) {
      byPlayerSeason[pid][season] = {
        games: 0,
        fg_made_0_19: 0, fg_made_20_29: 0, fg_made_30_39: 0,
        fg_made_40_49: 0, fg_made_50_59: 0, fg_made_60_: 0,
        pat_made: 0,
        name: r.player_display_name || r.player_name || '',
        team: r.team || '',
      };
    }

    const agg = byPlayerSeason[pid][season];
    agg.games++;
    agg.fg_made_0_19  += n(r.fg_made_0_19);
    agg.fg_made_20_29 += n(r.fg_made_20_29);
    agg.fg_made_30_39 += n(r.fg_made_30_39);
    agg.fg_made_40_49 += n(r.fg_made_40_49);
    agg.fg_made_50_59 += n(r.fg_made_50_59);
    agg.fg_made_60_   += n(r.fg_made_60_);
    agg.pat_made      += n(r.pat_made);
    if (r.team)                agg.team = r.team;
    if (r.player_display_name) agg.name = r.player_display_name;
  }

  // ── 3. Build qualifying player pool ─────────────────────────────────────
  console.log('[3/5] Identifying qualifying kickers …');

  // player_id → { name, team, firstSeason, lastSeason, isActive, seasons[] }
  const qualified = {};

  for (const [pid, seasons] of Object.entries(byPlayerSeason)) {
    for (const [yearStr, agg] of Object.entries(seasons)) {
      if (agg.games < MIN_GAMES) continue;
      const points = kickerPoints(agg);
      const fppg   = +(points / agg.games).toFixed(2);
      if (fppg < MIN_FPPG) continue;

      const year = parseInt(yearStr);
      if (!qualified[pid]) {
        qualified[pid] = {
          name: agg.name, team: agg.team,
          firstSeason: year, lastSeason: year,
          isActive: false, seasons: [],
        };
      }
      const qp = qualified[pid];
      qp.seasons.push({ season_year: year, games_played: agg.games, fppg });
      if (year < qp.firstSeason) qp.firstSeason = year;
      if (year > qp.lastSeason)  { qp.lastSeason = year; qp.team = agg.team; qp.name = agg.name; }
      if (year >= 2023) qp.isActive = true;
    }
  }

  // Filter skip list
  const allQualified = Object.values(qualified).filter(qp => !SKIP_NAMES.has(qp.name));
  console.log(`  Qualifying kickers (≥${MIN_GAMES} games, ≥${MIN_FPPG} FPPG): ${Object.keys(qualified).length}`);
  console.log(`  After skipping hero/legend:                              ${allQualified.length}`);

  // ── 4. Check for existing kickers in DB ─────────────────────────────────
  console.log('[4/5] Checking for existing kicker entries …');
  const { data: existingK } = await supabase
    .from('players').select('name, position').eq('position', 'K');
  const existingNames = new Set((existingK || []).map(p => p.name));

  const newKickers = allQualified.filter(qp => !existingNames.has(qp.name));
  console.log(`  Already in DB: ${allQualified.length - newKickers.length}`);
  console.log(`  New to insert: ${newKickers.length}`);

  if (newKickers.length === 0) {
    console.log('\n  Nothing to insert.');
    return;
  }

  // ── 5. Insert 3 tier versions per kicker + their seasons ─────────────────
  console.log('[5/5] Inserting 3 tier rows per kicker and their seasons …');

  const TIERS = [
    { tier: 'gold',   prime_seasons_count: 3 },
    { tier: 'silver', prime_seasons_count: 4 },
    { tier: 'bronze', prime_seasons_count: 5 },
  ];
  const NO_ADJ = { pass_yds:1.0,pass_tds:1.0,ints:1.0,rush_yds:1.0,rush_tds:1.0,rec:1.0,rec_yds:1.0,rec_tds:1.0 };

  const BATCH = 200;
  let insertedPlayers = 0, insertedSeasons = 0;

  for (let i = 0; i < newKickers.length; i += BATCH) {
    const chunk = newKickers.slice(i, i + BATCH);

    // Build 3 player rows per kicker
    const playerRows = [];
    for (const qp of chunk) {
      for (const { tier, prime_seasons_count } of TIERS) {
        playerRows.push({
          name: qp.name, position: 'K', team: qp.team || null,
          era:  `${qp.firstSeason}-${qp.lastSeason}`,
          tier, overall_rating: null, prime_seasons_count,
          is_active: qp.isActive,
          era_adjustment_multiplier: NO_ADJ,
          ceiling: null, consistency: null, floor: null,
          photo_url: null,
          card_back_bio:      `Placeholder bio for ${qp.name}. Update with official biography.`,
          card_back_fun_fact: `Placeholder fun fact for ${qp.name}. Update with official fun fact.`,
        });
      }
    }

    const { data: inserted, error: pErr } = await supabase
      .from('players').insert(playerRows).select('id, name, tier');
    if (pErr) throw new Error(`Player insert: ${pErr.message}`);
    insertedPlayers += inserted.length;

    // Map "name|tier" → new player id
    const keyToId = {};
    for (const p of inserted) keyToId[`${p.name}|${p.tier}`] = p.id;

    // Build season rows for all 3 tiers
    const seasonRows = [];
    for (const qp of chunk) {
      const sorted = [...qp.seasons].sort((a, b) => b.fppg - a.fppg);
      for (const { tier } of TIERS) {
        const pid = keyToId[`${qp.name}|${tier}`];
        if (!pid) continue;
        sorted.forEach((s, idx) => {
          seasonRows.push({
            player_id: pid, season_year: s.season_year,
            games_played: s.games_played, fppg: s.fppg,
            season_rank: idx + 1, is_eligible: true,
          });
        });
      }
    }

    for (let j = 0; j < seasonRows.length; j += BATCH) {
      const { error: sErr } = await supabase
        .from('player_seasons').insert(seasonRows.slice(j, j + BATCH));
      if (sErr) throw new Error(`Season insert: ${sErr.message}`);
    }
    insertedSeasons += seasonRows.length;

    process.stdout.write(`\r  Processed ${Math.min(i + BATCH, newKickers.length)} / ${newKickers.length} kickers`);
  }
  console.log(`\n  Inserted ${insertedPlayers} player rows, ${insertedSeasons} season rows`);

  // ── Verify ───────────────────────────────────────────────────────────────
  console.log('\n── Verification ────────────────────────────────────────────');

  for (const tier of ['legend','hero','gold','silver','bronze']) {
    const { count } = await supabase.from('players').select('*',{count:'exact',head:true})
      .eq('position','K').eq('tier',tier);
    if (count) console.log(`  K ${tier}: ${count}`);
  }

  // Top 5 kickers by best season FPPG (gold tier as reference)
  const { data: goldKs } = await supabase.from('players').select('id,name').eq('position','K').eq('tier','gold');
  const gkIds = goldKs.map(p=>p.id);
  const idToName = Object.fromEntries(goldKs.map(p=>[p.id,p.name]));

  const { data: gkSeasons } = await supabase.from('player_seasons')
    .select('player_id,fppg').in('player_id',gkIds).eq('season_rank',1)
    .order('fppg',{ascending:false}).limit(5);

  console.log('\n  Top 5 kickers by best season FPPG:');
  console.log('  rank | kicker                  | best fppg');
  console.log('  -----|-------------------------|----------');
  gkSeasons.forEach((s,i)=>
    console.log(`  ${i+1}    | ${idToName[s.player_id].padEnd(23)} | ${s.fppg}`)
  );
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
