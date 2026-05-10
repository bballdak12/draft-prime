'use strict';

// Display final card stats for all Legend and Hero cards (all positions).
// Sorted by overall_rating descending.

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
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

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Fetch all legend/hero cards
  let from = 0;
  const PAGE = 1000;
  const cards = [];
  while (true) {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, position, tier, prime_seasons_count, overall_rating, ceiling, consistency, floor')
      .in('tier', ['legend', 'hero'])
      .order('overall_rating', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    cards.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Total legend/hero cards: ${cards.length}`);

  const playerIds = cards.map(c => c.id);

  // Fetch all eligible seasons for these players
  const allSeasons = await fetchAllIn(supabase, 'player_seasons',
    'id, player_id, season_year, is_eligible', 'player_id', playerIds);

  // Fetch all games for these players
  const allGames = await fetchAllIn(supabase, 'player_games',
    'player_id, season, half_ppr_adjusted, injury_flag', 'player_id', playerIds);

  // Build: player_id → season → [games]
  const gamesBySeason = {};
  for (const g of allGames) {
    const bySeason = (gamesBySeason[g.player_id] ||= {});
    (bySeason[g.season] ||= []).push(g);
  }

  // Compute avg_fppg and eligible_game_count per card
  // For legend (prime_seasons_count → use 2 eligible seasons + bonus logic handled by calc-card-stats)
  // For simplicity here: avg of all games in eligible seasons
  const cardStats = {};
  for (const c of cards) {
    const eligSeasons = allSeasons
      .filter(s => s.player_id === c.id && s.is_eligible)
      .map(s => s.season_year);

    let eligGames = [];
    for (const yr of eligSeasons) {
      const games = gamesBySeason[c.id]?.[yr] ?? [];
      eligGames.push(...games);
    }

    const avgFppg = eligGames.length
      ? +mean(eligGames.map(g => g.half_ppr_adjusted ?? 0)).toFixed(2)
      : null;

    cardStats[c.id] = { avgFppg, eligGameCount: eligGames.length };
  }

  // Header
  console.log('\n' + '─'.repeat(115));
  console.log('  Name                             Pos  Tier    OVR  fppg    CEI    CON      FLR   EligGames');
  console.log('─'.repeat(115));

  for (const c of cards) {
    const st   = cardStats[c.id] ?? {};
    const name = (c.name ?? '').padEnd(32);
    const pos  = (c.position ?? '').padEnd(4);
    const tier = (c.tier ?? '').padEnd(6);
    const ovr  = String(c.overall_rating ?? '--').padStart(3);
    const fppg = st.avgFppg != null ? String(st.avgFppg).padStart(6) : '    --';
    const cei  = c.ceiling   != null ? String(c.ceiling).padStart(6)      : '   n/a';
    const con  = c.consistency != null ? `${String(c.consistency).padStart(5)}%` : '    n/a';
    const flr  = c.floor    != null ? String(c.floor).padStart(6)      : '   n/a';
    const eg   = String(st.eligGameCount ?? 0).padStart(6);
    console.log(`  ${name} ${pos} ${tier} ${ovr} ${fppg} ${cei} ${con}  ${flr}    ${eg}`);
  }
  console.log('─'.repeat(115));
}

main().catch(err => { console.error(err.message, err.stack); process.exit(1); });
