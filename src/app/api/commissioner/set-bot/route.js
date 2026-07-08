/**
 * POST /api/commissioner/set-bot
 * Flags a member as a bot for draft auto-pick (or clears the flag).
 * Pre-draft configuration — intentionally not logged to the activity feed.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner } from '../../../../lib/commissioner/requireCommissioner'

export async function POST(request) {
  try {
    const { leagueId, userId, isBot } = await request.json()
    if (!userId || typeof isBot !== 'boolean') {
      return NextResponse.json({ error: 'userId and isBot (boolean) required' }, { status: 400 })
    }

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    if (userId === user.id) {
      return NextResponse.json({ error: 'The commissioner cannot be a bot' }, { status: 400 })
    }

    const { error: updErr, count } = await admin
      .from('league_members')
      .update({ is_bot: isBot }, { count: 'exact' })
      .eq('league_id', leagueId)
      .eq('user_id', userId)
    if (updErr) {
      return NextResponse.json({ error: `Update failed: ${updErr.message}` }, { status: 500 })
    }
    if (count === 0) {
      return NextResponse.json({ error: 'That user is not a member of this league' }, { status: 404 })
    }

    return NextResponse.json({ success: true, isBot })
  } catch (err) {
    console.error('set-bot error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
