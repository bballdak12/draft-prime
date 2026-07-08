/**
 * POST /api/commissioner/force-cancel-trade
 * Commissioner cancels a pending trade in their league.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner, teamNames } from '../../../../lib/commissioner/requireCommissioner'
import { logActivity } from '../../../../lib/activity/logEvent'

export async function POST(request) {
  try {
    const { leagueId, tradeId } = await request.json()
    if (!tradeId) {
      return NextResponse.json({ error: 'tradeId required' }, { status: 400 })
    }

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    const { data: trade } = await admin
      .from('trades')
      .select('id, league_id, status, proposer_user_id, receiver_user_id')
      .eq('id', tradeId)
      .maybeSingle()

    if (!trade || trade.league_id !== leagueId) {
      return NextResponse.json({ error: 'Trade not found in this league' }, { status: 404 })
    }
    if (trade.status !== 'pending') {
      return NextResponse.json({ error: `Trade is already ${trade.status}` }, { status: 409 })
    }

    const { error: updErr } = await admin
      .from('trades')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', tradeId)
    if (updErr) {
      return NextResponse.json({ error: `Cancel failed: ${updErr.message}` }, { status: 500 })
    }

    const nameOf = await teamNames(admin, [trade.proposer_user_id, trade.receiver_user_id])
    await logActivity(admin, {
      leagueId,
      userId:    user.id,
      eventType: 'trade_cancelled',
      payload: {
        proposer_name: nameOf(trade.proposer_user_id),
        receiver_name: nameOf(trade.receiver_user_id),
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('force-cancel-trade error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
