'use strict';

// Backfill dst_pts_allowed for all DST player_games rows and recalculate
// half_ppr_raw / half_ppr_adjusted to include the standard points-allowed bracket.
//
// Points-allowed scoring:
//   0 pts    → +10
//   1–6      → +7
//   7–13     → +4
//   14–20    → +1
//   21–27    →  0
//   28–34    → -1
//   35+      → -4
//
// Data sources:
//   Post-1999 cards  : nflverse games.csv  (home_score / away_score)
//   Pre-1999 cards   : PFR opponent XLS files already in data/pfr-gamelogs/
//                      (points_opp column = opponent's score = our pts allowed)
//
// Usage: node scripts/backfill-dst-pts-allowed.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const { parse }        = require('csv-parse/sync');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, '../data/pfr-gamelogs');
const SCHEDULES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const BATCH_SIZE  = 200;
const DRY_RUN     = process.argv.includes('--dry-run');

// ─── Scoring ──────────────────────────────────────────────────────────────────

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

function recalcDstPts(g, ptsAllowed) {
  // Recalculate from raw stats so all previously-patched def TDs & safeties
  // are preserved. Pre-1999 cards have no TFL (stored as 0).
  const base =
    (g.dst_sacks     || 0) * 1
    + (g.dst_tfl     || 0) / 3
    + (g.dst_int     || 0) * 2
    + (g.dst_fumble_rec || 0) * 2
    + (g.dst_def_td  || 0) * 6
    + (g.dst_safety  || 0) * 2;
  return +(base + ptsAllowedBonus(ptsAllowed)).toFixed(2);
}

// ─── Env / Supabase ───────────────────────────────────────────────────────────

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

// ─── PFR XLS parser (same as import-pfr-dst-gamelogs.js) ─────────────────────

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '')
    .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#160;/g,' ')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}

function parseXls(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  for (const [, rowContent] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (!rowContent.includes('<td')) continue;
    const cells = [...rowContent.matchAll(/<td[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi)];
    if (!cells.length) continue;
    const row = Object.fromEntries(cells.map(([, stat, inner]) => [stat, stripHtml(inner)]));
    if (!row.date || row.date === 'Date' || !row.week_num) continue;
    rows.push(row);
  }
  return rows;
}

// ─── Folder → DST player matching (same logic as import-pfr-dst-gamelogs.js) ─

function matchFolderToDst(folderName, dstPlayers) {
  const m = folderName.match(/^(\d{4})\s+(.+)$/);
  if (!m) return null;
  const year     = parseInt(m[1]);
  const keywords = m[2].toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = dstPlayers.filter(p => {
    if (!p.name.startsWith(String(year))) return false;
    return keywords.some(kw => p.name.toLowerCase().includes(kw));
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const na = a.name.toLowerCase(), nb = b.name.toLowerCase();
    return keywords.filter(kw => nb.includes(kw)).length
         - keywords.filter(kw => na.includes(kw)).length;
  });
  return { player: candidates[0], year };
}

// ─── nflverse team normalization ──────────────────────────────────────────────

const TEAM_NORM = { LV: 'OAK', LAC: 'SD', LA: 'LAR' };
function normalizeTeam(t) { return TEAM_NORM[t] || t; }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Load all DST cards ────────────────────────────────────────────────────
  console.log('[1/5] Loading DST cards …');
  const dstPlayers = await fetchAll(supabase, 'players', 'id, name, position, team', [['position', 'DST']]);
  const dstIds     = new Set(dstPlayers.map(p => p.id));
  console.log(`  ${dstPlayers.length} DST cards`);

  // ── 2. Build nflverse schedule lookup (post-1999) ────────────────────────────
  console.log('\n[2/5] Downloading nflverse schedules …');
  const schedText = await (await fetch(SCHEDULES_URL)).text();
  const schedRows = parse(schedText, { columns: true, skip_empty_lines: true });

  // key: "normTeam|season|week" → ptsAllowed (opponent's score)
  const schedPtsLookup = {};
  for (const s of schedRows) {
    const season = parseInt(s.season);
    const week   = parseInt(s.week);
    if (!season || !week) continue;
    const ht = normalizeTeam((s.home_team || '').trim());
    const at = normalizeTeam((s.away_team || '').trim());
    const hs = parseInt(s.home_score);
    const as_ = parseInt(s.away_score);
    if (isNaN(hs) || isNaN(as_)) continue;
    // Home team allowed away_score, away team allowed home_score
    if (ht) schedPtsLookup[`${ht}|${season}|${week}`] = as_;
    if (at) schedPtsLookup[`${at}|${season}|${week}`] = hs;
  }
  console.log(`  Schedule entries with scores: ${Object.keys(schedPtsLookup).length.toLocaleString()}`);

  // ── 3. Build pre-1999 pts-allowed lookup from PFR XLS files ─────────────────
  console.log('\n[3/5] Parsing pre-1999 PFR XLS files for points_opp …');

  // playerid|season|week → ptsAllowed
  const xlsPtsLookup = {};

  const allFolders = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{4}\s/.test(e.name))
    .map(e => e.name);

  for (const folder of allFolders) {
    const match = matchFolderToDst(folder, dstPlayers);
    if (!match) continue;

    const folderPath = path.join(DATA_DIR, folder);
    const xls = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.xls') && !f.toLowerCase().includes('def') && !f.toLowerCase().includes('touchdown'))
      .sort();

    for (const file of xls) {
      const isPlayoff = file !== 'sportsref_download.xls';
      const rows = parseXls(path.join(folderPath, file));
      for (const row of rows) {
        const week       = parseInt(row.week_num);
        const ptsAllowed = parseInt(row.points_opp);
        if (!week || isNaN(ptsAllowed)) continue;
        xlsPtsLookup[`${match.player.id}|${match.year}|${week}`] = ptsAllowed;
      }
      console.log(`  ${folder}/${file}: ${rows.length} rows parsed`);
    }
  }

  // ── 4. Load all DST player_games and compute updates ────────────────────────
  console.log('\n[4/5] Loading DST player_games and computing updates …');

  const allGames = await fetchAll(supabase, 'player_games',
    'id, player_id, season, week, home_away, dst_sacks, dst_tfl, dst_int, dst_fumble_rec, dst_def_td, dst_safety, half_ppr_raw, half_ppr_adjusted'
  );
  const dstGames = allGames.filter(g => dstIds.has(g.player_id));
  console.log(`  DST game rows: ${dstGames.length}`);

  // Build player → team lookup
  const playerTeam = Object.fromEntries(dstPlayers.map(p => [p.id, normalizeTeam(p.team || '')]));

  const updates = [];
  let noMatch = 0;

  for (const g of dstGames) {
    // Try pre-1999 XLS lookup first
    let ptsAllowed = xlsPtsLookup[`${g.player_id}|${g.season}|${g.week}`];

    // Fall back to nflverse schedule lookup
    if (ptsAllowed === undefined) {
      const team = playerTeam[g.player_id];
      ptsAllowed = schedPtsLookup[`${team}|${g.season}|${g.week}`];
    }

    if (ptsAllowed === undefined) { noMatch++; continue; }

    const newPts = recalcDstPts(g, ptsAllowed);
    updates.push({
      id:                g.id,
      dst_pts_allowed:   ptsAllowed,
      half_ppr_raw:      newPts,
      half_ppr_adjusted: newPts,
    });
  }

  console.log(`  Updates computed: ${updates.length}  (no-match: ${noMatch})`);

  // Sample
  console.log('\n  Sample (first 5 updates):');
  for (const u of updates.slice(0, 5)) {
    const g = dstGames.find(x => x.id === u.id);
    const team = playerTeam[g.player_id];
    console.log(`    ${team} ${g.season} wk${g.week}  ptsAllowed=${u.dst_pts_allowed}  pts: ${g.half_ppr_adjusted} → ${u.half_ppr_adjusted}`);
  }

  if (!DRY_RUN && updates.length) {
    console.log('\n  Writing to player_games …');
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      const { error } = await supabase.from('player_games')
        .update({ dst_pts_allowed: u.dst_pts_allowed, half_ppr_raw: u.half_ppr_raw, half_ppr_adjusted: u.half_ppr_adjusted })
        .eq('id', u.id);
      if (error) throw new Error(`Update failed (id=${u.id}): ${error.message}`);
      if ((i + 1) % 50 === 0) console.log(`    ${i + 1}/${updates.length} done…`);
    }
    console.log(`  ✓ ${updates.length} rows updated`);
  }

  // ── 5. Re-run card stats ─────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n[5/5] Running calculate-card-stats --position DST …');
    const result = spawnSync('node', [
      path.join(__dirname, 'calculate-card-stats.js'), '--position', 'DST'
    ], { stdio: 'inherit' });
    if (result.status !== 0) console.error('calc-card-stats exited with', result.status);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`  DST game rows found     : ${dstGames.length}`);
  console.log(`  Rows with pts-allowed   : ${updates.length}`);
  console.log(`  Rows without match      : ${noMatch}`);
  if (DRY_RUN) {
    const avgBonus = updates.reduce((s, u) => s + ptsAllowedBonus(u.dst_pts_allowed), 0) / (updates.length || 1);
    console.log(`  Avg pts-allowed bonus   : +${avgBonus.toFixed(2)} pts/game`);
  }
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('\n✓ Done.');
}

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

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
