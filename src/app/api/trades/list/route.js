/**
 * GET /api/trades/list?leagueId=...
 * Returns all trades for the league visible to the authenticated user,
 * along with player names and opponent profiles.
 * Uses service-role key to bypass missing RLS policies on the trades table.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueId = searchParams.get('leagueId')
    if (!leagueId) {
      return NextResponse.json({ error: 'leagueId required' }, { status: 400 })
    }

    // ── 1. Verify caller ─────────────────────────────────────────────────────
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ── 2. Confirm user is a league member ───────────────────────────────────
    const { data: membership } = await admin
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not a league member' }, { status: 403 })
    }

    // ── 3. Fetch all trades for this league ──────────────────────────────────
    const { data: trades, error: tradesErr } = await admin
      .from('trades')
      .select('*')
      .eq('league_id', leagueId)
      .order('proposed_at', { ascending: false })

    if (tradesErr) {
      return NextResponse.json({ error: tradesErr.message }, { status: 500 })
    }

    // ── 4. Batch-load players and profiles ───────────────────────────────────
    const allPlayerIds = new Set()
    const allUserIds   = new Set()
    trades?.forEach(t => {
      t.proposer_players?.forEach(id => allPlayerIds.add(id))
      t.receiver_players?.forEach(id => allPlayerIds.add(id))
      allUserIds.add(t.proposer_user_id)
      allUserIds.add(t.receiver_user_id)
    })

    const [{ data: players }, { data: profiles }] = await Promise.all([
      allPlayerIds.size > 0
        ? admin.from('players').select('id, name, position, tier').in('id', [...allPlayerIds])
        : Promise.resolve({ data: [] }),
      allUserIds.size > 0
        ? admin.from('profiles').select('id, display_name, team_name, helmet_color, helmet_secondary, helmet_pattern').in('id', [...allUserIds])
        : Promise.resolve({ data: [] }),
    ])

    return NextResponse.json({ trades, players, profiles })
  } catch (err) {
    console.error('trades-list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
