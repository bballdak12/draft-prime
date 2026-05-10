'use strict';

// One-time patch: backfill dst_def_td for the 1969 Minnesota Vikings DST
// using the per-game touchdown log in data/pfr-gamelogs/1969 Minnesota Vikings/
// INT, Fumble and Sacks/sportsref_download (Touchdown log).xls
//
// The PFR import script stored dst_def_td=0 because per-game TD data wasn't
// available from opponent stats. The touchdown log fills that gap.
//
// Defensive TDs identified:
//   1969-10-11  @CHI  W 31-0   1 def TD  (Mike Reilly fumble return)
//   1969-11-22  PIT   W 52-14  2 def TDs (Krause 77yd INT + Beasley 60yd fumble)
//   1969-11-26  @DET  W 27-0   1 def TD  (Alan Page 15yd INT return)
//
// Usage: node scripts/patch-1969-vikings-def-tds.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const DEF_TD_BY_DATE = {
  '1969-10-12': 1, // wk  4 @CHI  W 31-0   Mike Reilly fumble return
  '1969-11-23': 2, // wk 10  PIT  W 52-14  Krause 77yd INT + Beasley 60yd fumble
  '1969-11-27': 1, // wk 11 @DET  W 27-0   Alan Page 15yd INT (Thanksgiving)
};

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
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

async function main() {
  if (DRY_RUN) console.log('╔══════════════════════════════════╗\n║  DRY RUN — no DB writes          ║\n╚══════════════════════════════════╝\n');

  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Find the 1969 Vikings DST player
  const { data: players, error: pErr } = await supabase
    .from('players')
    .select('id, name')
    .eq('position', 'DST')
    .ilike('name', '%1969%Vikings%');
  if (pErr) throw new Error(pErr.message);
  if (!players?.length) throw new Error('No 1969 Vikings DST card found in players table');
  const player = players[0];
  console.log(`Player: ${player.name} (id=${player.id})`);

  // Load all 1969 regular season games for this player
  const games = await fetchAll(supabase, 'player_games',
    'id, week, game_date, opponent, home_away, dst_sacks, dst_int, dst_fumble_rec, dst_def_td, dst_safety, half_ppr_raw, half_ppr_adjusted',
    [['player_id', player.id], ['season', 1969], ['is_playoff', false]]
  );
  console.log(`\nCurrent regular season games (${games.length}):`);
  console.log('  week  date        opp   sacks  int  fum  defTD  pts');
  for (const g of games.sort((a, b) => a.week - b.week)) {
    const flag = DEF_TD_BY_DATE[g.game_date] ? ' ◄' : '';
    console.log(
      `  ${String(g.week).padEnd(5)} ${(g.game_date || '?').padEnd(11)} ` +
      `${(g.opponent || '?').padEnd(5)} ` +
      `${String(g.dst_sacks).padStart(5)}  ` +
      `${String(g.dst_int).padStart(3)}  ` +
      `${String(g.dst_fumble_rec).padStart(3)}  ` +
      `${String(g.dst_def_td).padStart(5)}  ` +
      `${String(g.half_ppr_adjusted).padStart(4)}` +
      flag
    );
  }

  // Build updated rows
  const updates = [];
  for (const g of games) {
    const newDefTd = DEF_TD_BY_DATE[g.game_date];
    if (!newDefTd) continue;
    const addedPts = newDefTd * 6;
    updates.push({
      id:                g.id,
      dst_def_td:        newDefTd,
      half_ppr_raw:      +(g.half_ppr_raw      + addedPts).toFixed(2),
      half_ppr_adjusted: +(g.half_ppr_adjusted + addedPts).toFixed(2),
    });
  }

  if (!updates.length) {
    console.log('\nNo games matched the target dates — check game_date values in DB.');
    return;
  }

  console.log(`\nPatching ${updates.length} rows:`);
  for (const u of updates) {
    const g = games.find(x => x.id === u.id);
    console.log(`  ${g.game_date}  defTD: 0 → ${u.dst_def_td}  pts: ${g.half_ppr_adjusted} → ${u.half_ppr_adjusted}`);
  }

  if (!DRY_RUN) {
    for (const u of updates) {
      const { error } = await supabase.from('player_games')
        .update({ dst_def_td: u.dst_def_td, half_ppr_raw: u.half_ppr_raw, half_ppr_adjusted: u.half_ppr_adjusted })
        .eq('id', u.id);
      if (error) throw new Error(`Update failed: ${error.message}`);
    }
    console.log('  ✓ player_games updated');

    console.log('\nRunning calculate-card-stats --position DST …');
    const result = spawnSync('node', [
      path.join(__dirname, 'calculate-card-stats.js'), '--position', 'DST'
    ], { stdio: 'inherit' });
    if (result.status !== 0) console.error('calc-card-stats exited with', result.status);
  }

  console.log('\n✓ Done.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
