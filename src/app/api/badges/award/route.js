/**
 * POST /api/badges/award
 * Client-triggered badge awards, validated server-side. The client cannot
 * award arbitrary badges — each `type` re-checks the earning condition against
 * the database before calling awardBadge with the service role.
 *
 * Supported types:
 *   legend_puller    { leagueId, seasonId?, packId }  — verify the opened pack's
 *                    selected card is Legend-tier and owned by the caller.
 *   best_draft_grade { leagueId }                     — recompute draft grades
 *                    for the league's latest complete draft; award the top team.
 *
 * Returns { awards: [{ userId, ...awardResult }] } so the client can pop.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { awardBadge } from '../../../../lib/badges/awardBadge'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TIER_SCORE = { legend: 10, hero: 8, gold: 6, silver: 4, bronze: 2 }

export async function POST(request) {
  try {
    const { type, leagueId, seasonId, packId } = await request.json()
    if (!type || !leagueId) {
      return NextResponse.json({ error: 'type and leagueId required' }, { status: 400 })
    }

    // ── Verify caller ────────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization') || ''
    const userToken  = authHeader.replace('Bearer ', '')
    if (!userToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userSb = createClient(SUPABASE_URL, ANON_KEY)
    const { data: { user }, error: authErr } = await userSb.auth.getUser(userToken)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Caller must belong to the league
    const { data: membership } = await admin
      .from('league_members').select('user_id')
      .eq('league_id', leagueId).eq('user_id', user.id).maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 })

    // ── legend_puller ─────────────────────────────────────────────────────────
    if (type === 'legend_puller') {
      if (!packId) return NextResponse.json({ error: 'packId required' }, { status: 400 })
      const { data: pack } = await admin
        .from('weekly_packs')
        .select('id, user_id, league_id, season_id, status, cards, selected_player_id')
        .eq('id', packId).maybeSingle()
      if (!pack || pack.user_id !== user.id || pack.league_id !== leagueId) {
        return NextResponse.json({ error: 'Pack not found' }, { status: 404 })
      }
      if (pack.status !== 'opened') {
        return NextResponse.json({ error: 'Pack not opened' }, { status: 409 })
      }
      const selected = (pack.cards || []).find(c => c.id === pack.selected_player_id)
      if (!selected || selected.tier !== 'legend') {
        return NextResponse.json({ awards: [] })   // not a legend pull — nothing to award
      }
      const result = await awardBadge(admin, {
        userId: user.id, badgeId: 'legend_puller', leagueId, seasonId: seasonId ?? pack.season_id,
      })
      return NextResponse.json({ awards: [{ userId: user.id, ...result }] })
    }

    // ── best_draft_grade ────────────────────────────────────────────────────────
    if (type === 'best_draft_grade') {
      const { data: draft } = await admin
        .from('drafts').select('id, draft_order')
        .eq('league_id', leagueId).eq('status', 'complete')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!draft) return NextResponse.json({ error: 'No complete draft' }, { status: 422 })

      const { data: picks } = await admin
        .from('draft_picks')
        .select('team_user_id, round, players(tier, position)')
        .eq('draft_id', draft.id)
      if (!picks?.length) return NextResponse.json({ awards: [] })

      const topUser = highestGradedTeam(picks)
      if (!topUser) return NextResponse.json({ awards: [] })

      const { data: seasonRow } = await admin
        .from('app_seasons').select('id').eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()

      const result = await awardBadge(admin, {
        userId: topUser, badgeId: 'best_draft_grade', leagueId, seasonId: seasonRow?.id ?? null,
      })
      return NextResponse.json({ awards: [{ userId: topUser, ...result }] })
    }

    return NextResponse.json({ error: `Unknown award type '${type}'` }, { status: 400 })
  } catch (err) {
    console.error('badge award error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Replicates the draft page's calcTeamScore, returns the top team's user_id.
function highestGradedTeam(picks) {
  const byTeam = {}
  for (const p of picks) {
    const uid = p.team_user_id
    if (!byTeam[uid]) byTeam[uid] = []
    byTeam[uid].push(p)
  }

  const teamAvgs = Object.values(byTeam).map(ps =>
    ps.reduce((s, p) => s + (TIER_SCORE[p.players?.tier] || 0), 0) / ps.length)
  const leagueAvg = teamAvgs.length ? teamAvgs.reduce((a, b) => a + b, 0) / teamAvgs.length : 0

  const IDEAL = { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1, K: 1 }
  let bestUid = null, bestScore = -1
  for (const [uid, ps] of Object.entries(byTeam)) {
    const myAvg = ps.reduce((s, p) => s + (TIER_SCORE[p.players?.tier] || 0), 0) / ps.length

    let tierPts
    if (myAvg >= leagueAvg) {
      const headroom = Math.max(0.01, 10 - leagueAvg)
      tierPts = 35 + Math.min(15, ((myAvg - leagueAvg) / headroom) * 15)
    } else {
      const headroom = Math.max(0.01, leagueAvg - 2)
      tierPts = Math.max(0, ((myAvg - 2) / headroom) * 35)
    }

    const starters = ps.filter(p => (p.round || 1) <= 9)
    const posCounts = {}
    for (const p of starters) {
      const pos = p.players?.position
      if (pos) posCounts[pos] = (posCounts[pos] || 0) + 1
    }
    let posPts = 30
    for (const [pos, needed] of Object.entries(IDEAL)) posPts -= Math.max(0, needed - (posCounts[pos] || 0)) * 3
    posPts = Math.max(0, posPts)

    const bench = ps.filter(p => (p.round || 1) >= 10)
    let depthPts = 0
    if (bench.length) {
      const benchAvg = bench.reduce((s, p) => s + (TIER_SCORE[p.players?.tier] || 0), 0) / bench.length
      depthPts = Math.min(20, Math.max(0, ((benchAvg - 2) / 4) * 20))
    }

    const score = Math.round(Math.min(100, tierPts + posPts + depthPts))
    if (score > bestScore) { bestScore = score; bestUid = uid }
  }
  return bestUid
}
