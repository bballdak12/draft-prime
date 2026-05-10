'use strict';

// Import per-game DST stats scraped from PFR opponent gamelogs.
// Source: data/pfr-scraped-gamelogs.json (36 pre-1999 DST cards)
//
// Each entry has: playerId, season, games[]
//   game fields: week, date, homeAway, opp, result, ptsO, sacks, ints, fumRec, isPlayoff
//
// dst_tfl / dst_def_td / dst_safety are unavailable from opponent gamelogs → stored as 0.
//
// Usage: node scripts/import-pfr-scraped-gamelogs.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const DATA_FILE  = path.join(__dirname, '../data/pfr-scraped-gamelogs.json');
const BATCH_SIZE = 200;
const DRY_RUN    = process.argv.includes('--dry-run');

function ptsAllowedBonus(pts) {
  if (pts === null || pts === undefined) return 0;
  if (pts === 0)  return 10;
  if (pts <= 6)   return 7;
  if (pts <= 13)  return 4;
  if (pts <= 20)  return 1;
  if (pts <= 27)  return 0;
  if (pts <= 34)  return -1;
  return -4;
}

function calcPoints(g) {
  const base = (g.sacks || 0) * 1 + (g.ints || 0) * 2 + (g.fumRec || 0) * 2;
  return +(base + ptsAllowedBonus(g.ptsO)).toFixed(2);
}

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

async function fetchAll(supabase, table, select, eqFilters = []) {
  const PAGE = 1000; let from = 0; const all = [];
  while (true) {
    let q = supabase.from(table).select(select).order('id').range(from, from + PAGE - 1);
    for (const [col, val] of eqFilters) q = q.eq(col, val);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all.push(...data); if (data.length < PAGE) break; from += PAGE;
  }
  return all;
}

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const scraped = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`[1/3] Loaded ${scraped.length} entries from ${path.basename(DATA_FILE)}`);

  // Build player_season_id lookup
  console.log('[2/3] Loading player_seasons …');
  const allSeasons = await fetchAll(supabase, 'player_seasons', 'id, player_id, season_year');
  const seasonLookup = {};
  for (const s of allSeasons) seasonLookup[`${s.player_id}|${s.season_year}`] = s.id;
  console.log(`  ${allSeasons.length} player_season rows loaded`);

  // Build rows
  console.log('[3/3] Building and inserting rows …');
  const batch = [];
  let inserted = 0, skipped = 0, noSeason = 0;

  async function flushBatch() {
    if (!batch.length || DRY_RUN) { inserted += batch.length; batch.length = 0; return; }
    const { error } = await supabase.from('player_games')
      .upsert(batch, { onConflict: 'player_season_id,season,week' });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
    inserted += batch.length;
    batch.length = 0;
  }

  for (const entry of scraped) {
    const psId = seasonLookup[`${entry.playerId}|${entry.season}`];
    if (!psId) {
      console.warn(`  No player_season for ${entry.playerId} ${entry.season}`);
      noSeason++;
      continue;
    }

    for (const g of entry.games) {
      if (!g.week) { skipped++; continue; }
      const pts = calcPoints(g);
      batch.push({
        player_season_id:  psId,
        player_id:         entry.playerId,
        season:            entry.season,
        week:              g.week,
        game_date:         g.date || null,
        opponent:          g.opp  || null,
        home_away:         g.homeAway || null,
        is_playoff:        !!g.isPlayoff,
        dst_sacks:         g.sacks  || 0,
        dst_tfl:           0,
        dst_int:           g.ints   || 0,
        dst_fumble_rec:    g.fumRec || 0,
        dst_def_td:        0,
        dst_safety:        0,
        dst_pts_allowed:   g.ptsO  ?? null,
        half_ppr_raw:      pts,
        half_ppr_adjusted: pts,
        injury_flag:       false,
      });
      if (batch.length >= BATCH_SIZE) await flushBatch();
    }
  }
  await flushBatch();

  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(`  Entries processed    : ${scraped.length}`);
  console.log(`  Entries skipped      : ${noSeason} (no player_season row)`);
  console.log(`  Game rows upserted   : ${inserted}`);
  console.log(`  Games skipped        : ${skipped}`);
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('\n✓ Done.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
