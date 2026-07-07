/**
 * POST /api/activity/log
 * Records a league activity event from a client-side flow (pack opened,
 * member joined, draft complete). Verifies the caller's JWT and league
 * membership, then inserts with the service role — league_activity has no
 * INSERT policy for authenticated users.
 *
 * Server-side flows (trade accept, matchup finals) log directly with their
 * service-role client instead of calling this route.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '../../../../lib/activity/logEvent'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Only events that legitimately originate in the browser
const CLIENT_EVENT_TYPES = new Set([
  'member_joined',
  'draft_complete',
  'pack_opened',
  'player_dropped',
])

export async function POST(request) {
  try {
    const { leagueId, seasonId, eventType, payload } = await request.json()

    if (!leagueId || !eventType) {
      return NextResponse.json({ error: 'leagueId and eventType required' }, { status: 400 })
    }
    if (!CLIENT_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: `eventType '${eventType}' cannot be logged from the client` }, { status: 400 })
    }

    // ── 1. Verify caller identity via their JWT ──────────────────────────────
    const authHeader = request.headers.get('authorization') || ''
    const userToken  = authHeader.replace('Bearer ', '')
    if (!userToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userSb = createClient(SUPABASE_URL, ANON_KEY)
    const { data: { user }, error: authErr } = await userSb.auth.getUser(userToken)
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // ── 2. Caller must be a member of the league ─────────────────────────────
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: membership, error: memberErr } = await admin
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (memberErr || !membership) {
      return NextResponse.json({ error: 'You are not a member of this league' }, { status: 403 })
    }

    // ── 3. Insert with the service role ──────────────────────────────────────
    const ok = await logActivity(admin, {
      leagueId,
      seasonId: seasonId ?? null,
      // draft_complete is a league-wide milestone, not an actor event
      userId:   eventType === 'draft_complete' ? null : user.id,
      eventType,
      payload:  payload ?? {},
    })

    if (!ok) {
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('activity-log error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
