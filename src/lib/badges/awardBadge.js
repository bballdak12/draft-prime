'use strict'

/**
 * Badge awarding. `supabase` must be a service-role client — user_badges has
 * no write policy, so only the service role can insert/update.
 *
 * Behavior:
 *  - Single-level badges (tier_levels IS NULL): inserted once. Re-awarding is
 *    a no-op that reports newlyEarned=false.
 *  - Count-based badges: each award increments `count` and recomputes `level`
 *    from the badge's tier thresholds. `leveledUp` is true when the tier rose.
 *  - Logs a 'badge_earned' activity event on first earn or a level-up, but only
 *    when a leagueId is provided (league_activity.league_id is NOT NULL).
 *
 * @returns {Promise<{
 *   newlyEarned: boolean, leveledUp: boolean, level: string|null,
 *   count: number, badge: {id,name,icon}|null
 * }>}
 */
import { logActivity } from '../activity/logEvent.js'

export async function awardBadge(supabase, { userId, badgeId, leagueId = null, seasonId = null }) {
  const miss = { newlyEarned: false, leveledUp: false, level: null, count: 0, badge: null }
  if (!userId || !badgeId) return miss

  const { data: badge, error: badgeErr } = await supabase
    .from('badges')
    .select('id, name, icon, tier_levels')
    .eq('id', badgeId)
    .maybeSingle()
  if (badgeErr || !badge) {
    console.warn(`[badges] unknown badge '${badgeId}'`)
    return miss
  }

  const badgeInfo   = { id: badge.id, name: badge.name, icon: badge.icon }
  const countBased  = badge.tier_levels && typeof badge.tier_levels === 'object'

  // Highest tier whose threshold ≤ count (thresholds sorted ascending)
  const levelFor = (count) => {
    if (!countBased) return 'earned'
    const tiers = Object.entries(badge.tier_levels).sort((a, b) => a[1] - b[1])
    let level = tiers[0]?.[0] ?? 'earned'
    for (const [name, threshold] of tiers) if (count >= threshold) level = name
    return level
  }

  const { data: existing } = await supabase
    .from('user_badges')
    .select('id, level, count, earned_at')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .maybeSingle()

  // ── First earn ────────────────────────────────────────────────────────────
  if (!existing) {
    const level = levelFor(1)
    const { error: insErr } = await supabase
      .from('user_badges')
      .insert({ user_id: userId, badge_id: badgeId, league_id: leagueId, season_id: seasonId, level, count: 1 })

    // 23505 = concurrent insert won the race; fall through to the re-earn path
    if (insErr && insErr.code === '23505') {
      return awardBadge(supabase, { userId, badgeId, leagueId, seasonId })
    }
    if (insErr) {
      console.warn(`[badges] insert failed for ${badgeId}:`, insErr.message)
      return miss
    }

    await maybeLog(supabase, { leagueId, seasonId, userId, badge, level, leveledUp: false })
    return { newlyEarned: true, leveledUp: false, level, count: 1, badge: badgeInfo }
  }

  // ── Re-earn ───────────────────────────────────────────────────────────────
  if (!countBased) {
    // Single-level badge already held — nothing changes
    return { newlyEarned: false, leveledUp: false, level: existing.level, count: existing.count, badge: badgeInfo }
  }

  const newCount  = existing.count + 1
  const newLevel  = levelFor(newCount)
  const leveledUp = newLevel !== existing.level

  const { error: updErr } = await supabase
    .from('user_badges')
    .update({
      count:     newCount,
      level:     newLevel,
      earned_at: leveledUp ? new Date().toISOString() : existing.earned_at,
    })
    .eq('id', existing.id)
  if (updErr) {
    console.warn(`[badges] update failed for ${badgeId}:`, updErr.message)
    return miss
  }

  if (leveledUp) {
    await maybeLog(supabase, { leagueId, seasonId, userId, badge, level: newLevel, leveledUp: true })
  }
  return { newlyEarned: false, leveledUp, level: newLevel, count: newCount, badge: badgeInfo }
}

// Log to the league feed only when there's a league to log to.
async function maybeLog(supabase, { leagueId, seasonId, userId, badge, level, leveledUp }) {
  if (!leagueId) return
  await logActivity(supabase, {
    leagueId,
    seasonId,
    userId,
    eventType: 'badge_earned',
    payload: {
      badge_id:   badge.id,
      badge_name: badge.name,
      icon:       badge.icon,
      level,
      leveled_up: leveledUp,
    },
  })
}
