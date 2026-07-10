'use strict'

/**
 * Playoff scoring (weeks 15-17).
 *
 * Reuses the regular-season engine — selectWeeklyGames draws each roster's
 * historical games, and starter scores are summed the same way — but writes
 * results to playoff_matchups instead of weekly_matchups, and differs in three
 * ways during playoff weeks:
 *
 *   1. Historical playoff games score +20 % (regular season: +10 %).
 *   2. Historical playoff games are weighted 3× in the selection pool.
 *   3. Only teams with a live matchup are scored — a team on a first-round bye
 *      does not burn games from its pool.
 *
 * `supabase` must be a service-role client.
 */

import { selectWeeklyGames, revealWeeklyGames } from '../scoring/gameSelector.js'
import { normalizeSlots } from './bracketGenerator.js'
import { awardBadge } from '../badges/awardBadge.js'
import { logActivity } from '../activity/logEvent.js'

export const PLAYOFF_BOOST  = 1.2   // +20 % on historical playoff games
export const PLAYOFF_WEIGHT = 3     // 3× more likely to be drawn
export const FINAL_ROUND    = 3

function round2(n) {
  return Math.round((n || 0) * 100) / 100
}

const MATCHUP_SELECT = `
  id, bracket_id, week, round, status,
  high_seed_user_id, low_seed_user_id, high_seed, low_seed,
  high_score, low_score, winner_user_id,
  feeds_into_matchup_id, feeds_into_slot,
  playoff_brackets ( bracket_type )
`.trim()

// ---------------------------------------------------------------------------
// runPlayoffWeek
// ---------------------------------------------------------------------------

/**
 * Score one playoff week end to end: draw games for the teams playing, reveal
 * them, settle every matchup, advance winners, award badges.
 *
 * @returns {{ week, teams, matchupsProcessed, results, champion }}
 */
export async function runPlayoffWeek(supabase, leagueId, week, seasonId) {
  const live = await liveMatchups(supabase, leagueId, week, seasonId)

  if (!live.length) {
    return { week, teams: [], matchupsProcessed: 0, results: [], champion: null,
             warning: `No playable matchups in week ${week}` }
  }

  const teams = [...new Set(live.flatMap(m => [m.high_seed_user_id, m.low_seed_user_id]))]

  const selection = await selectWeeklyGames(supabase, leagueId, week, seasonId, {
    playoffBoost:  PLAYOFF_BOOST,
    playoffWeight: PLAYOFF_WEIGHT,
    onlyUserIds:   teams,
  })
  await revealWeeklyGames(supabase, leagueId, week)

  const settled = await calculatePlayoffScores(supabase, leagueId, week, seasonId)

  // skippedPlayers > 0 means a starter had no drawable game and scored nothing.
  // That silently deflates a team's total, so callers should treat it as a bug.
  return { week, teams, skippedPlayers: selection.skippedPlayers ?? 0, ...settled }
}

/**
 * Matchups in this week that can actually be played: both sides known and not
 * already settled. A round-2 slot whose feeder hasn't finished is not live.
 */
async function liveMatchups(supabase, leagueId, week, seasonId) {
  const { data, error } = await supabase
    .from('playoff_matchups')
    .select(MATCHUP_SELECT)
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('week', week)
    .neq('status', 'complete')

  if (error) throw new Error(`Playoff matchup lookup failed: ${error.message}`)

  return (data || []).filter(m => m.high_seed_user_id && m.low_seed_user_id)
}

// ---------------------------------------------------------------------------
// calculatePlayoffScores
// ---------------------------------------------------------------------------

/**
 * Settle every live playoff matchup in `week`.
 *
 * Ties go to the higher seed — the historical-game draw makes exact ties
 * vanishingly rare, but a bracket cannot advance without a winner.
 *
 * @returns {{ matchupsProcessed, results, champion }}
 */
export async function calculatePlayoffScores(supabase, leagueId, week, seasonId) {
  const matchups = await liveMatchups(supabase, leagueId, week, seasonId)
  if (!matchups.length) return { matchupsProcessed: 0, results: [], champion: null }

  // ── Sum starter scores for everyone playing this week ────────────────────
  const userIds = [...new Set(matchups.flatMap(m => [m.high_seed_user_id, m.low_seed_user_id]))]

  const { data: starterRows, error: scoreErr } = await supabase
    .from('weekly_player_scores')
    .select('user_id, score')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('week', week)
    .eq('is_starter', true)
    .in('user_id', userIds)

  if (scoreErr) throw new Error(`Playoff score fetch failed: ${scoreErr.message}`)

  const teamScores = {}
  for (const row of (starterRows || [])) {
    teamScores[row.user_id] = round2((teamScores[row.user_id] || 0) + (row.score || 0))
  }

  const nameOf = await teamNameLookup(supabase, userIds)

  const results  = []
  let   champion = null

  for (const m of matchups) {
    const highScore = teamScores[m.high_seed_user_id] ?? 0
    const lowScore  = teamScores[m.low_seed_user_id]  ?? 0

    // Tie → higher seed advances.
    const highWins = highScore >= lowScore
    const winnerId = highWins ? m.high_seed_user_id : m.low_seed_user_id
    const loserId  = highWins ? m.low_seed_user_id  : m.high_seed_user_id
    const upset    = !highWins   // the lower seed won

    const { error: updErr } = await supabase
      .from('playoff_matchups')
      .update({
        high_score:     highScore,
        low_score:      lowScore,
        winner_user_id: winnerId,
        status:         'complete',
      })
      .eq('id', m.id)

    if (updErr) throw new Error(`Playoff matchup update failed: ${updErr.message}`)

    const bracketType = m.playoff_brackets?.bracket_type
    const winnerSeed  = highWins ? m.high_seed : m.low_seed

    await advanceWinner(supabase, m, winnerId, winnerSeed)
    await awardMatchupBadges(supabase, {
      leagueId, seasonId, bracketType, round: m.round, winnerId, loserId, upset,
    })

    if (m.round === FINAL_ROUND && bracketType === 'championship') champion = winnerId

    await logActivity(supabase, {
      leagueId,
      seasonId,
      eventType: 'matchup_final',
      payload: {
        week,
        playoff:      true,
        bracket:      bracketType,
        round:        m.round,
        home_name:    nameOf(m.high_seed_user_id),
        away_name:    nameOf(m.low_seed_user_id),
        home_score:   highScore,
        away_score:   lowScore,
        winner_name:  nameOf(winnerId),
      },
    })

    results.push({
      matchupId: m.id, round: m.round, bracket: bracketType,
      highScore, lowScore, winnerId, upset,
    })
  }

  return { matchupsProcessed: matchups.length, results, champion }
}

// ---------------------------------------------------------------------------
// Advancement
// ---------------------------------------------------------------------------

/**
 * Write the winner into the slot of the next round's matchup, then re-normalize
 * that matchup so the better seed sits in the high slot.
 */
async function advanceWinner(supabase, matchup, winnerId, winnerSeed) {
  const targetId = matchup.feeds_into_matchup_id
  const slot     = matchup.feeds_into_slot
  if (!targetId || !slot) return

  const { error: slotErr } = await supabase
    .from('playoff_matchups')
    .update({ [`${slot}_seed_user_id`]: winnerId, [`${slot}_seed`]: winnerSeed })
    .eq('id', targetId)

  if (slotErr) throw new Error(`Advancement failed: ${slotErr.message}`)

  const { data: target, error: fetchErr } = await supabase
    .from('playoff_matchups')
    .select('id, high_seed_user_id, low_seed_user_id, high_seed, low_seed, high_score, low_score')
    .eq('id', targetId)
    .single()

  if (fetchErr) throw new Error(`Advancement re-read failed: ${fetchErr.message}`)

  // Only meaningful once both sides are known.
  if (!target.high_seed_user_id || !target.low_seed_user_id) return

  const before = `${target.high_seed}:${target.low_seed}`
  normalizeSlots(target)
  if (`${target.high_seed}:${target.low_seed}` === before) return

  const { error: normErr } = await supabase
    .from('playoff_matchups')
    .update({
      high_seed_user_id: target.high_seed_user_id,
      low_seed_user_id:  target.low_seed_user_id,
      high_seed:         target.high_seed,
      low_seed:          target.low_seed,
      high_score:        target.high_score,
      low_score:         target.low_score,
    })
    .eq('id', target.id)

  if (normErr) throw new Error(`Slot normalization failed: ${normErr.message}`)
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

/**
 * Badges decided by a single playoff matchup.
 *
 *   bracket_buster  — win a championship-bracket game as the lower seed.
 *                     Scoped to the championship bracket: the consolation
 *                     bracket is not "the playoffs" for badge purposes, the
 *                     same way playoff_hunter only goes to seeds 1-6.
 *   league_champion — win the championship final (count-based, can level up).
 *   runner_up       — lose the championship final (count-based).
 *   redemption_arc  — win the consolation final.
 */
async function awardMatchupBadges(supabase, { leagueId, seasonId, bracketType, round, winnerId, loserId, upset }) {
  const give = badgeId => awardBadge(supabase, { userId: winnerId, badgeId, leagueId, seasonId })

  if (bracketType === 'championship') {
    if (upset) await give('bracket_buster')

    if (round === FINAL_ROUND) {
      await give('league_champion')
      await awardBadge(supabase, { userId: loserId, badgeId: 'runner_up', leagueId, seasonId })
    }
  } else if (bracketType === 'consolation' && round === FINAL_ROUND) {
    await give('redemption_arc')
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function teamNameLookup(supabase, userIds) {
  const { data } = await supabase
    .from('profiles')
    .select('id, team_name, display_name')
    .in('id', userIds)

  const map = Object.fromEntries((data ?? []).map(p => [p.id, p]))
  return uid => map[uid]?.team_name || map[uid]?.display_name || 'Unknown'
}
