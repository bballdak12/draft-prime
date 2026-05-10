'use strict';

// Usage: node scripts/audit-pre1999-gaps.js
//
// Audits hero/legend skill position (QB/RB/WR/TE) cards for pre-1999 data gaps.
// Produces three sections:
//   A: Cards with non-null OVR stats but missing pre-1999 fppg data
//   B: Cards with null OVR stats entirely (no game data at all)
//   C: Subset of A where pre-1999 seasons were likely the career PEAK

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const TIER_PREF       = { gold: 3, hero: 2, legend: 2, silver: 1, bronze: 0 };

// Hero/legend display name → gold card name alias map
const CARD_NAME_ALIASES = {
  'Michael Vick|QB':    'Mike Vick|QB',
  'Steve Smith Sr.|WR': 'Steve Smith|WR',
};

// Known career context for Section C analysis
// Format: { peakEnd: last year of career peak, note: explanation }
const CAREER_CONTEXT = {
  'Emmitt Smith|RB':    { peakEnd: 1996, note: 'Peaked 1991-1996; post-1999 was clear decline' },
  'Jerry Rice|WR':      { peakEnd: 1995, note: 'Peaked 1987-1995; post-1999 was decline phase' },
  'Cris Carter|WR':     { peakEnd: 1999, note: 'Peaked 1994-1999; borderline — 1999 straddles cutoff' },
  'Michael Irvin|WR':   { peakEnd: 1995, note: 'Peaked 1991-1995; only 1 post-1999 season (1999)' },
  'Brett Favre|QB':     { peakEnd: 1997, note: 'Peaked 1994-1997; post-1999 still strong but not peak' },
  'Shannon Sharpe|TE':  { peakEnd: 2001, note: 'Peaked 1996-2001; straddles boundary — mostly post-1999' },
  'Marshall Faulk|RB':  { peakEnd: 2001, note: 'Peaked 1999-2001; mostly post-1999 — fine' },
  'Marvin Harrison|WR': { peakEnd: 2006, note: 'Pre-1999 was early career (1996-1998); peaked 1999-2006 — fine' },
  'Randy Moss|WR':      { peakEnd: 2004, note: '1998 was rookie year only; peaked 1998-2004 — mostly fine' },
};

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

// ─── Supabase pagination helpers ──────────────────────────────────────────────

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
  const PAGE  = 1000;
  const all   = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    let from = 0;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Load all players ───────────────────────────────────────────────────
  console.log('[1/5] Loading all players …');
  const allPlayers = await fetchAll(supabase, 'players',
    'id, name, position, tier, prime_seasons_count, ceiling, overall_rating, era');
  console.log(`  Total players: ${allPlayers.length}`);

  // Filter to hero/legend skill positions only
  const hlPlayers = allPlayers.filter(p =>
    ['hero', 'legend'].includes(p.tier) && SKILL_POSITIONS.has(p.position)
  );
  console.log(`  Hero/legend skill-pos players: ${hlPlayers.length}`);

  // ── 2. Build canonical gold player_id map ────────────────────────────────
  // "name|pos" → { id, tier }  —  highest TIER_PREF wins (gold beats hero/legend)
  console.log('\n[2/5] Building canonical gold player_id map …');
  const canonicalMap = {};
  for (const p of allPlayers) {
    if (!SKILL_POSITIONS.has(p.position)) continue;
    const key = `${p.name}|${p.position}`;
    const cur = canonicalMap[key];
    if (!cur || (TIER_PREF[p.tier] ?? -1) > (TIER_PREF[cur.tier] ?? -1)) {
      canonicalMap[key] = { id: p.id, tier: p.tier, name: p.name };
    }
  }

  // ── 3. Load player_seasons for all hero/legend cards ─────────────────────
  console.log('\n[3/5] Loading player_seasons for hero/legend cards …');
  const hlIds = hlPlayers.map(p => p.id);
  const allSeasons = await fetchAllIn(supabase, 'player_seasons',
    'id, player_id, season_year, games_played, fppg', 'player_id', hlIds);
  console.log(`  Season rows loaded: ${allSeasons.length}`);

  // Group seasons by player_id
  const seasonsByPlayer = {};
  for (const s of allSeasons) {
    (seasonsByPlayer[s.player_id] ||= []).push(s);
  }

  // ── 4. Load player_games for canonical (gold) player_ids ─────────────────
  console.log('\n[4/5] Loading player_games for canonical player_ids …');
  // Resolve canonical id for each hero/legend
  const canonicalIdSet = new Set();
  for (const p of hlPlayers) {
    const key      = `${p.name}|${p.position}`;
    const aliasKey = CARD_NAME_ALIASES[key] ?? key;
    const canon    = canonicalMap[aliasKey] ?? canonicalMap[key];
    if (canon) canonicalIdSet.add(canon.id);
  }
  const canonicalIds = [...canonicalIdSet];
  console.log(`  Unique canonical player_ids: ${canonicalIds.length}`);

  const allGames = await fetchAllIn(supabase, 'player_games',
    'player_id, season, half_ppr_adjusted', 'player_id', canonicalIds);
  console.log(`  Game rows loaded: ${allGames.length.toLocaleString()}`);

  // Group games: canonicalId → season_year → [half_ppr_adjusted values]
  const gamesByCanonSeason = {};
  for (const g of allGames) {
    const bySeason = (gamesByCanonSeason[g.player_id] ||= {});
    (bySeason[g.season] ||= []).push(g.half_ppr_adjusted ?? 0);
  }

  // ── 5. Compute effective fppg per season, rank, and classify ─────────────
  console.log('\n[5/5] Analyzing players …\n');

  const sectionA = []; // has OVR + pre-1999 null fppg gaps
  const sectionB = []; // null OVR entirely
  const sectionC = []; // subset of A where pre-1999 was likely the peak

  for (const p of hlPlayers) {
    const key      = `${p.name}|${p.position}`;
    const aliasKey = CARD_NAME_ALIASES[key] ?? key;
    const canon    = canonicalMap[aliasKey] ?? canonicalMap[key];
    const canonId  = canon?.id;

    const seasons  = seasonsByPlayer[p.id] || [];
    const isLegend = p.tier === 'legend';
    const primeCt  = p.prime_seasons_count ?? (isLegend ? 2 : 3);

    // Compute effective fppg per season
    const scoredSeasons = seasons.map(s => {
      const games = (canonId && gamesByCanonSeason[canonId]?.[s.season_year]) || [];
      let effectiveFppg;
      if (games.length > 0) {
        effectiveFppg = mean(games);
      } else {
        effectiveFppg = s.fppg ?? null; // null means truly missing
      }
      return {
        season_year:    s.season_year,
        fppg_stored:    s.fppg,
        has_game_data:  games.length > 0,
        effective_fppg: effectiveFppg,
        game_count:     games.length,
      };
    });

    // Sort by effective fppg descending (null/0 goes to bottom)
    scoredSeasons.sort((a, b) => (b.effective_fppg ?? 0) - (a.effective_fppg ?? 0));

    // Determine top-N seasons (isLegend uses 2, others use primeCt)
    const topN = isLegend ? 2 : primeCt;

    // Find pre-1999 seasons with null fppg (no game data AND no stored fppg)
    const pre1999NullSeasons = scoredSeasons.filter(
      s => s.season_year < 1999 && s.effective_fppg === null
    );

    // Check if card has non-null OVR stats (overall_rating not null)
    const hasOvr = p.overall_rating !== null;

    if (!hasOvr) {
      // Section B: no OVR at all
      const post1999Seasons = scoredSeasons.filter(s => s.season_year >= 1999);
      sectionB.push({
        name:    p.name,
        pos:     p.position,
        tier:    p.tier,
        seasons: scoredSeasons,
        hasPost1999: post1999Seasons.length > 0,
        post1999Count: post1999Seasons.length,
      });
    } else if (pre1999NullSeasons.length > 0) {
      // Section A: has OVR but also has pre-1999 seasons with missing data
      const topSeasons = scoredSeasons.slice(0, topN);

      // Career context for Section C
      const contextKey = `${p.name}|${p.position}`;
      const ctx = CAREER_CONTEXT[contextKey];

      // Determine if pre-1999 era was the likely peak
      // i.e., player's known peak ended before 1999
      const likelyPeakPre1999 = ctx && ctx.peakEnd < 1999;

      // Check if any of the used top-N seasons are post-1999 decline years
      // (i.e., the pre-1999 gaps mean we MIGHT be using decline years instead)
      const topHasPost1999Seasons = topSeasons.some(s => s.season_year >= 1999);
      const missingPre1999Years = pre1999NullSeasons.map(s => s.season_year).sort();

      sectionA.push({
        name:                p.name,
        pos:                 p.position,
        tier:                p.tier,
        overall_rating:      p.overall_rating,
        topN,
        topSeasons,
        missingPre1999Years,
        allSeasonsCount:     scoredSeasons.length,
        likelyPeakPre1999,
        topHasPost1999Seasons,
        ctx,
      });

      // Section C: likely using decline years
      if (likelyPeakPre1999 && topHasPost1999Seasons) {
        sectionC.push({
          name:           p.name,
          pos:            p.position,
          tier:           p.tier,
          overall_rating: p.overall_rating,
          topSeasons,
          missingPre1999Years,
          ctx,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT
  // ═══════════════════════════════════════════════════════════════════════════

  const line = '═'.repeat(72);
  const dash = '─'.repeat(72);

  console.log(line);
  console.log('SECTION A: Cards with non-null OVR stats AND pre-1999 null fppg gaps');
  console.log(line);

  if (!sectionA.length) {
    console.log('  (none)');
  } else {
    for (const p of sectionA) {
      console.log(`\n  ${p.name} [${p.tier.toUpperCase()}] ${p.pos}  OVR=${p.overall_rating}`);
      console.log(`  ${dash.slice(0, 60)}`);
      console.log(`  Top-${p.topN} seasons used for card (sorted by effective fppg):`);
      for (const s of p.topSeasons) {
        const fppgStr  = s.effective_fppg !== null ? s.effective_fppg.toFixed(2).padStart(6) : '  NULL';
        const source   = s.has_game_data
          ? `(${s.game_count} games)`
          : (s.fppg_stored !== null ? '(stored fppg)' : '(NO DATA)');
        const preMark  = s.season_year < 1999 ? ' <pre99' : '';
        console.log(`    ${s.season_year}  fppg=${fppgStr}  ${source}${preMark}`);
      }
      console.log(`  Missing pre-1999 years (null fppg): ${p.missingPre1999Years.join(', ')}`);

      // Career context note
      if (p.ctx) {
        const label = p.likelyPeakPre1999 ? '  *** Likely peak pre-1999 ***' : '  Note: Probably fine —';
        console.log(`  ${label} ${p.ctx.note}`);
      } else {
        // No explicit context — infer from data
        const pre1999Top = p.topSeasons.filter(s => s.season_year < 1999);
        if (pre1999Top.length > 0) {
          console.log(`  Context: Pre-1999 seasons appear in top-${p.topN} — data gaps may affect ranking`);
        } else {
          console.log(`  Context: Early career, probably fine — top seasons are all post-1998`);
        }
      }
    }
  }

  console.log(`\n\n${line}`);
  console.log('SECTION B: Cards with null OVR stats entirely (no usable game data)');
  console.log(line);

  if (!sectionB.length) {
    console.log('  (none)');
  } else {
    const colName = 'Name'.padEnd(28);
    const colTier = 'Tier'.padEnd(8);
    const colPos  = 'Pos'.padEnd(5);
    console.log(`\n  ${colName} ${colTier} ${colPos} Post-1999 seasons?`);
    console.log(`  ${dash.slice(0, 60)}`);
    for (const p of sectionB) {
      const post = p.hasPost1999
        ? `Yes (${p.post1999Count} seasons) — nflverse data may exist under different name`
        : 'No — entirely pre-1999 career';
      console.log(`  ${p.name.padEnd(28)} ${p.tier.padEnd(8)} ${p.pos.padEnd(5)} ${post}`);
    }
  }

  console.log(`\n\n${line}`);
  console.log('SECTION C: Section A players where career peak was pre-1999 (likely using DECLINE years)');
  console.log(line);

  if (!sectionC.length) {
    console.log('  (none — no players in Section A clearly peaked before 1999 while using post-1999 seasons)');
  } else {
    for (const p of sectionC) {
      console.log(`\n  *** ${p.name} [${p.tier.toUpperCase()}] ${p.pos}  OVR=${p.overall_rating} ***`);
      console.log(`  ${p.ctx.note}`);
      console.log(`  Missing pre-1999 data: ${p.missingPre1999Years.join(', ')}`);
      console.log(`  Current top-${p.topSeasons.length} seasons (the ones actually used):`);
      for (const s of p.topSeasons) {
        const fppgStr  = s.effective_fppg !== null ? s.effective_fppg.toFixed(2).padStart(6) : '  NULL';
        const source   = s.has_game_data
          ? `(${s.game_count} games)`
          : (s.fppg_stored !== null ? '(stored fppg)' : '(NO DATA)');
        const flag = s.season_year >= 1999 ? ' <-- POST-PEAK year being used as prime' : ' <-- peak year (pre-1999)';
        console.log(`    ${s.season_year}  fppg=${fppgStr}  ${source}${flag}`);
      }
      console.log(`  ACTION NEEDED: Manually backfill ${p.missingPre1999Years.length} pre-1999 season(s) to get true peak data.`);
    }
  }

  console.log(`\n\n${line}`);
  console.log('SUMMARY');
  console.log(line);
  console.log(`  Hero/legend skill-pos cards analyzed : ${hlPlayers.length}`);
  console.log(`  Section A (OVR + pre-1999 gaps)      : ${sectionA.length}`);
  console.log(`  Section B (null OVR entirely)         : ${sectionB.length}`);
  console.log(`  Section C (likely using decline years): ${sectionC.length}`);
  console.log('');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
