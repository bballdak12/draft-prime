'use strict';

// Update player_games dst_def_td and dst_safety from scraped PFR box score
// scoring summaries (data/pfr-scoring-summaries.json), then recalculate
// half_ppr_raw and half_ppr_adjusted from raw stats + pts-allowed bracket.
//
// Source format:
//   { "<pid>|<ssn>": { pid, ssn, nick, games: [{ wk, defTd, safety, ... }] } }
//
// Usage: node scripts/import-pfr-scoring-summaries.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/pfr-scoring-summaries.json');
const DRY_RUN   = process.argv.includes('--dry-run');

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

function recalcDstPts(g, defTd, safety) {
  const base =
      (g.dst_sacks      || 0) * 1
    + (g.dst_tfl        || 0) / 3
    + (g.dst_int        || 0) * 2
    + (g.dst_fumble_rec || 0) * 2
    + defTd * 6
    + safety * 2;
  return +(base + ptsAllowedBonus(g.dst_pts_allowed)).toFixed(2);
}

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const scoring = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const cards = Object.values(scoring);
  console.log(`[1/3] Loaded ${cards.length} cards from ${path.basename(DATA_FILE)}`);

  let totalGames = 0, totalUpdates = 0, mismatches = 0, errors = 0;
  const summary = [];

  for (const card of cards) {
    const { data: games, error } = await supabase.from('player_games')
      .select('id, week, dst_sacks, dst_tfl, dst_int, dst_fumble_rec, dst_def_td, dst_safety, dst_pts_allowed, half_ppr_raw, half_ppr_adjusted')
      .eq('player_id', card.pid).eq('season', card.ssn);
    if (error) throw new Error(`fetch failed for ${card.pid}|${card.ssn}: ${error.message}`);

    const byWeek = Object.fromEntries(games.map(g => [g.week, g]));
    let cardUpdates = 0, cardTd = 0, cardSf = 0;

    for (const sg of card.games) {
      totalGames++;
      const g = byWeek[sg.wk];
      if (!g) { mismatches++; continue; }
      if (sg.error) { errors++; continue; }
      const newDefTd  = sg.td  ?? sg.defTd  ?? 0;
      const newSafety = sg.sf  ?? sg.safety ?? 0;
      cardTd += newDefTd; cardSf += newSafety;
      // Only update if values change
      if (g.dst_def_td === newDefTd && g.dst_safety === newSafety) continue;
      const newPts = recalcDstPts(g, newDefTd, newSafety);
      if (!DRY_RUN) {
        const { error: upErr } = await supabase.from('player_games')
          .update({ dst_def_td: newDefTd, dst_safety: newSafety,
                    half_ppr_raw: newPts, half_ppr_adjusted: newPts })
          .eq('id', g.id);
        if (upErr) throw new Error(`update failed (id=${g.id}): ${upErr.message}`);
      }
      cardUpdates++; totalUpdates++;
    }

    summary.push(`  ${card.ssn} ${card.nick.padEnd(12)} games=${card.games.length}  TDs=${cardTd}  sfty=${cardSf}  rows updated: ${cardUpdates}`);
  }

  console.log('\n[2/3] Per-card summary:');
  summary.forEach(s => console.log(s));
  console.log(`\n  Totals: cards=${cards.length}  games=${totalGames}  updates=${totalUpdates}  mismatches=${mismatches}  errors=${errors}`);

  if (!DRY_RUN) {
    console.log('\n[3/3] Running calculate-card-stats --position DST …');
    const result = spawnSync('node', [
      path.join(__dirname, 'calculate-card-stats.js'), '--position', 'DST'
    ], { stdio: 'inherit' });
    if (result.status !== 0) console.error('calc-card-stats exited with', result.status);
  }

  console.log('\n✓ Done.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
