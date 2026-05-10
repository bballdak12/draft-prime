'use strict';

// ─── Usage ────────────────────────────────────────────────────────────────────
//   node scripts/import-nflverse-games.js           # full import
//   node scripts/import-nflverse-games.js --dry-run # parse + map, no DB writes
// ─────────────────────────────────────────────────────────────────────────────

const { parse }        = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
const fs               = require('fs');
const path             = require('path');

const STATS_URL     = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';
const SCHEDULES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

const MIN_SEASON      = 1999;
const MAX_SEASON      = 2024;
const BATCH_SIZE      = 500;
const DRY_RUN         = process.argv.includes('--dry-run');
const HEROES_LEGENDS  = process.argv.includes('--heroes-legends');

// nflverse position → our schema position
const POS_MAP = {
  QB: 'QB',
  RB: 'RB', FB: 'RB', HB: 'RB',
  WR: 'WR',
  TE: 'TE',
};

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n')
      .filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

// ─── HTTP fetch with redirect following ──────────────────────────────────────

async function downloadText(url) {
  console.log(`  Fetching ${url.split('/').pop()} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();
  console.log(`  ${(text.length / 1024 / 1024).toFixed(1)} MB downloaded`);
  return text;
}

// ─── Paginate all rows from a Supabase table ─────────────────────────────────

async function fetchAll(supabase, table, select) {
  const PAGE = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from(table).select(select).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Era adjustment multipliers ──────────────────────────────────────────────
// All nflverse data is 1999+, so every multiplier resolves to 1.0 in practice.
// Logic is included for future use with pre-1999 data.

function getEraMultipliers(pos, season) {
  if (pos === 'QB' && season < 1978) {
    return { passYds: 1.15, passTd: 1.10, ints: 0.90, rushYds: 1.0, rushTd: 1.0, rec: 1.0, recYds: 1.0, recTd: 1.0 };
  }
  if (pos === 'RB' && season < 1990) {
    return { passYds: 1.0, passTd: 1.0, ints: 1.0, rushYds: 1.0, rushTd: 1.0, rec: 1.30, recYds: 1.0, recTd: 1.0 };
  }
  if (pos === 'WR' && season < 1990) {
    return { passYds: 1.0, passTd: 1.0, ints: 1.0, rushYds: 1.0, rushTd: 1.0, rec: 1.25, recYds: 1.20, recTd: 1.0 };
  }
  if (pos === 'TE' && season < 1980) {
    return { passYds: 1.0, passTd: 1.0, ints: 1.0, rushYds: 1.0, rushTd: 1.0, rec: 1.35, recYds: 1.25, recTd: 1.0 };
  }
  return { passYds: 1.0, passTd: 1.0, ints: 1.0, rushYds: 1.0, rushTd: 1.0, rec: 1.0, recYds: 1.0, recTd: 1.0 };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function n(v) { return parseFloat(v) || 0; }

function halfPPR(passYds, passTd, ints, rushYds, rushTd, rec, recYds, recTd) {
  return passYds / 25 + passTd * 4 + ints * (-2)
       + rushYds / 10 + rushTd * 6
       + rec * 0.5    + recYds / 10 + recTd * 6;
}

function calcPoints(r, pos, season) {
  const passYds = n(r.passing_yards);
  const passTd  = n(r.passing_tds);
  const ints    = n(r.interceptions);
  const rushYds = n(r.rushing_yards);
  const rushTd  = n(r.rushing_tds);
  const rec     = n(r.receptions);
  const recYds  = n(r.receiving_yards);
  const recTd   = n(r.receiving_tds);

  const raw = halfPPR(passYds, passTd, ints, rushYds, rushTd, rec, recYds, recTd);

  const m   = getEraMultipliers(pos, season);
  const adj = halfPPR(
    passYds * m.passYds,
    passTd  * m.passTd,
    ints    * m.ints,
    rushYds,          // rushing: never adjusted
    rushTd,
    rec    * m.rec,
    recYds * m.recYds,
    recTd
  );

  return { raw: +raw.toFixed(2), adjusted: +adj.toFixed(2) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗');
  if (DRY_RUN) console.log('║  DRY RUN — no DB writes          ║');
  if (DRY_RUN) console.log('╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Build lookup maps ───────────────────────────────────────────────────
  console.log('[1/5] Building lookup maps from database …');

  const allPlayers = await fetchAll(supabase, 'players',        'id, name, position, tier');
  const allSeasons = await fetchAll(supabase, 'player_seasons', 'id, player_id, season_year');

  console.log(`  Players loaded    : ${allPlayers.length.toLocaleString()}`);
  console.log(`  Seasons loaded    : ${allSeasons.length.toLocaleString()}`);

  // When --heroes-legends is set, restrict processing to those player names only.
  // This avoids re-importing the full CSV when we only need to fill gaps for
  // manually-seeded hero/legend cards.
  let hlNameFilter = null;
  if (HEROES_LEGENDS) {
    const { data: hlPlayers, error: hlErr } = await supabase
      .from('players').select('name')
      .in('tier', ['hero', 'legend']).neq('position', 'DST');
    if (hlErr) throw new Error(`hero/legend query: ${hlErr.message}`);
    hlNameFilter = new Set(hlPlayers.map(p => p.name));
    // Add nflverse display-name aliases for hero/legend cards whose DB name differs
    const HL_ALIASES = { 'Michael Vick': 'Mike Vick', 'Steve Smith Sr.': 'Steve Smith' };
    for (const [dbName, nfName] of Object.entries(HL_ALIASES)) {
      if (hlNameFilter.has(dbName)) hlNameFilter.add(nfName);
    }
    console.log(`  Hero/legend name filter: ${hlNameFilter.size} names`);
  }

  // "name|position" → ONE canonical player_id.
  // Prefer gold tier so all game rows link to the gold player_seasons entry.
  // Heroes/legends only have one row so they win by default.
  // CEI/CON/FLR calc will query by player_id and filter seasons by tier later.
  const TIER_PREF = { gold: 3, hero: 2, legend: 2, silver: 1, bronze: 0 };
  const nameToId = {};
  for (const p of allPlayers) {
    if (!POS_MAP[p.position]) continue;
    const key = `${p.name}|${p.position}`;
    const existing = nameToId[key];
    if (!existing || (TIER_PREF[p.tier] ?? 0) > (TIER_PREF[existing.tier] ?? 0)) {
      nameToId[key] = { id: p.id, tier: p.tier };
    }
  }

  // "player_id|season_year" → player_season_id
  const seasonLookup = {};
  for (const s of allSeasons) {
    seasonLookup[`${s.player_id}|${s.season_year}`] = s.id;
  }

  console.log(`  Unique name+pos keys : ${Object.keys(nameToId).length.toLocaleString()}`);

  // ── 2. Download schedules (home/away + game dates) ────────────────────────
  console.log('\n[2/5] Downloading schedules …');
  const schedText = await downloadText(SCHEDULES_URL);
  const schedRows = parse(schedText, { columns: true, skip_empty_lines: true });

  // "season|week|team" → { homeAway, gameDate, opponent }
  const schedLookup = {};
  for (const s of schedRows) {
    const season = parseInt(s.season);
    const week   = parseInt(s.week);
    if (!season || !week) continue;

    const ht = (s.home_team || '').trim();
    const at = (s.away_team || '').trim();
    const gd = s.gameday   || null;
    // neutral-site Super Bowl / London games flagged in the 'location' col if present
    const neutral = s.location && s.location.toLowerCase() === 'neutral';

    if (ht) schedLookup[`${season}|${week}|${ht}`] = {
      homeAway: neutral ? 'neutral' : 'home',
      gameDate: gd,
      opponent: at,
    };
    if (at) schedLookup[`${season}|${week}|${at}`] = {
      homeAway: neutral ? 'neutral' : 'away',
      gameDate: gd,
      opponent: ht,
    };
  }
  console.log(`  Schedule game-team entries : ${Object.keys(schedLookup).length.toLocaleString()}`);

  // ── 3. Download player stats ───────────────────────────────────────────────
  console.log('\n[3/5] Downloading player stats …');
  const statsText = await downloadText(STATS_URL);
  const rows      = parse(statsText, { columns: true, skip_empty_lines: true });
  console.log(`  Total rows in CSV : ${rows.length.toLocaleString()}`);

  // ── 4. Process rows ────────────────────────────────────────────────────────
  console.log('\n[4/5] Processing rows …');

  let processed = 0;
  let skipped   = 0;
  let matched   = 0;   // CSV rows matched to a player_season (= game rows built)
  let inserted  = 0;   // game rows actually upserted (0 in dry-run)

  const batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    // Deduplicate by conflict key — keep last row per (player_season_id, season, week)
    const deduped = [...new Map(batch.map(r => [`${r.player_season_id}|${r.season}|${r.week}`, r])).values()];
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('player_games')
        .upsert(deduped, { onConflict: 'player_season_id,season,week' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }
    inserted += deduped.length;
    batch.length = 0;
  }

  for (const r of rows) {
    processed++;

    if (processed % 1000 === 0) {
      process.stdout.write(
        `\r  ${processed.toLocaleString()} / ${rows.length.toLocaleString()} ` +
        `| matched ${matched.toLocaleString()} | skipped ${skipped.toLocaleString()}`
      );
    }

    // ── Season / week filters ──────────────────────────────────────────────
    const season = parseInt(r.season);
    const week   = parseInt(r.week);
    if (!season || !week)                              { skipped++; continue; }
    if (season < MIN_SEASON || season > MAX_SEASON)    { skipped++; continue; }
    if (week < 1 || week > 22)                         { skipped++; continue; }
    // Accept REG and POST; skip PRE
    const sType = (r.season_type || '').toUpperCase();
    if (sType !== 'REG' && sType !== 'POST')           { skipped++; continue; }

    // ── Position filter (skip K, DST) ──────────────────────────────────────
    const rawPos = (r.position || r.position_group || '').trim();
    const pos    = POS_MAP[rawPos];
    if (!pos)                                          { skipped++; continue; }

    // ── Player lookup ──────────────────────────────────────────────────────
    const name     = (r.player_display_name || r.player_name || '').trim();
    if (hlNameFilter && !hlNameFilter.has(name))       { skipped++; continue; }
    const canonical = nameToId[`${name}|${pos}`];
    if (!canonical)                                    { skipped++; continue; }
    const playerId = canonical.id;

    // ── Schedule data ──────────────────────────────────────────────────────
    const team  = (r.recent_team || '').trim();
    const sched = schedLookup[`${season}|${week}|${team}`] || {};

    // ── Stats ──────────────────────────────────────────────────────────────
    const passAtt  = Math.round(n(r.attempts));
    const passComp = Math.round(n(r.completions));
    const passYds  = Math.round(n(r.passing_yards));
    const passTd   = Math.round(n(r.passing_tds));
    const passInt  = Math.round(n(r.interceptions));
    const rushAtt  = Math.round(n(r.carries));
    const rushYds  = Math.round(n(r.rushing_yards));
    const rushTd   = Math.round(n(r.rushing_tds));
    const targets  = Math.round(n(r.targets));
    const recs     = Math.round(n(r.receptions));
    const recYds   = Math.round(n(r.receiving_yards));
    const recTd    = Math.round(n(r.receiving_tds));

    // ── Injury flag (no snap data — use activity proxy) ───────────────────
    // True if the player had almost no offensive involvement (likely injured
    // or dressed but played < half a drive)
    const totalActivity = passAtt + rushAtt + targets;
    const injuryFlag    = totalActivity < 4;

    // ── Scoring ────────────────────────────────────────────────────────────
    const { raw: halfPprRaw, adjusted: halfPprAdj } = calcPoints(r, pos, season);

    // ── Playoff flag ───────────────────────────────────────────────────────
    // nflverse uses season_type='POST' for playoff games; weeks may also be
    // renumbered 19-22 in some aggregations
    const isPlayoff = sType === 'POST' || week >= 19;

    // ── One game row per matched CSV row ──────────────────────────────────
    // player_season_id comes from the canonical (gold) player's player_seasons.
    // CEI/CON/FLR will later filter eligible seasons per tier via prime_seasons_count.
    const psId = seasonLookup[`${playerId}|${season}`];
    if (!psId) { skipped++; continue; } // player in DB but no season row for this year

    batch.push({
      player_season_id:  psId,
      player_id:         playerId,
      season,
      week,
      game_date:         sched.gameDate  || null,
      opponent:          sched.opponent  || r.opponent_team || null,
      home_away:         sched.homeAway  || null,
      is_playoff:        isPlayoff,

      pass_att:          passAtt,
      pass_comp:         passComp,
      pass_yds:          passYds,
      pass_td:           passTd,
      pass_int:          passInt,
      rush_att:          rushAtt,
      rush_yds:          rushYds,
      rush_td:           rushTd,
      targets,
      receptions:        recs,
      rec_yds:           recYds,
      rec_td:            recTd,

      half_ppr_raw:      halfPprRaw,
      half_ppr_adjusted: halfPprAdj,
      injury_flag:       injuryFlag,
      snaps_played:      null,  // not available in player_stats.csv
    });

    matched++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log(`\n\n[5/5] ${DRY_RUN ? 'Dry-run' : 'Import'} complete.\n`);
  console.log('── Summary ─────────────────────────────────────────────────────');
  console.log(`  CSV rows processed             : ${processed.toLocaleString()}`);
  console.log(`  CSV rows matched (1 row each)  : ${matched.toLocaleString()}`);
  console.log(`  CSV rows skipped (no DB match) : ${skipped.toLocaleString()}`);
  if (DRY_RUN) {
    console.log(`  Game rows that WOULD be inserted: ${matched.toLocaleString()}`);
    console.log('\n  [DRY RUN — nothing written to database]');
  } else {
    console.log(`  Game rows upserted to DB       : ${inserted.toLocaleString()}`);
  }
  console.log('────────────────────────────────────────────────────────────────');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
