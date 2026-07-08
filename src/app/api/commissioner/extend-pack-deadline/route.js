/**
 * POST /api/commissioner/extend-pack-deadline
 * Adds 24 hours to expires_at on every pending weekly pack in the league.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner } from '../../../../lib/commissioner/requireCommissioner'
import { logActivity } from '../../../../lib/activity/logEvent'

const EXTENSION_MS = 24 * 60 * 60 * 1000

export async function POST(request) {
  try {
    const { leagueId } = await request.json()

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    const { data: packs, error: readErr } = await admin
      .from('weekly_packs')
      .select('id, expires_at')
      .eq('league_id', leagueId)
      .eq('status', 'pending')
    if (readErr) {
      return NextResponse.json({ error: `Pack lookup failed: ${readErr.message}` }, { status: 500 })
    }

    for (const pack of (packs ?? [])) {
      const extended = new Date(new Date(pack.expires_at).getTime() + EXTENSION_MS).toISOString()
      const { error: updErr } = await admin
        .from('weekly_packs')
        .update({ expires_at: extended })
        .eq('id', pack.id)
      if (updErr) {
        return NextResponse.json({ error: `Extend failed on pack ${pack.id}: ${updErr.message}` }, { status: 500 })
      }
    }

    const count = (packs ?? []).length
    if (count > 0) {
      await logActivity(admin, {
        leagueId,
        userId:    user.id,
        eventType: 'pack_deadline_extended',
        payload:   { hours: 24, count },
      })
    }

    return NextResponse.json({ success: true, extended: count })
  } catch (err) {
    console.error('extend-pack-deadline error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
