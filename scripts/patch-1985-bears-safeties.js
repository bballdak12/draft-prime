'use strict';

// One-time patch: backfill dst_safety for the 1985 Chicago Bears DST.
// Sources: 1985 Chicago Bears season Wikipedia page + web search.
//
// Regular season safeties (3):
//   1985-10-21  @GNB  W 23-7   Otis Wilson sacked Jim Zorn in endzone
//   1985-11-03  @GNB  W 16-10  Steve McMichael sacked Jim Zorn in endzone
//   1985-11-24   ATL  W 36-0   Henry Waechter sacked Bob Holly in endzone
//
// Playoff safety (1):
//   1986-01-26   NWE  W 46-10  Henry Waechter sacked Steve Grogan (Super Bowl XX)
//
// Note: Week 8 vs MIN W 27-9 had Steve Fuller (Bears QB) tackled in own
// end zone — safety scored BY Minnesota, not by the Bears' DST. Excluded.
//
// Usage: node scripts/patch-1985-bears-safeties.js [--dry-run]

const { createClient } = require('@supabase/supabase-js');
const { spawnSync }    = require('child_process');
const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const SAFETY_BY_DATE = {
  '1985-10-21': 1, // wk  7 @GNB  W 23-7   Wilson sacked Zorn
  '1985-11-03': 1, // wk  9 @GNB  W 16-10  McMichael sacked Zorn
  '1985-11-24': 1, // wk 12  ATL  W 36-0   Waechter sacked Holly
  '1986-01-26': 1, // SB XX  NWE  W 46-10  Waechter sacked Grogan
};

const SAFETY_PTS = 2;

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
    'id, week, game_date, opponent, is_playoff, dst_def_td, dst_safety, half_ppr_raw, half_ppr_adjusted',
    [['player_id', player.id], ['season', 1985]]
  );

  console.log(`\nAll games (${games.length}):`);
  console.log('  wk   date        opp   PO  defTD  sfty  pts');
  for (const g of games.sort((a, b) => a.week - b.week)) {
    const flag = SAFETY_BY_DATE[g.game_date] ? ' ◄' : '';
    console.log(
      `  ${String(g.week).padEnd(4)} ${(g.game_date||'?').padEnd(11)} ` +
      `${(g.opponent||'?').padEnd(5)} ${g.is_playoff?'Y':'N'}` +
      `  ${String(g.dst_def_td).padStart(5)}  ${String(g.dst_safety).padStart(4)}` +
      `  ${String(g.half_ppr_adjusted).padStart(4)}${flag}`
    );
  }

  const updates = [];
  for (const g of games) {
    const newSafety = SAFETY_BY_DATE[g.game_date];
    if (!newSafety) continue;
    const addedPts = newSafety * SAFETY_PTS;
    updates.push({
      id:                g.id,
      dst_safety:        newSafety,
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
    console.log(`  ${g.game_date}  safety: 0 → ${u.dst_safety}  pts: ${g.half_ppr_adjusted} → ${u.half_ppr_adjusted}`);
  }

  if (!DRY_RUN) {
    for (const u of updates) {
      const { error } = await supabase.from('player_games')
        .update({ dst_safety: u.dst_safety, half_ppr_raw: u.half_ppr_raw, half_ppr_adjusted: u.half_ppr_adjusted })
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
