'use strict'

import { buildSlotMap } from './lineup.js'
import { logActivity } from '../activity/logEvent.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round((n || 0) * 100) / 100
}

// PostgREST caps every response at 1000 rows and reports no error when it
// truncates. player_games alone has ~70k rows, and a 12-team roster's prime
// seasons pull well over 1000 of them, so any unbounded select here silently
// loses data — players end up with empty game pools and their starters are
// dropped from the lineup. Every multi-row read below must page.
const PAGE_SIZE = 1000

// Cap on how many ids go into a single .in(...) so the request URL stays sane.
const IN_CHUNK  = 100

/**
 * Drain a query to completion, `PAGE_SIZE` rows at a time.
 * `makeQuery()` must return a fresh builder on every call — builders are
 * single-use once awaited.
 */
async function fetchAllRows(makeQuery, label) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/**
 * Drain a query filtered by `.in(column, values)`, chunking the id list and
 * paging each chunk.
 */
async function fetchAllIn(makeQuery, column, values, label) {
  const rows = []
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK)
    rows.push(...await fetchAllRows(() => makeQuery().in(column, chunk), label))
  }
  return rows
}

/**
 * Pick a random element from an array.  Returns undefined if empty.
 */
function pickRandom(arr) {
  if (!arr.length) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Weighted random draw.  `weightFn` returns a non-negative weight per element;
 * an element with weight 3 is three times as likely to be drawn as weight 1.
 * Falls back to a uniform draw when every weight is zero.
 */
function pickWeighted(arr, weightFn) {
  if (!arr.length) return undefined

  const weights = arr.map(el => Math.max(0, weightFn(el)))
  const total   = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return pickRandom(arr)

  let roll = Math.random() * total
  for (let i = 0; i < arr.length; i++) {
    roll -= weights[i]
    if (roll < 0) return arr[i]
  }
  return arr[arr.length - 1]   // guards against float drift
}

// ---------------------------------------------------------------------------
// selectWeeklyGames
// ---------------------------------------------------------------------------

/**
 * For every drafted player in the league, randomly draw one historical game
 * from their eligible prime-season pool (excluding games already used in
 * prior weeks of this season) and insert a weekly_player_scores row.
 *
 * Rules:
 *  - Eligible game pool  = player_games WHERE season_id IN (prime seasons)
 *                          AND is_eligible = true
 *  - Prime seasons       = player_seasons WHERE season_rank ≤ prime_seasons_count
 *  - Playoff game bonus  = +10 % applied to adjusted_fantasy_points
 *  - If all games used   = fall back to full prime pool (allow reuse)
 *  - Score stored        = adjusted_fantasy_points ?? raw_fantasy_points ?? 0,
 *                          then playoff bonus applied
 *
 * @param {object}  supabase   Supabase client (service role recommended)
 * @param {string}  leagueId
 * @param {number}  week       1-based week number
 * @param {string}  seasonId   UUID of the active app_season
 * @param {object}  [options]
 * @param {number}  [options.playoffBoost=1.1]   Multiplier for historical playoff
 *                    games. Fantasy playoff weeks pass 1.2 (+20 %).
 * @param {number}  [options.playoffWeight=1]    Draw weight for historical playoff
 *                    games relative to regular-season games. > 1 makes them more
 *                    likely to be selected — used during fantasy playoff weeks.
 * @param {string[]|null} [options.onlyUserIds=null]  Restrict scoring to these
 *                    teams. Playoff weeks pass only the teams that actually have
 *                    a matchup, so bye teams don't burn games from their pool.
 * @returns {{ count, teamsProcessed, skipped, sample }}
 */
export async function selectWeeklyGames(supabase, leagueId, week, seasonId, options = {}) {
  const {
    playoffBoost  = 1.1,
    playoffWeight = 1,
    onlyUserIds   = null,
  } = options

  const userFilter = onlyUserIds ? new Set(onlyUserIds) : null
  // ── 1. Find the most-recent COMPLETE draft for this league ──────────────
  const { data: draft, error: draftErr } = await supabase
    .from('drafts')
    .select('id, draft_order')
    .eq('league_id', leagueId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftErr) throw new Error(`Draft lookup failed: ${draftErr.message}`)
  if (!draft)   throw new Error('No complete draft found for this league')

  // ── 2. Load all picks for this draft ────────────────────────────────────
  const { data: picks, error: picksErr } = await supabase
    .from('draft_picks')
    .select('player_id, team_user_id, pick_number, round')
    .eq('draft_id', draft.id)

  if (picksErr)        throw new Error(`Picks lookup failed: ${picksErr.message}`)
  if (!picks?.length)  throw new Error('No picks found for this draft')

  const playerIds = [...new Set(picks.map(p => p.player_id))]

  // ── 3. Load player master data (need prime_seasons_count + position) ────
  const players = await fetchAllIn(
    () => supabase.from('players').select('id, name, position, tier, overall_rating, prime_seasons_count'),
    'id', playerIds, 'Player lookup',
  )

  if (!players.length) throw new Error('No player data found')

  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))

  // ── 4. Load all prime seasons for these players ──────────────────────────
  // is_eligible = true on player_seasons means the season has game data loaded
  // AND season_rank <= prime_seasons_count guards the prime-season boundary
  const allSeasons = await fetchAllIn(
    () => supabase
      .from('player_seasons')
      .select('id, player_id, season_year, season_rank, fppg, is_eligible')
      .eq('is_eligible', true),
    'player_id', playerIds, 'Seasons lookup',
  )

  // Build map: player_id → [season_id, …] (prime seasons with data only)
  const playerPrimeSeasonIds = {}
  for (const s of (allSeasons || [])) {
    const player  = playerMap[s.player_id]
    const maxRank = player?.prime_seasons_count ?? 1
    if (s.season_rank <= maxRank) {
      if (!playerPrimeSeasonIds[s.player_id]) playerPrimeSeasonIds[s.player_id] = []
      playerPrimeSeasonIds[s.player_id].push(s.id)
    }
  }

  const allPrimeSeasonIds = Object.values(playerPrimeSeasonIds).flat()
  if (!allPrimeSeasonIds.length) throw new Error('No prime seasons found for drafted players')

  // ── 5. Load eligible games across all prime seasons ──────────────────────
  // Real column names: player_season_id (FK), half_ppr_adjusted, half_ppr_raw
  // injury_flag = true means the player was injured — exclude those games
  const allGames = await fetchAllIn(
    () => supabase
      .from('player_games')
      .select('id, player_id, player_season_id, season, week, opponent, is_playoff, half_ppr_adjusted, half_ppr_raw')
      .eq('injury_flag', false)
      .order('id', { ascending: true }),
    'player_season_id', allPrimeSeasonIds, 'Games lookup',
  )

  // Build game pool: player_id → [game, …]
  const gamePool = {}
  for (const g of (allGames || [])) {
    if (!gamePool[g.player_id]) gamePool[g.player_id] = []
    gamePool[g.player_id].push(g)
  }

  // Build season metadata map for blurb generation later: season_id → season_year
  const seasonYearMap = Object.fromEntries((allSeasons || []).map(s => [s.id, s.season_year]))

  // ── 6. Load games already used in this season (for exclusion) ───────────
  // A full 17-week 12-team season writes ~1800 of these rows, so this must page
  // too — a truncated read would let already-used games be drawn again.
  const usedRows = await fetchAllRows(
    () => supabase
      .from('weekly_player_scores')
      .select('player_id, game_id')
      .eq('season_id', seasonId)
      .eq('league_id', leagueId)
      .order('id', { ascending: true }),
    'Used-games lookup',
  )

  const usedGameKeys = new Set(usedRows.map(r => `${r.player_id}:${r.game_id}`))

  // ── 7. Check for already-scored rows this week (idempotency guard) ───────
  const { data: existingThisWeek } = await supabase
    .from('weekly_player_scores')
    .select('id')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('week', week)
    .limit(1)

  if (existingThisWeek?.length) {
    return { count: 0, teamsProcessed: 0, skipped: true, reason: `Week ${week} already scored` }
  }

  // ── 8. Build lineup slot maps per team ───────────────────────────────────
  // Group picks by team
  const teamPicks = {}
  for (const pick of picks) {
    if (userFilter && !userFilter.has(pick.team_user_id)) continue
    if (!teamPicks[pick.team_user_id]) teamPicks[pick.team_user_id] = []
    teamPicks[pick.team_user_id].push(pick)
  }

  if (!Object.keys(teamPicks).length) {
    throw new Error('No teams to score — check onlyUserIds against this draft\'s picks')
  }

  const scoresToInsert = []
  let skippedPlayers   = 0

  for (const [userId, userPicks] of Object.entries(teamPicks)) {
    // Resolve full player objects for this team
    const teamPlayers = userPicks
      .map(p => playerMap[p.player_id])
      .filter(Boolean)

    // Build slot assignments (QB, RB, WR, TE, FLEX, DST, K, bench)
    const slotMap = buildSlotMap(teamPlayers)

    for (const pick of userPicks) {
      const { player_id: playerId } = pick
      const pool = gamePool[playerId] ?? []

      if (!pool.length) {
        console.warn(`  ⚠ No games in pool for player ${playerId}`)
        skippedPlayers++
        continue
      }

      // Exclude already-used games; fall back to full pool if exhausted
      const available = pool.filter(g => !usedGameKeys.has(`${playerId}:${g.id}`))
      const drawPool  = available.length > 0 ? available : pool

      // During fantasy playoff weeks, historical playoff games are drawn more
      // often (playoffWeight) and score higher (playoffBoost).
      const game      = pickWeighted(drawPool, g => (g.is_playoff ? playoffWeight : 1))
      // Real column names: half_ppr_adjusted / half_ppr_raw
      const baseScore = game.half_ppr_adjusted ?? game.half_ppr_raw ?? 0
      const score     = round2(game.is_playoff ? baseScore * playoffBoost : baseScore)

      const slotInfo  = slotMap[playerId] ?? {
        isStarter: false,
        slot:      playerMap[playerId]?.position ?? 'BN',
      }

      scoresToInsert.push({
        season_id:        seasonId,
        league_id:        leagueId,
        week,
        user_id:          userId,
        player_id:        playerId,
        player_season_id: game.player_season_id,  // real FK column name
        game_id:          game.id,
        score,
        is_starter:       slotInfo.isStarter,
        slot:             slotInfo.slot,
        game_revealed:    false,
      })

      // Mark this game as used so sibling picks on the same team can't duplicate it
      // (edge case: two players from the same historical "event")
      usedGameKeys.add(`${playerId}:${game.id}`)
    }
  }

  if (!scoresToInsert.length) {
    throw new Error('No scores could be generated — check player_games data')
  }

  // ── 9. Bulk insert in batches of 50 ─────────────────────────────────────
  const BATCH = 50
  for (let i = 0; i < scoresToInsert.length; i += BATCH) {
    const { error: insertErr } = await supabase
      .from('weekly_player_scores')
      .insert(scoresToInsert.slice(i, i + BATCH))
    if (insertErr) throw new Error(`Insert failed (batch ${i / BATCH}): ${insertErr.message}`)
  }

  return {
    count:          scoresToInsert.length,
    teamsProcessed: Object.keys(teamPicks).length,
    skipped:        false,
    skippedPlayers,
    sample:         scoresToInsert.slice(0, 3),
  }
}

// ---------------------------------------------------------------------------
// revealWeeklyGames
// ---------------------------------------------------------------------------

/**
 * Flip game_revealed = true for all player scores in this league/week.
 * Call this once the scoring window closes.
 */
export async function revealWeeklyGames(supabase, leagueId, week) {
  const { error } = await supabase
    .from('weekly_player_scores')
    .update({ game_revealed: true })
    .eq('league_id', leagueId)
    .eq('week', week)

  if (error) throw new Error(`revealWeeklyGames failed: ${error.message}`)
  return { success: true, leagueId, week }
}

// ---------------------------------------------------------------------------
// calculateMatchupScores
// ---------------------------------------------------------------------------

/**
 * After a week is complete:
 *  1. Sum each team's starter scores → update weekly_matchups scores + status
 *  2. Determine winner → upsert league_standings
 *
 * @returns {{ matchupsProcessed, teamScores }}
 */
export async function calculateMatchupScores(supabase, leagueId, week) {
  // ── A. Sum starter scores per team ──────────────────────────────────────
  const { data: starterRows, error: scoresErr } = await supabase
    .from('weekly_player_scores')
    .select('user_id, score')
    .eq('league_id', leagueId)
    .eq('week', week)
    .eq('is_starter', true)

  if (scoresErr) throw new Error(`Score fetch failed: ${scoresErr.message}`)

  const teamScores = {}
  for (const row of (starterRows || [])) {
    teamScores[row.user_id] = round2((teamScores[row.user_id] || 0) + (row.score || 0))
  }

  // ── B. Fetch matchups for this week ──────────────────────────────────────
  const { data: matchups, error: matchupErr } = await supabase
    .from('weekly_matchups')
    .select('id, season_id, home_team_user_id, away_team_user_id')
    .eq('league_id', leagueId)
    .eq('week', week)

  if (matchupErr) throw new Error(`Matchup fetch failed: ${matchupErr.message}`)
  if (!matchups?.length) {
    return { matchupsProcessed: 0, teamScores, warning: 'No matchups found for this week' }
  }

  // Team names for the activity feed (one lookup for all matchups)
  const matchupUserIds = [...new Set(matchups.flatMap(m => [m.home_team_user_id, m.away_team_user_id]))]
  const { data: matchupProfiles } = await supabase
    .from('profiles')
    .select('id, team_name, display_name')
    .in('id', matchupUserIds)
  const nameMap  = Object.fromEntries((matchupProfiles ?? []).map(p => [p.id, p]))
  const teamName = uid => nameMap[uid]?.team_name || nameMap[uid]?.display_name || 'Unknown'

  // ── C. Update each matchup + standings ───────────────────────────────────
  for (const m of matchups) {
    const homeScore = teamScores[m.home_team_user_id] ?? 0
    const awayScore = teamScores[m.away_team_user_id] ?? 0

    // Update matchup row
    const { error: mErr } = await supabase
      .from('weekly_matchups')
      .update({ home_score: homeScore, away_score: awayScore, status: 'complete' })
      .eq('id', m.id)
    if (mErr) throw new Error(`Matchup update failed: ${mErr.message}`)

    // Update standings for both teams
    const sides = [
      { userId: m.home_team_user_id, pf: homeScore, pa: awayScore, win: homeScore > awayScore },
      { userId: m.away_team_user_id, pf: awayScore, pa: homeScore, win: awayScore > homeScore },
    ]

    for (const side of sides) {
      await upsertStandings(supabase, m.season_id, leagueId, side)
    }

    // Activity feed: system event, no actor (needs service-role client)
    await logActivity(supabase, {
      leagueId,
      seasonId:  m.season_id,
      eventType: 'matchup_final',
      payload: {
        week,
        home_name:   teamName(m.home_team_user_id),
        away_name:   teamName(m.away_team_user_id),
        home_score:  homeScore,
        away_score:  awayScore,
        winner_name: homeScore > awayScore ? teamName(m.home_team_user_id)
                   : awayScore > homeScore ? teamName(m.away_team_user_id)
                   : null,
      },
    })
  }

  return { matchupsProcessed: matchups.length, teamScores }
}

// ---------------------------------------------------------------------------
// Internal: upsert one team's standings row
// ---------------------------------------------------------------------------
async function upsertStandings(supabase, seasonId, leagueId, { userId, pf, pa, win }) {
  const { data: current, error: fetchErr } = await supabase
    .from('league_standings')
    .select('*')
    .eq('season_id', seasonId)
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchErr) throw new Error(`Standings fetch failed: ${fetchErr.message}`)

  if (current) {
    // Compute new streak: positive = win streak, negative = lose streak
    const prevStreak    = current.current_streak ?? 0
    const newStreak     = win
      ? (prevStreak >= 0 ? prevStreak + 1 : 1)
      : (prevStreak <= 0 ? prevStreak - 1 : -1)
    const longestStreak = Math.max(current.longest_streak ?? 0, newStreak > 0 ? newStreak : 0)

    const { error: updErr } = await supabase
      .from('league_standings')
      .update({
        wins:            current.wins   + (win ? 1 : 0),
        losses:          current.losses + (win ? 0 : 1),
        points_for:      round2(current.points_for    + pf),
        points_against:  round2(current.points_against + pa),
        current_streak:  newStreak,
        longest_streak:  longestStreak,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', current.id)

    if (updErr) throw new Error(`Standings update failed: ${updErr.message}`)
  } else {
    // First entry for this team this season
    const { error: insErr } = await supabase
      .from('league_standings')
      .insert({
        season_id:       seasonId,
        league_id:       leagueId,
        user_id:         userId,
        wins:            win ? 1 : 0,
        losses:          win ? 0 : 1,
        points_for:      pf,
        points_against:  pa,
        current_streak:  win ? 1 : -1,
        longest_streak:  win ? 1 : 0,
      })

    if (insErr) throw new Error(`Standings insert failed: ${insErr.message}`)
  }
}
