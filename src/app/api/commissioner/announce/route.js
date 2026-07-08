/**
 * POST /api/commissioner/announce
 * Sets (or clears, with an empty string) the league announcement shown as
 * a banner on league home. Non-empty posts are logged to the activity feed.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner } from '../../../../lib/commissioner/requireCommissioner'
import { logActivity } from '../../../../lib/activity/logEvent'

const MAX_LENGTH = 280

export async function POST(request) {
  try {
    const { leagueId, message } = await request.json()

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    const text = (message ?? '').trim()
    if (text.length > MAX_LENGTH) {
      return NextResponse.json({ error: `Announcement must be ${MAX_LENGTH} characters or fewer` }, { status: 400 })
    }

    const clearing = text.length === 0
    const { error: updErr } = await admin
      .from('leagues')
      .update({
        announcement:            clearing ? null : text,
        announcement_updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)

    if (updErr) {
      return NextResponse.json({ error: `Update failed: ${updErr.message}` }, { status: 500 })
    }

    if (!clearing) {
      await logActivity(admin, {
        leagueId,
        userId:    user.id,
        eventType: 'announcement',
        payload:   { text },
      })
    }

    return NextResponse.json({ success: true, cleared: clearing })
  } catch (err) {
    console.error('announce error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
