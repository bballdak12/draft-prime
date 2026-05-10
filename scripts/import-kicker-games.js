'use strict';

// Import per-game kicker stats from nflverse into player_games.
// Usage: node scripts/import-kicker-games.js [--dry-run]

const { parse }        = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
const fs               = require('fs');
const path             = require('path');

const KICKING_URL   = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_kicking.csv';
const SCHEDULES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

const MIN_SEASON     = 1999;
const MAX_SEASON     = 2024;
const BATCH_SIZE     = 500;
const DRY_RUN        = process.argv.includes('--dry-run');
const HEROES_LEGENDS = process.argv.includes('--heroes-legends');

// Tier preference for canonical player resolution (gold wins)
const TIER_PREF = { gold: 3, hero: 2, legend: 2, silver: 1, bronze: 0 };

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

async function downloadText(url) {
  console.log(`  Fetching ${url.split('/').pop()} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();
  console.log(`  ${(text.length / 1024 / 1024).toFixed(1)} MB downloaded`);
  return text;
}

async function fetchAll(supabase, table, select) {
  const PAGE = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase.from(table).select(select).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function n(v) { return parseFloat(v) || 0; }

// Half-PPR kicker scoring — no era adjustment
function calcKickerPoints(r) {
  const under40  = (n(r.fg_made_0_19) + n(r.fg_made_20_29) + n(r.fg_made_30_39)) * 3;
  const fg40_49  =  n(r.fg_made_40_49) * 4;
  const fg50plus = (n(r.fg_made_50_59) + n(r.fg_made_60_)) * 5;
  const pat      =  n(r.pat_made) * 1;
  return +(under40 + fg40_49 + fg50plus + pat).toFixed(2);
}

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Build lookup maps ─────────────────────────────────────────────────────
  console.log('[1/5] Building lookup maps …');

  const allPlayers = await fetchAll(supabase, 'players',        'id, name, position, tier');
  const allSeasons = await fetchAll(supabase, 'player_seasons', 'id, player_id, season_year');

  const kPlayers = allPlayers.filter(p => p.position === 'K');
  console.log(`  K players: ${kPlayers.length}`);

  // When --heroes-legends is set, restrict to K hero/legend names only
  let hlNameFilter = null;
  if (HEROES_LEGENDS) {
    const { data: hlPlayers, error: hlErr } = await supabase
      .from('players').select('name')
      .in('tier', ['hero', 'legend']).eq('position', 'K');
    if (hlErr) throw new Error(`hero/legend K query: ${hlErr.message}`);
    hlNameFilter = new Set(hlPlayers.map(p => p.name));
    console.log(`  Hero/legend K name filter: ${hlNameFilter.size} names`);
  }

  // name → canonical (highest-tier) player_id
  const nameToId = {};
  for (const p of kPlayers) {
    const cur = nameToId[p.name];
    if (!cur || (TIER_PREF[p.tier] ?? 0) > (TIER_PREF[cur.tier] ?? 0)) {
      nameToId[p.name] = { id: p.id, tier: p.tier };
    }
  }
  console.log(`  Unique kicker names: ${Object.keys(nameToId).length}`);

  // Build season lookup only for canonical player IDs
  const canonicalIds = new Set(Object.values(nameToId).map(v => v.id));
  const seasonLookup = {};
  for (const s of allSeasons) {
    if (canonicalIds.has(s.player_id)) {
      seasonLookup[`${s.player_id}|${s.season_year}`] = s.id;
    }
  }
  console.log(`  Season lookup entries: ${Object.keys(seasonLookup).length}`);

  // ── 2. Download schedules ────────────────────────────────────────────────────
  console.log('\n[2/5] Downloading schedules …');
  const schedText = await downloadText(SCHEDULES_URL);
  const schedRows = parse(schedText, { columns: true, skip_empty_lines: true });

  const schedLookup = {};
  for (const s of schedRows) {
    const season  = parseInt(s.season);
    const week    = parseInt(s.week);
    if (!season || !week) continue;
    const ht      = (s.home_team || '').trim();
    const at      = (s.away_team || '').trim();
    const gd      = s.gameday || null;
    const neutral = s.location && s.location.toLowerCase() === 'neutral';
    if (ht) schedLookup[`${season}|${week}|${ht}`] = { homeAway: neutral ? 'neutral' : 'home', gameDate: gd, opponent: at };
    if (at) schedLookup[`${season}|${week}|${at}`] = { homeAway: neutral ? 'neutral' : 'away', gameDate: gd, opponent: ht };
  }
  console.log(`  Schedule entries: ${Object.keys(schedLookup).length.toLocaleString()}`);

  // ── 3. Download kicking stats ────────────────────────────────────────────────
  console.log('\n[3/5] Downloading kicker stats …');
  const kickText = await downloadText(KICKING_URL);
  const rows     = parse(kickText, { columns: true, skip_empty_lines: true });
  console.log(`  Total rows: ${rows.length.toLocaleString()}`);

  // ── 4. Process rows ──────────────────────────────────────────────────────────
  console.log('\n[4/5] Processing …');

  let processed = 0, skipped = 0, matched = 0, inserted = 0;
  const batch = [];

  async function flushBatch() {
    if (!batch.length) return;
    // Deduplicate by conflict key — keep last row per (player_season_id, season, week)
    const deduped = [...new Map(batch.map(r => [`${r.player_season_id}|${r.season}|${r.week}`, r])).values()];
    if (!DRY_RUN) {
      const { error } = await supabase.from('player_games')
        .upsert(deduped, { onConflict: 'player_season_id,season,week' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }
    inserted += deduped.length;
    batch.length = 0;
  }

  for (const r of rows) {
    processed++;
    if (processed % 500 === 0) {
      process.stdout.write(`\r  ${processed.toLocaleString()} / ${rows.length.toLocaleString()} | matched ${matched.toLocaleString()} | skipped ${skipped.toLocaleString()}`);
    }

    const season = parseInt(r.season);
    const week   = parseInt(r.week);
    if (!season || !week)                         { skipped++; continue; }
    if (season < MIN_SEASON || season > MAX_SEASON) { skipped++; continue; }
    if (week < 1 || week > 22)                    { skipped++; continue; }

    const sType = (r.season_type || '').toUpperCase();
    if (sType !== 'REG' && sType !== 'POST')      { skipped++; continue; }

    const name      = (r.player_display_name || r.player_name || '').trim();
    if (hlNameFilter && !hlNameFilter.has(name))  { skipped++; continue; }
    const canonical = nameToId[name];
    if (!canonical)                               { skipped++; continue; }

    const psId = seasonLookup[`${canonical.id}|${season}`];
    if (!psId)                                    { skipped++; continue; }

    const team    = (r.team || '').trim();
    const sched   = schedLookup[`${season}|${week}|${team}`] || {};
    const isPlayoff = sType === 'POST' || week >= 19;

    // FG attempts — sum all ranges for injury flag
    const fgAttUnder40 = Math.round(n(r.fg_att_0_19) + n(r.fg_att_20_29) + n(r.fg_att_30_39));
    const fgAtt40_49   = Math.round(n(r.fg_att_40_49));
    const fgAtt50plus  = Math.round(n(r.fg_att_50_59) + n(r.fg_att_60_));
    const patAtt       = Math.round(n(r.pat_att));
    const injuryFlag   = (fgAttUnder40 + fgAtt40_49 + fgAtt50plus + patAtt) === 0;

    const fgMadeUnder40 = Math.round(n(r.fg_made_0_19) + n(r.fg_made_20_29) + n(r.fg_made_30_39));
    const fgMade40_49   = Math.round(n(r.fg_made_40_49));
    const fgMade50plus  = Math.round(n(r.fg_made_50_59) + n(r.fg_made_60_));
    const patMade       = Math.round(n(r.pat_made));

    const pts = calcKickerPoints(r);

    batch.push({
      player_season_id:  psId,
      player_id:         canonical.id,
      season,
      week,
      game_date:         sched.gameDate || null,
      opponent:          sched.opponent || null,
      home_away:         sched.homeAway || null,
      is_playoff:        isPlayoff,
      fg_att_under40:    fgAttUnder40,
      fg_made_under40:   fgMadeUnder40,
      fg_att_40_49:      fgAtt40_49,
      fg_made_40_49:     fgMade40_49,
      fg_att_50plus:     fgAtt50plus,
      fg_made_50plus:    fgMade50plus,
      pat_att:           patAtt,
      pat_made:          patMade,
      half_ppr_raw:      pts,
      half_ppr_adjusted: pts,   // no era adjustment for kickers
      injury_flag:       injuryFlag,
    });

    matched++;
    if (batch.length >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  // ── 5. Summary ────────────────────────────────────────────────────────────────
  console.log(`\n\n[5/5] ${DRY_RUN ? 'Dry-run' : 'Import'} complete.\n`);
  console.log('── Summary ──────────────────────────────────────────────────────');
  console.log(`  Rows processed  : ${processed.toLocaleString()}`);
  console.log(`  Rows matched    : ${matched.toLocaleString()}`);
  console.log(`  Rows skipped    : ${skipped.toLocaleString()}`);
  console.log(`  Game rows upserted: ${inserted.toLocaleString()}`);
  console.log('─────────────────────────────────────────────────────────────────');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
