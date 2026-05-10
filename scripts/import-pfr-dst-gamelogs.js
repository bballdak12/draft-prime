'use strict';

// Import per-game DST stats from PFR opponent-stats XLS files
// for pre-1999 DST hero/legend cards.
//
// The XLS files are the *opponent's* per-game offensive stats, which from
// our defense's perspective means:
//   pass_sacked   → defensive sacks
//   pass_int      → defensive interceptions
//   fumbles_lost  → defensive fumble recoveries
//
// def_td and safety are not available per game for these eras — stored as 0.
// TFL is not tracked historically — stored as 0.
//
// Folder detection: any subfolder of data/pfr-gamelogs/ whose name starts
// with a 4-digit year is treated as a DST team folder and matched to a DST
// card in the players table.
//
// Usage:
//   node scripts/import-pfr-dst-gamelogs.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '../data/pfr-gamelogs');
const BATCH_SIZE = 200;
const DRY_RUN    = process.argv.includes('--dry-run');

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

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

// ─── HTML-as-XLS parser ───────────────────────────────────────────────────────

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '')
          .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
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

// ─── Scoring ──────────────────────────────────────────────────────────────────

function n(v) { return parseFloat(v) || 0; }

function calcDstPoints(sacks, ints, fumble) {
  // tfl, defTd, safety not available for historical seasons
  return +(sacks * 1 + ints * 2 + fumble * 2).toFixed(2);
}

// ─── Folder → DST player matching ─────────────────────────────────────────────
// Folder names like "1985 Bears" or "1976 Pittsburgh Steelers" are matched
// to DB player names like "1985 Chicago Bears DST" by year + keyword overlap.

function matchFolderToDst(folderName, dstPlayers) {
  const m = folderName.match(/^(\d{4})\s+(.+)$/);
  if (!m) return null;
  const year     = parseInt(m[1]);
  const keywords = m[2].toLowerCase().split(/\s+/).filter(Boolean);

  const candidates = dstPlayers.filter(p => {
    if (!p.name.startsWith(String(year))) return false;
    const norm = p.name.toLowerCase();
    return keywords.some(kw => norm.includes(kw));
  });

  if (!candidates.length) return null;
  if (candidates.length === 1) return { player: candidates[0], year };

  // Multiple candidates — pick best keyword overlap
  candidates.sort((a, b) => {
    const na = a.name.toLowerCase(), nb = b.name.toLowerCase();
    return keywords.filter(kw => nb.includes(kw)).length
         - keywords.filter(kw => na.includes(kw)).length;
  });
  return { player: candidates[0], year };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Load DB lookup data ──────────────────────────────────────────────────
  console.log('[1/4] Loading DB data …');

  const dstPlayers  = await fetchAll(supabase, 'players',        'id, name, position, tier', [['position', 'DST']]);
  const dstSeasons  = await fetchAll(supabase, 'player_seasons', 'id, player_id, season_year');

  const dstIds = new Set(dstPlayers.map(p => p.id));
  // player_id|season_year → player_season_id
  const seasonLookup = {};
  for (const s of dstSeasons) {
    if (dstIds.has(s.player_id)) seasonLookup[`${s.player_id}|${s.season_year}`] = s.id;
  }
  console.log(`  DST cards: ${dstPlayers.length}  season rows: ${dstSeasons.filter(s => dstIds.has(s.player_id)).length}`);

  // ── 2. Discover DST folders (year-prefixed) ─────────────────────────────────
  console.log('\n[2/4] Scanning pfr-gamelogs for DST folders …');

  const allFolders = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{4}\s/.test(e.name))
    .map(e => e.name);

  console.log(`  Year-prefixed folders: ${allFolders.join(', ')}`);

  const folderMatches = [];
  for (const folder of allFolders) {
    const match = matchFolderToDst(folder, dstPlayers);
    if (!match) {
      console.log(`  ✗ No DB match for folder: ${folder}`);
      continue;
    }
    const psId = seasonLookup[`${match.player.id}|${match.year}`];
    if (!psId) {
      console.log(`  ✗ No player_season for ${match.player.name} season ${match.year}`);
      continue;
    }
    folderMatches.push({ folder, player: match.player, year: match.year, psId });
    console.log(`  ✓ ${folder.padEnd(30)} → ${match.player.name}  [${match.player.tier}]`);
  }

  if (!folderMatches.length) {
    console.log('\nNo DST folders matched. Exiting.');
    return;
  }

  // ── 3. Parse XLS files and build game rows ──────────────────────────────────
  console.log('\n[3/4] Parsing XLS files …');

  const gameRows = [];

  for (const { folder, player, year, psId } of folderMatches) {
    const folderPath = path.join(DATA_DIR, folder);
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.xls'))
      .sort();

    let totalGames = 0;
    for (const file of files) {
      const isPlayoff = file !== 'sportsref_download.xls';
      const filePath  = path.join(folderPath, file);
      const rows      = parseXls(filePath);

      console.log(`  ${folder}/${file}: ${rows.length} rows  [${isPlayoff ? 'playoffs' : 'regular'}]`);

      for (const row of rows) {
        const week   = parseInt(row.week_num);
        const date   = row.date || null;
        const sacks  = n(row.pass_sacked);
        const ints   = n(row.pass_int);
        const fumble = n(row.fumbles_lost);
        const pts    = calcDstPoints(sacks, ints, fumble);
        const opp    = row.opp_name_abbr || null;
        const loc    = row.game_location === '@' ? 'away' : 'home';

        gameRows.push({
          player_season_id:  psId,
          player_id:         player.id,
          season:            year,
          week,
          game_date:         date,
          opponent:          opp,
          home_away:         loc,
          is_playoff:        isPlayoff,
          dst_sacks:         +sacks.toFixed(1),
          dst_tfl:           0,
          dst_int:           Math.round(ints),
          dst_fumble_rec:    Math.round(fumble),
          dst_def_td:        0,
          dst_safety:        0,
          half_ppr_raw:      pts,
          half_ppr_adjusted: pts,
          injury_flag:       false,
        });
        totalGames++;
      }
    }
    console.log(`  → ${totalGames} total games for ${player.name}`);
  }

  console.log(`\n  Total game rows: ${gameRows.length}`);

  // ── 4. Upsert to player_games ───────────────────────────────────────────────
  console.log('\n[4/4] Upserting to player_games …');

  if (DRY_RUN) {
    console.log('  DRY RUN — showing first 5 rows:');
    for (const r of gameRows.slice(0, 5)) {
      console.log(`    season=${r.season} week=${r.week} opp=${r.opponent} playoff=${r.is_playoff} sacks=${r.dst_sacks} int=${r.dst_int} fum=${r.dst_fumble_rec} pts=${r.half_ppr_adjusted}`);
    }
  } else {
    let inserted = 0;
    for (let i = 0; i < gameRows.length; i += BATCH_SIZE) {
      const { error } = await supabase.from('player_games')
        .upsert(gameRows.slice(i, i + BATCH_SIZE), { onConflict: 'player_season_id,season,week' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      inserted += Math.min(BATCH_SIZE, gameRows.length - i);
    }
    console.log(`  ✓ ${inserted} rows upserted`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────────');
  for (const { folder, player } of folderMatches) {
    const mine = gameRows.filter(r => r.player_id === player.id);
    const reg  = mine.filter(r => !r.is_playoff).length;
    const post = mine.filter(r =>  r.is_playoff).length;
    const avg  = mine.length ? (mine.reduce((s, r) => s + r.half_ppr_adjusted, 0) / mine.length).toFixed(1) : '—';
    console.log(`  ${player.name.padEnd(35)} ${String(reg).padStart(2)} reg + ${post} playoff  avg=${avg} fpts`);
  }
  console.log('─────────────────────────────────────────────────────────────────');

  // ── Run calc-card-stats for DST ──────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\nRunning calculate-card-stats --position DST …');
    const result = spawnSync('node', [
      path.join(__dirname, 'calculate-card-stats.js'), '--position', 'DST'
    ], { stdio: 'inherit' });
    if (result.status !== 0) console.error('calc-card-stats exited with', result.status);
  }

  console.log('\n✓ Done.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
