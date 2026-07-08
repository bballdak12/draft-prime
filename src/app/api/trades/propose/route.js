/**
 * POST /api/trades/propose
 * Creates a new trade proposal. Uses service-role key to bypass any RLS
 * gaps on the trades table, while verifying the caller's JWT to ensure
 * proposer_user_id matches the authenticated user.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request) {
  try {
    const body = await request.json()
    const { leagueId, seasonId, receiverUserId, proposerPlayers, receiverPlayers, message } = body

    if (!leagueId || !seasonId || !receiverUserId) {
      return NextResponse.json({ error: 'leagueId, seasonId, receiverUserId required' }, { status: 400 })
    }

    // ── 1. Verify caller identity ────────────────────────────────────────────
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

    // ── 2. Validate: proposer must be a league member ────────────────────────
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

    if (receiverUserId === user.id) {
      return NextResponse.json({ error: 'Cannot trade with yourself' }, { status: 400 })
    }

    // ── 3. Validate: receiver must be a league member ────────────────────────
    const { data: receiverMember } = await admin
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('user_id', receiverUserId)
      .maybeSingle()

    if (!receiverMember) {
      return NextResponse.json({ error: 'Receiver is not a member of this league' }, { status: 400 })
    }

    // ── 4. Check season / trade deadline ─────────────────────────────────────
    const { data: season } = await admin
      .from('app_seasons')
      .select('current_week')
      .eq('id', seasonId)
      .single()

    const TRADE_DEADLINE_WEEK = 11
    if (season && season.current_week > TRADE_DEADLINE_WEEK) {
      return NextResponse.json({ error: 'Trade deadline has passed' }, { status: 422 })
    }

    // ── 5. Insert the trade ──────────────────────────────────────────────────
    const { data: trade, error: insertErr } = await admin
      .from('trades')
      .insert({
        league_id:        leagueId,
        season_id:        seasonId,
        proposer_user_id: user.id,
        receiver_user_id: receiverUserId,
        proposer_players: proposerPlayers ?? [],
        receiver_players: receiverPlayers ?? [],
        message:          message?.trim() || null,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('propose-trade insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, tradeId: trade.id })
  } catch (err) {
    console.error('propose-trade error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
