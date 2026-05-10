'use strict'

/**
 * generateSchedule
 *
 * Produces a full 14-week regular-season schedule for a league using the
 * "circle method" round-robin algorithm.
 *
 * With N teams (even), N-1 rounds cover every unique head-to-head matchup
 * exactly once.  For 12 teams that's 11 unique rounds.  Weeks 12-14 repeat
 * rounds 1-3 (rematches) — standard fantasy format.
 *
 * Weeks 15-17 are playoff weeks and are handled separately (not generated here).
 *
 * @param {Array<{ user_id: string }>} members   League members (2–12)
 * @param {string}  seasonId   UUID of the active app_season
 * @param {string}  leagueId
 * @returns {Array<object>}   weekly_matchups rows ready for supabase.insert()
 */
export function generateSchedule(members, seasonId, leagueId) {
  if (!members?.length || members.length < 2) {
    throw new Error('Need at least 2 members to generate a schedule')
  }

  const teams = members.map(m => m.user_id)
  const n     = teams.length

  // Pad to even number with a sentinel "bye" team if needed
  const roster = n % 2 === 0 ? [...teams] : [...teams, '__bye__']
  const size   = roster.length   // always even

  // ── Circle method ─────────────────────────────────────────────────────────
  // Fix roster[0], rotate roster[1…size-1] left by 1 each round.
  // Round k: pair roster[i] with roster[size-1-i] for i in 0..size/2-1.

  const totalUniqueRounds = size - 1   // = 11 for 12 teams
  const REGULAR_WEEKS     = 14

  // Pre-compute all unique rounds
  const rounds = []
  const rotating = roster.slice(1)

  for (let round = 0; round < totalUniqueRounds; round++) {
    // Rotate: bring the tail around to the front
    const rotated = [
      roster[0],
      ...rotating.slice(round % rotating.length),
      ...rotating.slice(0, round % rotating.length),
    ]

    const pairs = []
    for (let i = 0; i < size / 2; i++) {
      const home = rotated[i]
      const away = rotated[size - 1 - i]
      // Skip any pair involving the bye sentinel
      if (home !== '__bye__' && away !== '__bye__') {
        pairs.push({ home, away })
      }
    }
    rounds.push(pairs)
  }

  // ── Build matchup rows for weeks 1-14 ─────────────────────────────────────
  const matchups = []

  for (let week = 1; week <= REGULAR_WEEKS; week++) {
    // Repeat schedule after unique rounds are exhausted (week 12 → round 0, etc.)
    const roundIdx = (week - 1) % totalUniqueRounds
    const pairs    = rounds[roundIdx]

    for (const { home, away } of pairs) {
      matchups.push({
        season_id:          seasonId,
        league_id:          leagueId,
        week,
        home_team_user_id:  home,
        away_team_user_id:  away,
        home_score:         0,
        away_score:         0,
        status:             'scheduled',
      })
    }
  }

  return matchups
}

/**
 * generatePlayoffBracket
 *
 * Generates weeks 15-17 playoff matchups from final standings.
 * Top 4 teams advance.
 *   Week 15: #1 vs #4, #2 vs #3  (semifinals)
 *   Week 16: Winners play Championship, Losers play 3rd-place game
 *   Week 17: Championship (winners), Consolation (losers of semi)
 *
 * @param {Array<{ user_id, wins, points_for }>} standings  sorted best→worst
 * @param {string} seasonId
 * @param {string} leagueId
 * @returns {Array<object>}  Partial matchup rows (scores/results TBD)
 */
export function generatePlayoffBracket(standings, seasonId, leagueId) {
  if (standings.length < 4) {
    throw new Error('Need at least 4 teams for playoffs')
  }

  const [s1, s2, s3, s4] = standings.slice(0, 4).map(s => s.user_id)

  // Week 15 semifinals
  const semis = [
    makeMatchup(s1, s4, seasonId, leagueId, 15),
    makeMatchup(s2, s3, seasonId, leagueId, 15),
  ]

  // Weeks 16-17 are inserted after week 15 results are known (dynamic).
  // Return semis only; caller inserts championship matchups once results are in.
  return semis
}

function makeMatchup(home, away, seasonId, leagueId, week) {
  return {
    season_id:         seasonId,
    league_id:         leagueId,
    week,
    home_team_user_id: home,
    away_team_user_id: away,
    home_score:        0,
    away_score:        0,
    status:            'scheduled',
  }
}
