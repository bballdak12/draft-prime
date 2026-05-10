'use strict';

// Import per-game stats from Pro Football Reference HTML-as-XLS game log files.
//
// File structure:
//   data/pfr-gamelogs/{Player Name}/sportsref_download.xls          (regular season)
//   data/pfr-gamelogs/{Player Name}/sportsref_download (Playoffs).xls  (playoffs)
//   data/pfr-gamelogs/{Player Name}/sportsref_download (playoffs).xls  (alternate casing)
//
// The .xls files are HTML tables with an Excel XML namespace header.
// Columns are identified by data-stat attributes — not position indices —
// so the parser is resilient to PFR adding or reordering columns.
//
// Usage:
//   node scripts/import-pfr-gamelogs.js           # full import
//   node scripts/import-pfr-gamelogs.js --dry-run # parse + map, no DB writes

const { createClient } = require('@supabase/supabase-js');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '../data/pfr-gamelogs');
const BATCH_SIZE = 200;
const DRY_RUN    = process.argv.includes('--dry-run');

const TIER_PREF = { gold: 3, hero: 2, legend: 2, silver: 1, bronze: 0 };

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
// Uses data-stat attributes to name each cell — immune to column order changes.
// Returns an array of plain objects, one per data row (header/separator rows skipped).

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '')
          .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function parseXls(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  for (const [, rowContent] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (!rowContent.includes('<td')) continue; // pure header rows have only <th>
    const cells = [...rowContent.matchAll(/<td[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi)];
    if (!cells.length) continue;
    const row = Object.fromEntries(
      cells.map(([, stat, inner]) => [stat, stripHtml(inner)])
    );
    // Skip separator rows (no date) and mid-table re-header rows (date = "Date")
    if (!row.date || row.date === 'Date' || !row.week_num) continue;
    rows.push(row);
  }
  return rows;
}

// ─── Name normalization for fuzzy matching ────────────────────────────────────

function normalizeName(name) {
  return name.toLowerCase().replace(/[.\s'\-]/g, '');
}

// ─── Season from date ─────────────────────────────────────────────────────────
// PFR dates are YYYY-MM-DD.  Games in Jan–Jul belong to the prior NFL season
// (e.g. Super Bowl on 1980-01-20 is the 1979 season).

function seasonFromDate(dateStr) {
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  return m < 8 ? y - 1 : y;
}

// ─── Era adjustments ─────────────────────────────────────────────────────────

function getEraMultipliers(pos, season) {
  if (pos === 'QB' && season < 1978)
    return { passYds: 1.15, passTd: 1.10, ints: 0.90, rec: 1.0, recYds: 1.0 };
  if (pos === 'RB' && season < 1990)
    return { passYds: 1.0, passTd: 1.0, ints: 1.0, rec: 1.30, recYds: 1.0 };
  if (pos === 'WR' && season < 1990)
    return { passYds: 1.0, passTd: 1.0, ints: 1.0, rec: 1.25, recYds: 1.20 };
  if (pos === 'TE' && season < 1980)
    return { passYds: 1.0, passTd: 1.0, ints: 1.0, rec: 1.35, recYds: 1.25 };
  return { passYds: 1.0, passTd: 1.0, ints: 1.0, rec: 1.0, recYds: 1.0 };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function n(v) { return parseFloat(v) || 0; }

function halfPPR(passYds, passTd, ints, rushYds, rushTd, rec, recYds, recTd) {
  return passYds / 25 + passTd * 4 + ints * (-2)
       + rushYds / 10 + rushTd * 6
       + rec * 0.5    + recYds / 10 + recTd * 6;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    console.log('╔══════════════════════════════════╗');
    console.log('║  DRY RUN — no DB writes          ║');
    console.log('╚══════════════════════════════════╝\n');
  }

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Build lookup maps ─────────────────────────────────────────────────────
  console.log('[1/5] Building lookup maps …');

  const allPlayers = await fetchAll(supabase, 'players',        'id, name, position, tier');
  const allSeasons = await fetchAll(supabase, 'player_seasons', 'id, player_id, season_year');

  console.log(`  Players: ${allPlayers.length.toLocaleString()}  Seasons: ${allSeasons.length.toLocaleString()}`);

  // Exact key: "Name|POS" → canonical player (highest tier wins)
  const nameToId = {};
  for (const p of allPlayers) {
    const key = `${p.name}|${p.position}`;
    const cur = nameToId[key];
    if (!cur || (TIER_PREF[p.tier] ?? 0) > (TIER_PREF[cur.tier] ?? 0)) {
      nameToId[key] = { id: p.id, tier: p.tier, position: p.position, dbName: p.name };
    }
  }

  // Normalised key: "normalizedname|POS" → same canonical player (for fuzzy match)
  const normToId = {};
  for (const [key, val] of Object.entries(nameToId)) {
    const [name, pos] = key.split('|');
    const nk = `${normalizeName(name)}|${pos}`;
    const cur = normToId[nk];
    if (!cur || (TIER_PREF[val.tier] ?? 0) > (TIER_PREF[cur.tier] ?? 0)) {
      normToId[nk] = val;
    }
  }

  // "player_id|season_year" → player_season_id
  const seasonLookup = {};
  for (const s of allSeasons) {
    seasonLookup[`${s.player_id}|${s.season_year}`] = s.id;
  }

  // ── 2. Discover player folders ───────────────────────────────────────────────
  console.log('\n[2/5] Discovering PFR game log folders …');

  if (!fs.existsSync(DATA_DIR)) throw new Error(`PFR data directory not found: ${DATA_DIR}`);

  const playerFolders = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`  Folders found: ${playerFolders.join(', ')}`);

  // ── 3. Process each player ───────────────────────────────────────────────────
  console.log('\n[3/5] Processing game logs …\n');

  const globalBatch    = [];
  let totalRows        = 0;
  let totalMatched     = 0;
  let totalSkipped     = 0;
  let totalInserted    = 0;
  const positionsFound = new Set();
  const playerSummary  = [];

  async function flushBatch() {
    if (!globalBatch.length) return;
    const deduped = [...new Map(
      globalBatch.map(r => [`${r.player_season_id}|${r.season}|${r.week}`, r])
    ).values()];
    if (!DRY_RUN) {
      const { error } = await supabase.from('player_games')
        .upsert(deduped, { onConflict: 'player_season_id,season,week' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }
    totalInserted += deduped.length;
    globalBatch.length = 0;
  }

  for (const folderName of playerFolders) {
    const folderPath = path.join(DATA_DIR, folderName);
    console.log(`  ── ${folderName} ──`);

    // Name → DB player: exact match first, then normalised fuzzy match
    let canonical = null;
    for (const pos of ['RB', 'QB', 'WR', 'TE']) {
      canonical = nameToId[`${folderName}|${pos}`]
               || normToId[`${normalizeName(folderName)}|${pos}`]
               || null;
      if (canonical) break;
    }

    if (!canonical) {
      console.warn(`    WARN — no DB record matching "${folderName}" (tried all skill positions)`);
      playerSummary.push({ name: folderName, pos: '?', rows: 0, matched: 0, skipped: 0, noMatch: true });
      continue;
    }

    const { id: playerId, position: pos, dbName } = canonical;
    positionsFound.add(pos);
    const matchLabel = dbName !== folderName ? `${folderName} → "${dbName}"` : folderName;
    console.log(`    DB match: ${matchLabel} → ${playerId}  [${pos}]`);

    // Find XLS files (case-insensitive on "playoffs")
    const files = fs.readdirSync(folderPath);
    const regFile     = files.find(f => f.toLowerCase() === 'sportsref_download.xls');
    const playoffFile = files.find(f =>
      f.toLowerCase() === 'sportsref_download (playoffs).xls'
    );

    const toProcess = [];
    if (regFile)     toProcess.push({ file: regFile,     isPlayoff: false });
    if (playoffFile) toProcess.push({ file: playoffFile, isPlayoff: true  });

    if (!toProcess.length) {
      console.log('    SKIP — no XLS files found in folder');
      playerSummary.push({ name: folderName, pos, rows: 0, matched: 0, skipped: 0 });
      continue;
    }

    let playerRows = 0, playerMatched = 0, playerSkipped = 0;

    for (const { file, isPlayoff } of toProcess) {
      const filePath = path.join(folderPath, file);
      const label    = isPlayoff ? 'playoffs' : 'regular';
      console.log(`    Parsing ${file} (${label}) …`);

      let rows;
      try {
        rows = parseXls(filePath);
      } catch (e) {
        console.error(`    ERROR parsing ${file}: ${e.message}`);
        continue;
      }

      console.log(`      Data rows parsed: ${rows.length}`);

      for (const row of rows) {
        playerRows++;

        const dateStr = row.date || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { playerSkipped++; continue; }
        const season = seasonFromDate(dateStr);

        const week = parseInt(row.week_num || '0', 10);
        if (!week || week < 1) { playerSkipped++; continue; }

        const psId = seasonLookup[`${playerId}|${season}`];
        if (!psId) {
          // No matching player_season for this year — normal for years outside era
          playerSkipped++;
          continue;
        }

        // Stats from data-stat keys
        const rushAtt = Math.round(n(row.rush_att));
        const rushYds = Math.round(n(row.rush_yds));
        const rushTd  = Math.round(n(row.rush_td));
        // targets: blank in pre-target-tracking era (~pre-1992)
        const targetsRaw = row.targets !== '' ? Math.round(n(row.targets)) : null;
        const rec     = Math.round(n(row.rec));
        const recYds  = Math.round(n(row.rec_yds));
        const recTd   = Math.round(n(row.rec_td));
        const passCmp = Math.round(n(row.pass_cmp));
        const passAtt = Math.round(n(row.pass_att));
        const passYds = Math.round(n(row.pass_yds));
        const passTd  = Math.round(n(row.pass_td));
        const passInt = Math.round(n(row.pass_int));

        const homeAway = (row.game_location || '').trim() === '@' ? 'away' : 'home';
        const opponent = (row.opp_name_abbr || '').trim() || null;

        // Injury flag: use targets if tracked, else fall back to receptions as proxy
        const touchProxy = targetsRaw !== null ? targetsRaw : rec;
        const injuryFlag = (passAtt + rushAtt + touchProxy) < 4;

        // Scoring — raw
        const raw = halfPPR(passYds, passTd, passInt, rushYds, rushTd, rec, recYds, recTd);

        // Scoring — era-adjusted
        const m   = getEraMultipliers(pos, season);
        const adj = halfPPR(
          passYds * m.passYds,
          passTd  * m.passTd,
          passInt * m.ints,
          rushYds,          // rushing never adjusted
          rushTd,
          rec    * m.rec,
          recYds * m.recYds,
          recTd
        );

        globalBatch.push({
          player_season_id:  psId,
          player_id:         playerId,
          season,
          week,
          game_date:         dateStr,
          opponent,
          home_away:         homeAway,
          is_playoff:        isPlayoff,

          pass_att:          passAtt,
          pass_comp:         passCmp,
          pass_yds:          passYds,
          pass_td:           passTd,
          pass_int:          passInt,
          rush_att:          rushAtt,
          rush_yds:          rushYds,
          rush_td:           rushTd,
          targets:           targetsRaw,
          receptions:        rec,
          rec_yds:           recYds,
          rec_td:            recTd,

          half_ppr_raw:      +raw.toFixed(2),
          half_ppr_adjusted: +adj.toFixed(2),
          injury_flag:       injuryFlag,
          snaps_played:      null,
        });

        playerMatched++;
        if (globalBatch.length >= BATCH_SIZE) await flushBatch();
      }
    }

    console.log(`    Rows: ${playerRows}  Matched: ${playerMatched}  Skipped: ${playerSkipped}`);
    playerSummary.push({ name: folderName, dbName, pos, rows: playerRows, matched: playerMatched, skipped: playerSkipped });

    totalRows    += playerRows;
    totalMatched += playerMatched;
    totalSkipped += playerSkipped;
  }

  await flushBatch();

  // ── 4. Run calculate-card-stats.js for affected positions ────────────────────
  if (!DRY_RUN && positionsFound.size > 0) {
    console.log('\n[4/5] Running calculate-card-stats.js for affected positions …');
    for (const pos of positionsFound) {
      console.log(`  Processing ${pos} …`);
      const result = spawnSync(
        'node',
        ['scripts/calculate-card-stats.js', '--position', pos],
        { cwd: path.join(__dirname, '..'), stdio: 'inherit', encoding: 'utf8' }
      );
      if (result.status !== 0) {
        console.error(`  ERROR: calculate-card-stats exited ${result.status} for ${pos}`);
      }
    }
  }

  // ── 5. Summary ───────────────────────────────────────────────────────────────
  console.log(`\n\n[5/5] ${DRY_RUN ? 'Dry-run' : 'Import'} complete.\n`);

  console.log('── Per-player summary ──────────────────────────────────────────────');
  for (const s of playerSummary) {
    if (s.noMatch) {
      console.log(`  ${'⚠ ' + s.name.padEnd(20)} [?]    NO DB MATCH`);
    } else {
      const rw = String(s.rows).padStart(4);
      const mk = String(s.matched).padStart(4);
      const sk = String(s.skipped).padStart(3);
      console.log(`  ${s.name.padEnd(22)} [${s.pos}]  rows=${rw}  matched=${mk}  skipped=${sk}`);
    }
  }

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`  Total data rows parsed   : ${totalRows.toLocaleString()}`);
  console.log(`  Total matched to DB      : ${totalMatched.toLocaleString()}`);
  console.log(`  Total skipped (no season): ${totalSkipped.toLocaleString()}`);
  if (DRY_RUN) {
    console.log(`  Game rows WOULD upsert   : ${totalMatched.toLocaleString()}`);
    console.log('\n  [DRY RUN — nothing written to database]');
  } else {
    console.log(`  Game rows upserted       : ${totalInserted.toLocaleString()}`);
  }

  // Card stats for matched players (after calculate-card-stats has run)
  const matchedNames = playerSummary.filter(s => !s.noMatch && s.matched > 0).map(s => s.dbName ?? s.name);
  if (!DRY_RUN && matchedNames.length) {
    const { data: cards, error: cardErr } = await supabase
      .from('players')
      .select('name, position, tier, ceiling, consistency, floor, overall_rating')
      .in('name', matchedNames);

    if (!cardErr && cards?.length) {
      // Best card per player = highest overall_rating
      const bestByName = {};
      for (const c of cards) {
        const cur = bestByName[c.name];
        if (!cur || (c.overall_rating ?? 0) > (cur.overall_rating ?? 0)) bestByName[c.name] = c;
      }

      console.log('\n── Card ratings ────────────────────────────────────────────────────');
      for (const [, c] of Object.entries(bestByName)) {
        const cei = String(c.ceiling    ?? 'n/a').padStart(5);
        const con = String(c.consistency ?? 'n/a').padStart(5);
        const flr = String(c.floor      ?? 'n/a').padStart(5);
        const ovr = String(c.overall_rating ?? 'n/a').padStart(3);
        console.log(
          `  ${c.name.padEnd(22)} [${(c.tier ?? '?').padEnd(6)}]` +
          `  CEI=${cei}  CON=${con}%  FLR=${flr}  OVR=${ovr}`
        );
      }
    }
  }
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
