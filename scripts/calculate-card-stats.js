'use strict';

// Usage:
//   node scripts/calculate-card-stats.js [--position QB|RB|WR|TE|K|DST]
// Calculates CEI (ceiling), CON (consistency %), FLR (floor), overall_rating
// for every player card and writes results to the players table.
// Also updates season_rank and is_eligible on player_seasons.

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const POSITION   = (() => { const i = process.argv.indexOf('--position'); return i >= 0 ? process.argv[i + 1] : null; })();
const BATCH_SIZE = 200;
const TIER_PREF  = { gold: 3, hero: 2, legend: 2, silver: 1, bronze: 0 };
const GAME_POS   = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

// Some hero/legend cards have different display names than nflverse (and therefore
// different DB names than their gold counterparts).  Map "our DB name|pos" →
// "gold card name|pos" so the canonical game-row lookup finds the right rows.
const CARD_NAME_ALIASES = {
  'Michael Vick|QB':    'Mike Vick|QB',
  'Steve Smith Sr.|WR': 'Steve Smith|WR',
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

async function fetchAllIn(supabase, table, select, col, values) {
  if (!values.length) return [];
  const CHUNK = 100;
  const all = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(table).select(select).in(col, chunk).order('id').range(from, from + PAGE - 1);
      if (error) throw new Error(`fetchAllIn(${table}): ${error.message}`);
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return all;
}

function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

async function processPosition(supabase, pos) {
  const bar = '═'.repeat(Math.max(0, 42 - pos.length));
  console.log(`\n══ ${pos} ${bar}`);

  const players = await fetchAll(supabase, 'players',
    'id, name, position, tier, prime_seasons_count', [['position', pos]]);
  console.log(`  Players: ${players.length}`);
  if (!players.length) return;

  // Canonical map: name|pos → { id, tier }  (highest tier wins)
  const canonicalMap = {};
  for (const p of players) {
    const key = `${p.name}|${p.position}`;
    const cur = canonicalMap[key];
    if (!cur || (TIER_PREF[p.tier] ?? -1) > (TIER_PREF[cur.tier] ?? -1)) {
      canonicalMap[key] = { id: p.id, tier: p.tier };
    }
  }
  const canonicalIds = [...new Set(Object.values(canonicalMap).map(v => v.id))];

  // Load player_seasons for every player card of this position
  const allPlayerIds = players.map(p => p.id);
  const allSeasons   = await fetchAllIn(supabase, 'player_seasons',
    'id, player_id, season_year, games_played, fppg', 'player_id', allPlayerIds);
  const seasonsByPlayer = {};
  for (const s of allSeasons) (seasonsByPlayer[s.player_id] ||= []).push(s);

  // Load player_games for all positions that have game-level data
  const gamesByCanonSeason = {}; // canonicalId → season_year → [games]
  if (GAME_POS.has(pos)) {
    console.log(`  Loading games for ${canonicalIds.length} canonical players …`);
    const allGames = await fetchAllIn(supabase, 'player_games',
      'player_id, season, half_ppr_adjusted, injury_flag', 'player_id', canonicalIds);
    console.log(`  Games: ${allGames.length.toLocaleString()}`);
    for (const g of allGames) {
      const bySeason = (gamesByCanonSeason[g.player_id] ||= {});
      (bySeason[g.season] ||= []).push(g);
    }
  }

  const playerUpdates = []; // { id, ceiling, consistency, floor, avg_fppg }
  const seasonUpdates = []; // { id, season_rank, is_eligible }

  for (const p of players) {
    const key       = `${p.name}|${p.position}`;
    const canonical = canonicalMap[CARD_NAME_ALIASES[key] ?? key] ?? canonicalMap[key];
    const seasons   = seasonsByPlayer[p.id] || [];
    const primeCt   = p.prime_seasons_count ?? 3;

    // Resolve fppg per season: prefer actual game average when available,
    // fall back to stored fppg (used by K/DST pre-1999 cards with no game data)
    const scoredSeasons = seasons.map(s => {
      let fppg = s.fppg ?? 0;
      if (GAME_POS.has(pos)) {
        const games = gamesByCanonSeason[canonical.id]?.[s.season_year] || [];
        if (games.length) fppg = mean(games.map(g => g.half_ppr_adjusted ?? 0));
      }
      return { ...s, fppg };
    }).filter(s => s.fppg > 0);

    if (!scoredSeasons.length) continue;

    scoredSeasons.sort((a, b) => b.fppg - a.fppg);

    const isLegend = p.tier === 'legend' && GAME_POS.has(pos);

    // Legends mark 2 seasons eligible; all others use prime_seasons_count
    const eligibleSeasonCount = isLegend ? 2 : primeCt;
    for (let i = 0; i < scoredSeasons.length; i++) {
      seasonUpdates.push({ id: scoredSeasons[i].id, player_id: scoredSeasons[i].player_id,
                           season_year: scoredSeasons[i].season_year,
                           season_rank: i + 1, is_eligible: i < eligibleSeasonCount });
    }

    let allElGames, avgFppg, bySeasonGames;

    if (isLegend) {
      // ── Legend eligible-game pool ──────────────────────────────────────────────
      // Base: all games from the 2 best seasons.
      // Bonus: up to 5 highest half_ppr_adjusted non-injured games from every
      //        other season, selected globally (not per-season).
      const primeSeasons = scoredSeasons.slice(0, 2);
      const primeYears   = new Set(primeSeasons.map(s => s.season_year));

      const primeGames = primeSeasons.flatMap(s =>
        gamesByCanonSeason[canonical.id]?.[s.season_year] ?? []
      );

      const bonusGames = scoredSeasons
        .filter(s => !primeYears.has(s.season_year))
        .flatMap(s => gamesByCanonSeason[canonical.id]?.[s.season_year] ?? [])
        .filter(g => !g.injury_flag)
        .sort((a, b) => (b.half_ppr_adjusted ?? 0) - (a.half_ppr_adjusted ?? 0))
        .slice(0, 5);

      allElGames = [...primeGames, ...bonusGames];
      avgFppg    = allElGames.length
        ? +mean(allElGames.map(g => g.half_ppr_adjusted ?? 0)).toFixed(2)
        : 0;

    } else {
      // ── Standard eligible-game pool ───────────────────────────────────────────
      const eligibleSeasons = scoredSeasons.slice(0, primeCt);
      avgFppg       = +mean(eligibleSeasons.map(s => s.fppg)).toFixed(2);
      bySeasonGames = {};
      allElGames    = [];
      for (const s of eligibleSeasons) {
        const games = gamesByCanonSeason[canonical.id]?.[s.season_year] || [];
        bySeasonGames[s.season_year] = { fppg: s.fppg, games };
        allElGames.push(...games);
      }
    }

    // No game data (pre-1999 DST/K, or any card with no imported games) —
    // rating comes from stored fppg only; CEI/CON/FLR stay null
    if (!allElGames.length) {
      playerUpdates.push({ id: p.id, ceiling: null, consistency: null, floor: null, avg_fppg: avgFppg });
      continue;
    }

    // CEI: average of top-5 adjusted scores across eligible pool
    const sortedDesc = allElGames.map(g => g.half_ppr_adjusted ?? 0).sort((a, b) => b - a);
    const cei = +mean(sortedDesc.slice(0, 5)).toFixed(2);

    // FLR: average of bottom-5 non-injured scores across eligible pool
    const nonInjAsc = allElGames
      .filter(g => !g.injury_flag)
      .map(g => g.half_ppr_adjusted ?? 0)
      .sort((a, b) => a - b);
    const flr = +mean(nonInjAsc.slice(0, 5)).toFixed(2);

    // CON: Legends use pool mean as baseline; others use per-season average
    let con;
    if (isLegend) {
      // % of pool games within ±20% of the combined-pool mean
      const lo = avgFppg * 0.8, hi = avgFppg * 1.2;
      const within = allElGames.filter(g => {
        const s = g.half_ppr_adjusted ?? 0;
        return s >= lo && s <= hi;
      }).length;
      con = allElGames.length > 0 ? +((within / allElGames.length) * 100).toFixed(1) : 0;
    } else {
      // % within ±20% of THAT season's average
      let total = 0, within = 0;
      for (const { fppg: ref, games } of Object.values(bySeasonGames)) {
        if (!ref || ref <= 0) continue;
        const lo = ref * 0.8, hi = ref * 1.2;
        for (const g of games) {
          total++;
          const score = g.half_ppr_adjusted ?? 0;
          if (score >= lo && score <= hi) within++;
        }
      }
      con = total > 0 ? +((within / total) * 100).toFixed(1) : 0;
    }

    playerUpdates.push({ id: p.id, ceiling: cei, consistency: con, floor: flr, avg_fppg: avgFppg });
  }

  console.log(`  Cards computed: ${playerUpdates.length}`);

  // Normalize overall_rating 60–99 within this position (all tiers together)
  const fppgs = playerUpdates.map(u => u.avg_fppg).filter(f => f > 0);
  const minF  = Math.min(...fppgs);
  const maxF  = Math.max(...fppgs);
  const range = maxF - minF;
  for (const u of playerUpdates) {
    u.overall_rating = range > 0
      ? Math.max(60, Math.min(99, 60 + Math.round(((u.avg_fppg - minF) / range) * 39)))
      : 75;
  }

  // Sample output
  console.log('\n  ── Sample (5 cards) ─────────────────────────────────────────────────');
  for (const u of playerUpdates.slice(0, 5)) {
    const p    = players.find(x => x.id === u.id);
    const name = (p?.name ?? '?').padEnd(32);
    const tier = (p?.tier ?? '?').padEnd(6);
    const cei  = String(u.ceiling   ?? 'n/a').padStart(5);
    const con  = String(u.consistency ?? 'n/a').padStart(5);
    const flr  = String(u.floor     ?? 'n/a').padStart(5);
    console.log(`  ${name} [${tier}] CEI=${cei}  CON=${con}%  FLR=${flr}  OVR=${u.overall_rating}  fppg=${u.avg_fppg}`);
  }

  // Write card stats to players table
  console.log('\n  Writing to players …');
  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const pRows = playerUpdates.map(u => {
    const p = playerById[u.id];
    return { id: u.id, name: p.name, position: p.position, tier: p.tier,
             ceiling: u.ceiling, consistency: u.consistency, floor: u.floor,
             overall_rating: u.overall_rating };
  });
  for (let i = 0; i < pRows.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('players')
      .upsert(pRows.slice(i, i + BATCH_SIZE), { onConflict: 'id' });
    if (error) throw new Error(`players upsert: ${error.message}`);
  }
  console.log(`  ✓ ${pRows.length} player cards updated`);

  // Write season_rank + is_eligible to player_seasons
  console.log('  Writing to player_seasons …');
  for (let i = 0; i < seasonUpdates.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('player_seasons')
      .upsert(seasonUpdates.slice(i, i + BATCH_SIZE), { onConflict: 'id' });
    if (error) throw new Error(`player_seasons upsert: ${error.message}`);
  }
  console.log(`  ✓ ${seasonUpdates.length} season rows updated`);
}

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const positions = POSITION ? [POSITION] : ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  console.log(`Processing: ${positions.join(', ')}\n`);
  for (const pos of positions) await processPosition(supabase, pos);
  console.log('\n✓ All done.');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
