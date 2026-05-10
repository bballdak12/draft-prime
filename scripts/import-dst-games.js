'use strict';

// Import per-game DST stats from nflverse into player_games.
//
// nflverse stores defensive player stats per individual (LBs, DBs, DL) in
// player_stats_def.csv. This script aggregates those stats by team+season+week
// to produce one row per team defense per game, then matches to our historical
// DST cards by team abbreviation + season year.
//
// Only post-1999 DST cards will match (nflverse starts at 1999).
//
// Usage: node scripts/import-dst-games.js [--dry-run]

const { parse }        = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
const fs               = require('fs');
const path             = require('path');

const DEF_URL       = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def.csv';
const SCHEDULES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

const MIN_SEASON = 1999;
const MAX_SEASON = 2024;
const BATCH_SIZE = 500;
const DRY_RUN    = process.argv.includes('--dry-run');

// Normalize nflverse team abbreviations to our stored values
const TEAM_NORM = {
  'LV':  'OAK',
  'LAC': 'SD',
  'LA':  'LAR',
};
function normalizeTeam(t) { return TEAM_NORM[t] || t; }

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

async function fetchAll(supabase, table, select, eqFilters = []) {
  const PAGE = 1000;
  let from = 0;
  const all = [];
  while (true) {
    let q = supabase.from(table).select(select).order('id').range(from, from + PAGE - 1);
    for (const [col, val] of eqFilters) q = q.eq(col, val);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function n(v) { return parseFloat(v) || 0; }

// Resolve stat column names from a sample row (defensive player row).
// nflverse columns vary slightly across releases — try candidates in order.
function resolveCol(row, candidates) {
  const found = candidates.find(c => c in row);
  if (!found) throw new Error(`None of [${candidates.join(', ')}] found. Available: ${Object.keys(row).join(', ')}`);
  return found;
}

// DST half-PPR scoring
function calcDstPoints(agg) {
  const pts =
    agg.sacks   * 1
    + agg.tfl   / 3
    + agg.int   * 2
    + agg.fumble * 2
    + agg.defTd  * 6
    + agg.safety * 2;
  return +pts.toFixed(2);
}

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Build lookup maps ─────────────────────────────────────────────────────
  console.log('[1/6] Building lookup maps …');

  const dstPlayers = await fetchAll(supabase, 'players', 'id, name, team, era', [['position', 'DST']]);
  const allSeasons = await fetchAll(supabase, 'player_seasons', 'id, player_id, season_year');

  console.log(`  DST cards: ${dstPlayers.length}`);

  // normalized_team|season_year → player_id
  const teamSeasonMap = {};
  for (const p of dstPlayers) {
    const era  = parseInt(p.era);
    const abbr = normalizeTeam(p.team || '');
    if (abbr && era) teamSeasonMap[`${abbr}|${era}`] = p.id;
  }
  console.log(`  Team+season keys: ${Object.keys(teamSeasonMap).length}`);

  // player_id|season_year → player_season_id (DST only)
  const dstIds = new Set(dstPlayers.map(p => p.id));
  const seasonLookup = {};
  for (const s of allSeasons) {
    if (dstIds.has(s.player_id)) seasonLookup[`${s.player_id}|${s.season_year}`] = s.id;
  }
  console.log(`  Season lookup entries: ${Object.keys(seasonLookup).length}`);

  // ── 2. Download schedules ────────────────────────────────────────────────────
  console.log('\n[2/6] Downloading schedules …');
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

  // ── 3. Download defensive player stats ──────────────────────────────────────
  console.log('\n[3/6] Downloading defensive player stats …');
  const defText = await downloadText(DEF_URL);
  const rows    = parse(defText, { columns: true, skip_empty_lines: true });
  console.log(`  Total rows: ${rows.length.toLocaleString()}`);

  // ── 4. Discover column names ─────────────────────────────────────────────────
  console.log('\n[4/6] Discovering DEF column names …');
  const sample = rows.find(r => n(r.def_sacks || r.sacks || 0) > 0) || rows[0];
  const nonEmpty = Object.entries(sample)
    .filter(([, v]) => v !== '' && v !== null && v !== '0' && v !== 'NA' && parseFloat(v) > 0)
    .map(([k, v]) => `${k}=${v}`);
  console.log(`  Sample row (non-zero cols):\n    ${nonEmpty.join('\n    ')}`);

  const COL = {
    team:   resolveCol(sample, ['recent_team', 'team']),
    sacks:  resolveCol(sample, ['def_sacks',   'sacks']),
    tfl:    resolveCol(sample, ['def_tackles_for_loss', 'tackles_for_loss', 'def_tfl']),
    int:    resolveCol(sample, ['def_interceptions', 'interceptions']),
    fumble: resolveCol(sample, ['def_fumbles_recovery_opp', 'def_fumbles_recovered', 'def_fumble_recovery_opp', 'fumbles_recovery_opp']),
    defTd:  resolveCol(sample, ['def_tds', 'def_td']),
    safety: resolveCol(sample, ['def_safety', 'def_safeties', 'safeties']),
  };
  console.log('\n  Resolved columns:');
  for (const [k, v] of Object.entries(COL)) console.log(`    ${k.padEnd(8)} → ${v}`);

  // ── 5. Aggregate by team+season+week ─────────────────────────────────────────
  console.log('\n[5/6] Aggregating …');

  // key: "team|season|week" → { sacks, tfl, int, fumble, defTd, safety, sType, rawTeam }
  const aggs = {};

  for (const r of rows) {
    const season = parseInt(r.season);
    const week   = parseInt(r.week);
    if (!season || !week)                             continue;
    if (season < MIN_SEASON || season > MAX_SEASON)   continue;
    if (week < 1 || week > 22)                        continue;

    const sType = (r.season_type || '').toUpperCase();
    if (sType !== 'REG' && sType !== 'POST')          continue;

    const rawTeam = (r[COL.team] || '').trim();
    if (!rawTeam) continue;

    const key = `${rawTeam}|${season}|${week}`;
    if (!aggs[key]) {
      aggs[key] = { sacks: 0, tfl: 0, int: 0, fumble: 0, defTd: 0, safety: 0, sType, rawTeam, season, week };
    }
    const a = aggs[key];
    a.sacks  += n(r[COL.sacks]);
    a.tfl    += n(r[COL.tfl]);
    a.int    += n(r[COL.int]);
    a.fumble += n(r[COL.fumble]);
    a.defTd  += n(r[COL.defTd]);
    a.safety += n(r[COL.safety]);
  }

  console.log(`  Team-game buckets: ${Object.keys(aggs).length.toLocaleString()}`);

  // ── 6. Match and upsert ──────────────────────────────────────────────────────
  console.log('\n[6/6] Matching to DST cards and upserting …');

  const batch = [];
  let matched = 0, skipped = 0, inserted = 0;

  async function flushBatch() {
    if (!batch.length) return;
    if (!DRY_RUN) {
      const { error } = await supabase.from('player_games')
        .upsert(batch, { onConflict: 'player_season_id,season,week' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }
    inserted += batch.length;
    batch.length = 0;
  }

  for (const a of Object.values(aggs)) {
    const team     = normalizeTeam(a.rawTeam);
    const playerId = teamSeasonMap[`${team}|${a.season}`];
    if (!playerId) { skipped++; continue; }

    const psId = seasonLookup[`${playerId}|${a.season}`];
    if (!psId)     { skipped++; continue; }

    const sched     = schedLookup[`${a.season}|${a.week}|${a.rawTeam}`]
                   || schedLookup[`${a.season}|${a.week}|${team}`]
                   || {};
    const isPlayoff = a.sType === 'POST' || a.week >= 19;

    const pts = calcDstPoints(a);

    batch.push({
      player_season_id:  psId,
      player_id:         playerId,
      season:            a.season,
      week:              a.week,
      game_date:         sched.gameDate || null,
      opponent:          sched.opponent || null,
      home_away:         sched.homeAway || null,
      is_playoff:        isPlayoff,
      dst_sacks:         +a.sacks.toFixed(1),
      dst_tfl:           Math.round(a.tfl),
      dst_int:           Math.round(a.int),
      dst_fumble_rec:    Math.round(a.fumble),
      dst_def_td:        Math.round(a.defTd),
      dst_safety:        Math.round(a.safety),
      half_ppr_raw:      pts,
      half_ppr_adjusted: pts,
      injury_flag:       false,
    });

    matched++;
    if (batch.length >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`  Team-game buckets     : ${Object.keys(aggs).length.toLocaleString()}`);
  console.log(`  Matched to DST cards  : ${matched}`);
  console.log(`  Skipped (no card match): ${skipped.toLocaleString()}`);
  console.log(`  Game rows upserted    : ${inserted}`);
  console.log('─────────────────────────────────────────────────────────────────');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
