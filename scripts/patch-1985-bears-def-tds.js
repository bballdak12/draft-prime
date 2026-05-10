'use strict';

// One-time patch: backfill dst_def_td for the 1985 Chicago Bears DST
// Source: data/pfr-gamelogs/1985 Bears/sportsref_download (Touchdown Log).xls
//
// Defensive TDs identified (regular season):
//   1985-09-08  TAM  W 38-28   1 def TD  (Frazier 29yd INT return)
//   1985-10-27  MIN  W 27-9    1 def TD  (Wilson 23yd INT return)
//   1985-11-17  @DAL W 44-0    2 def TDs (Dent 1yd INT + Richardson 36yd INT)
//   1985-12-22  @DET W 37-17   1 def TD  (Rivera 5yd fumble return)
//
// Playoff def TDs (Reggie Phillips IntTD + Wilber Marshall FRTD) cannot be
// placed per-game without a playoff touchdown log — skipped for now.
//
// Safeties (McMichael, Wilson, Waechter regular; Waechter playoff) are not
// in the touchdown log and cannot be placed per-game — skipped for now.
//
// Usage: node scripts/patch-1985-bears-def-tds.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const DEF_TD_BY_DATE = {
  '1985-09-08': 1, // wk  1  TAM  W 38-28  Frazier 29yd INT return
  '1985-10-27': 1, // wk  8  MIN  W 27-9   Wilson 23yd INT return
  '1985-11-17': 2, // wk 11 @DAL  W 44-0   Dent 1yd INT + Richardson 36yd INT
  '1985-12-22': 1, // wk 16 @DET  W 37-17  Rivera 5yd fumble return
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

  const { data: players } = await supabase.from('players').select('id, name')
    .eq('position', 'DST').ilike('name', '%1985%Bears%');
  if (!players?.length) throw new Error('1985 Chicago Bears DST not found');
  const player = players[0];
  console.log(`Player: ${player.name} (id=${player.id})`);

  const games = await fetchAll(supabase, 'player_games',
    'id, week, game_date, opponent, is_playoff, dst_sacks, dst_int, dst_fumble_rec, dst_def_td, dst_safety, half_ppr_raw, half_ppr_adjusted',
    [['player_id', player.id], ['season', 1985]]
  );

  console.log(`\nAll games (${games.length}):`);
  console.log('  wk   date        opp   PO  sacks  int  fum  defTD  sfty  pts');
  for (const g of games.sort((a, b) => a.week - b.week)) {
    const flag = DEF_TD_BY_DATE[g.game_date] ? ' ◄' : '';
    console.log(
      `  ${String(g.week).padEnd(4)} ${(g.game_date||'?').padEnd(11)} ` +
      `${(g.opponent||'?').padEnd(5)} ${g.is_playoff?'Y':'N'}` +
      `  ${String(g.dst_sacks).padStart(5)}  ${String(g.dst_int).padStart(3)}` +
      `  ${String(g.dst_fumble_rec).padStart(3)}  ${String(g.dst_def_td).padStart(5)}` +
      `  ${String(g.dst_safety).padStart(4)}  ${String(g.half_ppr_adjusted).padStart(4)}${flag}`
    );
  }

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
    console.log('\nNo games matched — check game_date values in DB.');
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
