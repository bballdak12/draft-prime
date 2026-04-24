'use strict';

const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PLAYER_STATS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';
const PLAYERS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';

const MIN_FPPG = 8;

// Best-season FPPG thresholds per position
const THRESHOLDS = {
  QB:  { gold: 28, silver: 20 },
  RB:  { gold: 18, silver: 12 },
  WR:  { gold: 18, silver: 12 },
  TE:  { gold: 14, silver: 9  },
  K:   { gold: 9,  silver: 7  },
  DST: { gold: 9,  silver: 7  },
};

const PRIME_SEASONS_BY_TIER = { gold: 3, silver: 4, bronze: 5 };

// nflverse position → our schema position (only keep skill positions we model)
const POS_MAP = {
  QB: 'QB',
  RB: 'RB', FB: 'RB', HB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K:  'K',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load .env.local and return key→value map */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

/** Download URL → string (Node 24 built-in fetch, follows redirects) */
async function downloadText(url) {
  console.log(`  Downloading ${url} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  console.log(`  Downloaded ${(text.length / 1024 / 1024).toFixed(1)} MB`);
  return text;
}

/** Half-PPR points for a single row of aggregated season stats */
function halfPPR(stats) {
  return (
    (stats.passing_yards  || 0) / 25 +
    (stats.passing_tds    || 0) * 4  +
    (stats.interceptions  || 0) * -2 +
    (stats.rushing_yards  || 0) / 10 +
    (stats.rushing_tds    || 0) * 6  +
    (stats.receptions     || 0) * 0.5 +
    (stats.receiving_yards || 0) / 10 +
    (stats.receiving_tds  || 0) * 6
  );
}

/** Assign tier from best-season FPPG */
function getTier(pos, bestFppg) {
  const t = THRESHOLDS[pos];
  if (!t) return null;
  if (bestFppg >= t.gold)   return 'gold';
  if (bestFppg >= t.silver) return 'silver';
  if (bestFppg >= MIN_FPPG) return 'bronze';
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 1. Download CSVs ────────────────────────────────────────────────────
  console.log('\n[1/6] Downloading nflverse data …');
  const [statsText, playersText] = await Promise.all([
    downloadText(PLAYER_STATS_URL),
    downloadText(PLAYERS_URL),
  ]);

  // ── 2. Parse CSVs ───────────────────────────────────────────────────────
  console.log('\n[2/6] Parsing CSVs …');
  const statsRows  = parse(statsText,   { columns: true, skip_empty_lines: true });
  const playerRows = parse(playersText, { columns: true, skip_empty_lines: true });
  console.log(`  player_stats rows: ${statsRows.length.toLocaleString()}`);
  console.log(`  players rows     : ${playerRows.length.toLocaleString()}`);

  // Detect weekly vs season-level data by checking for a 'week' column
  const isWeekly = 'week' in statsRows[0];
  console.log(`  Data format: ${isWeekly ? 'weekly (will aggregate to seasons)' : 'season-level'}`);

  // Build supplemental player info map: gsis_id → { team, status, headshot }
  const playerInfoMap = {};
  for (const r of playerRows) {
    const id = r.gsis_id || r.player_id;
    if (id) playerInfoMap[id] = r;
  }

  // ── 3. Aggregate stats by (player_id, season) ───────────────────────────
  console.log('\n[3/6] Aggregating stats …');

  // Map: player_id → { [season]: { ...aggregated } }
  const byPlayerSeason = {};

  for (const r of statsRows) {
    if (r.season_type && r.season_type !== 'REG') continue;

    const pid    = r.player_id;
    const season = parseInt(r.season);
    if (!pid || !season) continue;

    // Normalize position using the row's position field
    const rawPos = r.position || r.position_group || '';
    const pos    = POS_MAP[rawPos];
    if (!pos) continue; // skip defensive players, punters, etc.

    if (!byPlayerSeason[pid])         byPlayerSeason[pid] = {};
    if (!byPlayerSeason[pid][season]) {
      byPlayerSeason[pid][season] = {
        games: 0,
        passing_yards: 0, passing_tds: 0, interceptions: 0,
        rushing_yards: 0, rushing_tds: 0,
        receptions: 0, receiving_yards: 0, receiving_tds: 0,
        fantasy_points: 0,
        pos,
        name: r.player_display_name || r.player_name || '',
        team: r.recent_team || '',
      };
    }

    const agg = byPlayerSeason[pid][season];

    if (isWeekly) {
      // Weekly data: each row = 1 game
      agg.games++;
    } else {
      // Season-level: use 'games' column if present
      const g = parseInt(r.games);
      if (g > 0) agg.games = g;
      else if (agg.games === 0) agg.games = 1;
    }

    agg.passing_yards   += parseFloat(r.passing_yards)   || 0;
    agg.passing_tds     += parseFloat(r.passing_tds)     || 0;
    agg.interceptions   += parseFloat(r.interceptions)   || 0;
    agg.rushing_yards   += parseFloat(r.rushing_yards)   || 0;
    agg.rushing_tds     += parseFloat(r.rushing_tds)     || 0;
    agg.receptions      += parseFloat(r.receptions)      || 0;
    agg.receiving_yards += parseFloat(r.receiving_yards) || 0;
    agg.receiving_tds   += parseFloat(r.receiving_tds)   || 0;
    agg.fantasy_points  += parseFloat(r.fantasy_points)  || 0;

    // Keep most recent team and name
    if (r.recent_team)         agg.team = r.recent_team;
    if (r.player_display_name) agg.name = r.player_display_name;
  }

  // ── 4. Build qualifying player pool ─────────────────────────────────────
  console.log('\n[4/6] Identifying qualifying players …');

  // Map: player_id → { name, pos, team, firstSeason, lastSeason, seasons[] }
  const qualifiedPlayers = {};

  for (const [pid, seasons] of Object.entries(byPlayerSeason)) {
    for (const [yearStr, agg] of Object.entries(seasons)) {
      const year  = parseInt(yearStr);
      const games = agg.games;
      if (games === 0) continue;

      // FPPG: use half-PPR calc for offensive positions; for K fall back to
      // nflverse's pre-calculated fantasy_points (FG/PAT scoring already baked in)
      let points;
      if (agg.pos === 'K') {
        points = agg.fantasy_points; // kicker — no reception component, use pre-calc
      } else {
        points = halfPPR(agg);
      }

      const fppg = points / games;
      if (fppg < MIN_FPPG) continue; // below threshold, skip this season

      if (!qualifiedPlayers[pid]) {
        qualifiedPlayers[pid] = {
          name: agg.name,
          pos:  agg.pos,
          team: agg.team,
          firstSeason: year,
          lastSeason:  year,
          isActive: false,
          seasons: [],
        };
      }

      const qp = qualifiedPlayers[pid];
      qp.seasons.push({ season_year: year, games_played: games, fppg: +fppg.toFixed(2) });

      if (year < qp.firstSeason) qp.firstSeason = year;
      if (year > qp.lastSeason)  {
        qp.lastSeason = year;
        qp.team = agg.team || qp.team;
        qp.name = agg.name || qp.name;
      }
      if (year >= 2023) qp.isActive = true;
    }
  }

  // Supplement team / active status from players.csv where available
  for (const [pid, qp] of Object.entries(qualifiedPlayers)) {
    const info = playerInfoMap[pid];
    if (!info) continue;
    // players.csv 'team' is current team; only override if the player is active
    if (info.team && info.status === 'ACT') qp.team = info.team;
  }

  const totalAboveThreshold = Object.keys(qualifiedPlayers).length;
  console.log(`  Players with ≥${MIN_FPPG} FPPG in at least one season: ${totalAboveThreshold}`);

  // ── 5. Check existing players in DB ─────────────────────────────────────
  console.log('\n[5/6] Checking existing players in database …');
  const { data: existingRows, error: existErr } = await supabase
    .from('players')
    .select('name, position');

  if (existErr) throw new Error(`DB read failed: ${existErr.message}`);

  const existingSet = new Set(
    (existingRows || []).map(r => `${r.name}|${r.position}`)
  );
  console.log(`  Existing players in DB: ${existingSet.size}`);

  // ── 6. Insert new players and their seasons ──────────────────────────────
  console.log('\n[6/6] Inserting new players …');

  const counts = { gold: 0, silver: 0, bronze: 0, skipped: 0, errors: 0 };

  // Process in batches to avoid request size limits
  const BATCH_SIZE = 50;
  const allPlayers = Object.values(qualifiedPlayers);
  const newPlayers = allPlayers.filter(qp => {
    const key = `${qp.name}|${qp.pos}`;
    return !existingSet.has(key);
  });

  counts.skipped = allPlayers.length - newPlayers.length;
  console.log(`  Skipping ${counts.skipped} already-existing players`);
  console.log(`  Inserting ${newPlayers.length} new players in batches of ${BATCH_SIZE} …`);

  for (let i = 0; i < newPlayers.length; i += BATCH_SIZE) {
    const batch = newPlayers.slice(i, i + BATCH_SIZE);

    // Build player records
    const playerRecords = batch.map(qp => {
      const bestFppg = Math.max(...qp.seasons.map(s => s.fppg));
      const tier     = getTier(qp.pos, bestFppg);
      if (!tier) return null; // shouldn't happen since we filtered by MIN_FPPG

      return {
        name:     qp.name,
        position: qp.pos,
        team:     qp.team || null,
        era:      `${qp.firstSeason}-${qp.lastSeason}`,
        tier,
        overall_rating:            null,
        prime_seasons_count:       PRIME_SEASONS_BY_TIER[tier],
        is_active:                 qp.isActive,
        era_adjustment_multiplier: {
          pass_yds: 1.0, pass_tds: 1.0, ints: 1.0,
          rush_yds: 1.0, rush_tds: 1.0,
          rec: 1.0, rec_yds: 1.0, rec_tds: 1.0,
        },
        ceiling:         null,
        consistency:     null,
        floor:           null,
        photo_url:       null,
        card_back_bio:   `Placeholder bio for ${qp.name}. Update with official biography.`,
        card_back_fun_fact: `Placeholder fun fact for ${qp.name}. Update with official fun fact.`,
      };
    }).filter(Boolean);

    if (playerRecords.length === 0) continue;

    // Insert players, get back IDs
    const { data: inserted, error: insertErr } = await supabase
      .from('players')
      .insert(playerRecords)
      .select('id, name, position, tier');

    if (insertErr) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} insert error: ${insertErr.message}`);
      counts.errors += batch.length;
      continue;
    }

    // Update tier counts
    for (const p of inserted) counts[p.tier]++;

    // Build a lookup: "name|pos" → player id
    const idMap = {};
    for (const p of inserted) idMap[`${p.name}|${p.position}`] = p.id;

    // Build season records for this batch
    const seasonRecords = [];
    for (const qp of batch) {
      const playerId = idMap[`${qp.name}|${qp.pos}`];
      if (!playerId) continue;

      // Rank seasons: 1 = highest FPPG
      const sorted = [...qp.seasons].sort((a, b) => b.fppg - a.fppg);
      sorted.forEach((s, idx) => {
        seasonRecords.push({
          player_id:    playerId,
          season_year:  s.season_year,
          games_played: s.games_played,
          fppg:         s.fppg,
          season_rank:  idx + 1,
          is_eligible:  true,
        });
      });
    }

    if (seasonRecords.length > 0) {
      const { error: seasonErr } = await supabase
        .from('player_seasons')
        .insert(seasonRecords);

      if (seasonErr) {
        console.error(`  Season insert error: ${seasonErr.message}`);
        counts.errors++;
      }
    }

    const processed = Math.min(i + BATCH_SIZE, newPlayers.length);
    process.stdout.write(`\r  Progress: ${processed}/${newPlayers.length} players processed`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n\n── Results ─────────────────────────────────────────────');
  console.log(`  Players above ${MIN_FPPG} FPPG threshold: ${totalAboveThreshold}`);
  console.log(`  Skipped (already in DB):  ${counts.skipped}`);
  console.log(`  Inserted — Gold:   ${counts.gold}`);
  console.log(`  Inserted — Silver: ${counts.silver}`);
  console.log(`  Inserted — Bronze: ${counts.bronze}`);
  console.log(`  Total inserted:    ${counts.gold + counts.silver + counts.bronze}`);
  if (counts.errors > 0) console.log(`  Errors: ${counts.errors}`);
  console.log('─────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
