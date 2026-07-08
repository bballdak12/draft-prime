/**
 * POST /api/commissioner/remove-team
 * Removes a member from the league. Blocked while a draft is running
 * (helmet_race/active). Their draft_picks remain untouched.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner, teamNames } from '../../../../lib/commissioner/requireCommissioner'
import { logActivity } from '../../../../lib/activity/logEvent'

export async function POST(request) {
  try {
    const { leagueId, userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
    }

    // Block removal mid-draft
    const { data: draft } = await admin
      .from('drafts')
      .select('status')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (draft && ['helmet_race', 'active'].includes(draft.status)) {
      return NextResponse.json({ error: 'Cannot remove a team while the draft is running' }, { status: 409 })
    }

    // Target must actually be a member
    const { data: target } = await admin
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!target) {
      return NextResponse.json({ error: 'That user is not a member of this league' }, { status: 404 })
    }

    const nameOf = await teamNames(admin, [userId])

    const { error: delErr } = await admin
      .from('league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('user_id', userId)
    if (delErr) {
      return NextResponse.json({ error: `Remove failed: ${delErr.message}` }, { status: 500 })
    }

    await logActivity(admin, {
      leagueId,
      userId:    user.id,
      eventType: 'member_removed',
      payload:   { team_name: nameOf(userId) },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('remove-team error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
