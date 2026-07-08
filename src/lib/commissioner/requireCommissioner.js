/**
 * Shared guard for commissioner API routes (server-side only — reads the
 * service key from env). Verifies the caller's JWT, then confirms they are
 * the commissioner of the given league.
 *
 * Returns { user, admin } on success, or { error, status } for the route
 * to relay. `admin` is a service-role client (bypasses RLS).
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function requireCommissioner(request, leagueId) {
  if (!leagueId) {
    return { error: 'leagueId required', status: 400 }
  }

  const authHeader = request.headers.get('authorization') || ''
  const userToken  = authHeader.replace('Bearer ', '')
  if (!userToken) {
    return { error: 'Unauthorized', status: 401 }
  }

  const userSb = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await userSb.auth.getUser(userToken)
  if (authErr || !user) {
    return { error: 'Invalid token', status: 401 }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: membership, error: memberErr } = await admin
    .from('league_members')
    .select('user_id, is_commissioner')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberErr) {
    return { error: 'Membership lookup failed', status: 500 }
  }
  if (!membership?.is_commissioner) {
    return { error: 'Commissioner access required', status: 403 }
  }

  return { user, admin }
}

/** Resolve user ids → display names (team_name, falling back to display_name). */
export async function teamNames(admin, userIds) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, team_name, display_name')
    .in('id', userIds)
  const map = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  return uid => map[uid]?.team_name || map[uid]?.display_name || 'Unknown'
}
