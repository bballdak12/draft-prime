'use strict'

/**
 * Playoff bracket generation.
 *
 * Called once, when the regular season (week 14) finalizes. Reads the final
 * league_standings, seeds every team, and builds two 6-team single-elimination
 * brackets:
 *
 *   championship — seeds 1-6
 *   consolation  — seeds 7-12
 *
 * Both have the same shape. Seeds 1 and 2 get a first-round bye:
 *
 *   Round 1 (week 15):  3 vs 6      4 vs 5
 *   Round 2 (week 16):  2 vs W(3v6) 1 vs W(4v5)      ← semifinals
 *   Round 3 (week 17):  W vs W                        ← final
 *
 * `supabase` must be a service-role client — playoff_brackets and
 * playoff_matchups have no write policies.
 */

import { awardBadge } from '../badges/awardBadge.js'

export const BRACKET_SIZE          = 6   // teams per bracket
export const REGULAR_SEASON_WEEKS  = 14

const ROUND_WEEK = { 1: 15, 2: 16, 3: 17 }

// ---------------------------------------------------------------------------
// Pure bracket shape
// ---------------------------------------------------------------------------

/**
 * Build the matchup rows for one bracket.
 *
 * `entries` is the bracket's teams in seed order, best first:
 *   [{ userId, seed }, …]  where `seed` is the league-wide seed (1-6 for the
 *   championship bracket, 7-12 for the consolation bracket).
 *
 * Fewer than 6 entries is supported — the missing seeds act as extra byes and
 * the present teams advance through empty slots without a matchup row being
 * created. A 2-team league therefore produces a single week-17 final.
 *
 * Returns rows ordered round 3 → 1, which is also a safe insert order: the
 * self-referencing feeds_into_matchup_id FK is checked per row, so a matchup
 * must be inserted after the matchup it feeds.
 */
export function buildBracketRows(entries, { bracketId, leagueId, seasonId }) {
  // Local position (1-6) → entry, or undefined when the bracket is short.
  const at = pos => entries[pos - 1]

  const newRow = (round, extra = {}) => ({
    id:                    crypto.randomUUID(),
    bracket_id:            bracketId,
    league_id:             leagueId,
    season_id:             seasonId,
    week:                  ROUND_WEEK[round],
    round,
    high_seed_user_id:     null,
    low_seed_user_id:      null,
    high_seed:             null,
    low_seed:              null,
    high_score:            0,
    low_score:             0,
    winner_user_id:        null,
    status:                'scheduled',
    feeds_into_matchup_id: null,
    feeds_into_slot:       null,
    ...extra,
  })

  // Write an entry into one side of a row.
  const place = (row, slot, entry) => {
    row[`${slot}_seed_user_id`] = entry.userId
    row[`${slot}_seed`]         = entry.seed
  }

  const final = newRow(3)

  // Semifinals. The bye seed (local 1 / local 2) always occupies the high slot,
  // because it is a better seed than any round-1 winner it can face.
  //   semiA: local 1 vs winner(4v5) → feeds the final's high slot
  //   semiB: local 2 vs winner(3v6) → feeds the final's low slot
  const semis = [
    { row: newRow(2, { feeds_into_matchup_id: final.id, feeds_into_slot: 'high' }), bye: at(1), r1: [at(4), at(5)] },
    { row: newRow(2, { feeds_into_matchup_id: final.id, feeds_into_slot: 'low'  }), bye: at(2), r1: [at(3), at(6)] },
  ]

  const rows = []

  for (const semi of semis) {
    const [better, worse] = semi.r1
    const present = [better, worse].filter(Boolean)

    if (present.length === 2) {
      // A real round-1 game. `better` has the numerically lower (stronger) seed.
      const r1 = newRow(1, { feeds_into_matchup_id: semi.row.id, feeds_into_slot: 'low' })
      place(r1, 'high', better)
      place(r1, 'low',  worse)
      rows.push(r1)
    } else if (present.length === 1) {
      // Only one team in this half of round 1 — it walks into the semi.
      place(semi.row, 'low', present[0])
    }
    // present.length === 0 → the semi's low slot stays empty.

    if (semi.bye) place(semi.row, 'high', semi.bye)
  }

  // Decide which semis are real games. A semi with a single occupant and no
  // round-1 feeder is not a game — that team advances straight to the final.
  for (const semi of semis) {
    const feeder     = rows.some(r => r.feeds_into_matchup_id === semi.row.id)
    const occupants  = [semi.row.high_seed_user_id, semi.row.low_seed_user_id].filter(Boolean)

    if (feeder || occupants.length === 2) {
      rows.push(semi.row)
    } else if (occupants.length === 1) {
      const seed   = semi.row.high_seed_user_id ? semi.row.high_seed : semi.row.low_seed
      const userId = semi.row.high_seed_user_id ?? semi.row.low_seed_user_id
      place(final, semi.row.feeds_into_slot, { userId, seed })
    }
  }

  const finalFeeders   = rows.filter(r => r.feeds_into_matchup_id === final.id).length
  const finalOccupants = [final.high_seed_user_id, final.low_seed_user_id].filter(Boolean).length

  // Fewer than two sources means there is no final to play (a 1-team bracket).
  if (finalFeeders + finalOccupants < 2) return []

  normalizeSlots(final)
  rows.push(final)

  // Round 3 → 2 → 1, so every row is inserted after the row it references.
  return rows.sort((a, b) => b.round - a.round)
}

/**
 * Ensure the better (numerically lower) seed sits in the high slot. Only
 * meaningful once both sides are known.
 */
export function normalizeSlots(row) {
  const { high_seed: hs, low_seed: ls } = row
  if (hs == null || ls == null || hs <= ls) return row

  ;[row.high_seed_user_id, row.low_seed_user_id] = [row.low_seed_user_id, row.high_seed_user_id]
  ;[row.high_seed,        row.low_seed]          = [row.low_seed,        row.high_seed]
  ;[row.high_score,       row.low_score]         = [row.low_score,       row.high_score]
  return row
}

// ---------------------------------------------------------------------------
// generatePlayoffBracket
// ---------------------------------------------------------------------------

/**
 * Seed the league from final standings and persist both brackets.
 *
 * Seeding: wins desc, then points_for desc.
 *
 * Also awards the two badges that are decided by the regular season:
 *   playoff_hunter — every team in the championship bracket
 *   season_sweep   — any team that finished 14-0
 *
 * Safe to call twice: returns { skipped: true } if a bracket already exists.
 */
export async function generatePlayoffBracket(supabase, leagueId, seasonId) {
  const { data: existing, error: existErr } = await supabase
    .from('playoff_brackets')
    .select('id')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .limit(1)

  if (existErr) throw new Error(`Bracket lookup failed: ${existErr.message}`)
  if (existing?.length) {
    return { skipped: true, reason: 'Bracket already generated for this league/season' }
  }

  const { data: standings, error: standErr } = await supabase
    .from('league_standings')
    .select('user_id, wins, losses, points_for')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)

  if (standErr) throw new Error(`Standings lookup failed: ${standErr.message}`)
  if (!standings || standings.length < 2) {
    throw new Error('Need at least 2 teams with standings to generate a bracket')
  }

  const seeded = [...standings]
    .sort((a, b) => (b.wins - a.wins) || (Number(b.points_for) - Number(a.points_for)))
    .map((s, i) => ({ userId: s.user_id, seed: i + 1, wins: s.wins, losses: s.losses }))

  const championship = seeded.slice(0, BRACKET_SIZE)
  const consolation  = seeded.slice(BRACKET_SIZE, BRACKET_SIZE * 2)

  const built = []

  for (const [bracketType, entries] of [['championship', championship], ['consolation', consolation]]) {
    if (entries.length < 2) continue   // not enough teams to play anything

    const { data: bracket, error: bErr } = await supabase
      .from('playoff_brackets')
      .insert({ league_id: leagueId, season_id: seasonId, bracket_type: bracketType })
      .select('id')
      .single()

    if (bErr) throw new Error(`Bracket insert failed (${bracketType}): ${bErr.message}`)

    const rows = buildBracketRows(entries, { bracketId: bracket.id, leagueId, seasonId })

    // Insert one round at a time, deepest round first: feeds_into_matchup_id is
    // a self-FK and Postgres checks it per row, so the target must exist first.
    for (const round of [3, 2, 1]) {
      const slice = rows.filter(r => r.round === round)
      if (!slice.length) continue
      const { error: mErr } = await supabase.from('playoff_matchups').insert(slice)
      if (mErr) throw new Error(`Matchup insert failed (${bracketType} r${round}): ${mErr.message}`)
    }

    built.push({ bracketType, bracketId: bracket.id, teams: entries.length, matchups: rows.length })
  }

  // ── Regular-season badges ────────────────────────────────────────────────
  for (const team of championship) {
    await awardBadge(supabase, { userId: team.userId, badgeId: 'playoff_hunter', leagueId, seasonId })
  }

  const sweepers = seeded.filter(t => t.losses === 0 && t.wins === REGULAR_SEASON_WEEKS)
  for (const team of sweepers) {
    await awardBadge(supabase, { userId: team.userId, badgeId: 'season_sweep', leagueId, seasonId })
  }

  return {
    skipped:      false,
    brackets:     built,
    seeds:        seeded.map(s => ({ seed: s.seed, userId: s.userId, wins: s.wins, losses: s.losses })),
    playoffTeams: championship.length,
    sweepers:     sweepers.map(s => s.userId),
  }
}
