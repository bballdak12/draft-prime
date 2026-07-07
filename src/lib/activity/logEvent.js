'use strict'

/**
 * League activity feed logging.
 *
 * league_activity has no INSERT policy — writes only succeed through the
 * service role. Server-side flows (API routes, scoring scripts) call
 * logActivity() with their service-role client. Client-side flows call
 * logActivityFromClient(), which posts to /api/activity/log where the JWT
 * is verified and the insert happens with the service role.
 *
 * Logging is best-effort: failures are logged and swallowed so a feed
 * hiccup can never break the underlying flow (pack open, trade, etc.).
 */

/**
 * Insert one activity event. `supabase` must be a service-role client.
 *
 * @param {object}      supabase
 * @param {object}      event
 * @param {string}      event.leagueId
 * @param {string|null} [event.seasonId]
 * @param {string|null} [event.userId]    actor; null for system events
 * @param {string}      event.eventType   'member_joined' | 'draft_complete' |
 *                                        'trade_accepted' | 'pack_opened' |
 *                                        'player_dropped' | 'matchup_final' |
 *                                        'announcement'
 * @param {object}      [event.payload]   event-specific display data
 * @returns {Promise<boolean>} true if the insert succeeded
 */
export async function logActivity(supabase, { leagueId, seasonId = null, userId = null, eventType, payload = {} }) {
  const { error } = await supabase
    .from('league_activity')
    .insert({
      league_id:  leagueId,
      season_id:  seasonId,
      user_id:    userId,
      event_type: eventType,
      payload,
    })

  if (error) {
    console.warn(`[activity] failed to log ${eventType}:`, error.message)
    return false
  }
  return true
}

/**
 * Client-side variant: sends the event to /api/activity/log with the
 * caller's access token. The route verifies identity + league membership
 * and performs the insert server-side. Fire-and-forget safe.
 *
 * @param {object} supabase  browser client (for the session token)
 * @param {object} event     { leagueId, seasonId?, eventType, payload? }
 * @returns {Promise<boolean>}
 */
export async function logActivityFromClient(supabase, { leagueId, seasonId = null, eventType, payload = {} }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return false

    const res = await fetch('/api/activity/log', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ leagueId, seasonId, eventType, payload }),
    })
    return res.ok
  } catch (err) {
    console.warn(`[activity] failed to log ${eventType}:`, err.message)
    return false
  }
}
