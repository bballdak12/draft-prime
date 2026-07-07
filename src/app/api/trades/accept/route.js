/**
 * POST /api/trades/accept
 * Accepts a pending trade: verifies the caller is the receiver, swaps
 * draft_picks ownership for both sides, marks the trade accepted.
 *
 * Uses the service-role key server-side to bypass RLS on draft_picks.
 * The caller must send their anon-key auth token so we can verify identity.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '../../../../lib/activity/logEvent'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request) {
  try {
    const { tradeId } = await request.json()
    if (!tradeId) {
      return NextResponse.json({ error: 'tradeId required' }, { status: 400 })
    }

    // ── 1. Verify caller identity via their JWT ──────────────────────────────
    const authHeader = request.headers.get('authorization') || ''
    const userToken  = authHeader.replace('Bearer ', '')
    if (!userToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the authenticated user from their token
    const userSb = createClient(SUPABASE_URL, ANON_KEY)
    const { data: { user }, error: authErr } = await userSb.auth.getUser(userToken)
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // ── 2. Load and validate the trade (admin client bypasses RLS) ──────────
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: trade, error: tradeErr } = await admin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (tradeErr || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (trade.receiver_user_id !== user.id) {
      return NextResponse.json({ error: 'Only the receiver can accept this trade' }, { status: 403 })
    }
    if (trade.status !== 'pending') {
      return NextResponse.json({ error: `Trade already ${trade.status}` }, { status: 409 })
    }
    if (new Date(trade.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Trade has expired' }, { status: 410 })
    }

    // ── 3. Find the league's most recent draft ───────────────────────────────
    const { data: draft, error: draftErr } = await admin
      .from('drafts')
      .select('id')
      .eq('league_id', trade.league_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (draftErr || !draft) {
      return NextResponse.json({ error: 'No draft found for this league' }, { status: 422 })
    }

    // ── 4. Atomically swap pick ownership ────────────────────────────────────
    // proposer_players → now owned by receiver
    const { error: e1 } = await admin
      .from('draft_picks')
      .update({ team_user_id: trade.receiver_user_id })
      .eq('draft_id', draft.id)
      .in('player_id', trade.proposer_players)

    if (e1) {
      console.error('Swap 1 failed:', e1)
      return NextResponse.json({ error: 'Roster swap failed (step 1)' }, { status: 500 })
    }

    // receiver_players → now owned by proposer
    const { error: e2 } = await admin
      .from('draft_picks')
      .update({ team_user_id: trade.proposer_user_id })
      .eq('draft_id', draft.id)
      .in('player_id', trade.receiver_players)

    if (e2) {
      console.error('Swap 2 failed:', e2)
      // Try to roll back step 1
      await admin.from('draft_picks')
        .update({ team_user_id: trade.proposer_user_id })
        .eq('draft_id', draft.id)
        .in('player_id', trade.proposer_players)
      return NextResponse.json({ error: 'Roster swap failed (step 2)' }, { status: 500 })
    }

    // ── 5. Mark trade accepted ───────────────────────────────────────────────
    const { error: e3 } = await admin
      .from('trades')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', tradeId)

    if (e3) {
      return NextResponse.json({ error: 'Failed to update trade status' }, { status: 500 })
    }

    // ── 6. Log to the league activity feed (best-effort) ─────────────────────
    const [{ data: profiles }, { data: players }] = await Promise.all([
      admin.from('profiles')
        .select('id, team_name, display_name')
        .in('id', [trade.proposer_user_id, trade.receiver_user_id]),
      admin.from('players')
        .select('id, name')
        .in('id', [...trade.proposer_players, ...trade.receiver_players]),
    ])
    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    const playerName = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))
    const teamName   = uid => profileMap[uid]?.team_name || profileMap[uid]?.display_name || 'Unknown'

    await logActivity(admin, {
      leagueId:  trade.league_id,
      seasonId:  trade.season_id,
      userId:    user.id,
      eventType: 'trade_accepted',
      payload: {
        proposer_name: teamName(trade.proposer_user_id),
        receiver_name: teamName(trade.receiver_user_id),
        gave: trade.proposer_players.map(pid => playerName[pid]).filter(Boolean),
        got:  trade.receiver_players.map(pid => playerName[pid]).filter(Boolean),
      },
    })

    return NextResponse.json({ success: true, tradeId })
  } catch (err) {
    console.error('accept-trade error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
