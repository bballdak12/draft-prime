/**
 * POST /api/commissioner/lineup-lock
 * Toggles leagues.manual_lineup_lock and returns the new state.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner } from '../../../../lib/commissioner/requireCommissioner'
import { logActivity } from '../../../../lib/activity/logEvent'

export async function POST(request) {
  try {
    const { leagueId } = await request.json()

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    const { data: league, error: readErr } = await admin
      .from('leagues')
      .select('manual_lineup_lock')
      .eq('id', leagueId)
      .single()
    if (readErr) {
      return NextResponse.json({ error: `League lookup failed: ${readErr.message}` }, { status: 500 })
    }

    const locked = !league.manual_lineup_lock
    const { error: updErr } = await admin
      .from('leagues')
      .update({ manual_lineup_lock: locked })
      .eq('id', leagueId)
    if (updErr) {
      return NextResponse.json({ error: `Toggle failed: ${updErr.message}` }, { status: 500 })
    }

    await logActivity(admin, {
      leagueId,
      userId:    user.id,
      eventType: 'lineup_lock',
      payload:   { locked },
    })

    return NextResponse.json({ success: true, locked })
  } catch (err) {
    console.error('lineup-lock error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
