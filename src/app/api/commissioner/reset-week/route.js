/**
 * POST /api/commissioner/reset-week
 * Destructive: wipes the current week's player scores, resets its matchups
 * to 'scheduled' with 0-0 scores, then rebuilds league_standings from the
 * weeks that remain complete. Requires { confirm: "RESET" }.
 */
import { NextResponse } from 'next/server'
import { requireCommissioner } from '../../../../lib/commissioner/requireCommissioner'
import { logActivity } from '../../../../lib/activity/logEvent'

const round2 = n => Math.round((n || 0) * 100) / 100

export async function POST(request) {
  try {
    const { leagueId, confirm } = await request.json()

    const guard = await requireCommissioner(request, leagueId)
    if (guard.error) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }
    const { user, admin } = guard

    if (confirm !== 'RESET') {
      return NextResponse.json({ error: 'Confirmation required: send { confirm: "RESET" }' }, { status: 400 })
    }

    const { data: season } = await admin
      .from('app_seasons')
      .select('id, current_week')
      .eq('status', 'active')
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!season) {
      return NextResponse.json({ error: 'No active season' }, { status: 422 })
    }
    const week = season.current_week

    // 1. Wipe this week's player scores
    const { error: wipeErr } = await admin
      .from('weekly_player_scores')
      .delete()
      .eq('league_id', leagueId)
      .eq('season_id', season.id)
      .eq('week', week)
    if (wipeErr) {
      return NextResponse.json({ error: `Score wipe failed: ${wipeErr.message}` }, { status: 500 })
    }

    // 2. Reset this week's matchups
    const { error: matchErr } = await admin
      .from('weekly_matchups')
      .update({ status: 'scheduled', home_score: 0, away_score: 0 })
      .eq('league_id', leagueId)
      .eq('season_id', season.id)
      .eq('week', week)
    if (matchErr) {
      return NextResponse.json({ error: `Matchup reset failed: ${matchErr.message}` }, { status: 500 })
    }

    // 3. Rebuild standings from the weeks still complete, in week order
    //    (same semantics as the scoring engine: current_streak is signed,
    //     longest_streak tracks the longest WIN streak)
    const { data: completed } = await admin
      .from('weekly_matchups')
      .select('week, home_team_user_id, away_team_user_id, home_score, away_score')
      .eq('league_id', leagueId)
      .eq('season_id', season.id)
      .eq('status', 'complete')
      .order('week')

    const stats = {}
    const blank = () => ({ wins: 0, losses: 0, points_for: 0, points_against: 0, current_streak: 0, longest_streak: 0 })
    for (const m of (completed ?? [])) {
      const sides = [
        { uid: m.home_team_user_id, pf: Number(m.home_score), pa: Number(m.away_score), win: Number(m.home_score) > Number(m.away_score) },
        { uid: m.away_team_user_id, pf: Number(m.away_score), pa: Number(m.home_score), win: Number(m.away_score) > Number(m.home_score) },
      ]
      for (const s of sides) {
        const t = stats[s.uid] ?? (stats[s.uid] = blank())
        t.wins   += s.win ? 1 : 0
        t.losses += s.win ? 0 : 1
        t.points_for      = round2(t.points_for + s.pf)
        t.points_against  = round2(t.points_against + s.pa)
        t.current_streak  = s.win
          ? (t.current_streak >= 0 ? t.current_streak + 1 : 1)
          : (t.current_streak <= 0 ? t.current_streak - 1 : -1)
        t.longest_streak  = Math.max(t.longest_streak, t.current_streak > 0 ? t.current_streak : 0)
      }
    }

    // Every existing standings row gets recomputed values (zeros if that
    // user no longer has any complete matchups)
    const { data: existing } = await admin
      .from('league_standings')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('season_id', season.id)
    const allUserIds = [...new Set([...(existing ?? []).map(r => r.user_id), ...Object.keys(stats)])]

    const rows = allUserIds.map(uid => ({
      season_id: season.id,
      league_id: leagueId,
      user_id:   uid,
      ...(stats[uid] ?? blank()),
      updated_at: new Date().toISOString(),
    }))

    if (rows.length) {
      const { error: standErr } = await admin
        .from('league_standings')
        .upsert(rows, { onConflict: 'season_id,league_id,user_id' })
      if (standErr) {
        return NextResponse.json({ error: `Standings rebuild failed: ${standErr.message}` }, { status: 500 })
      }
    }

    await logActivity(admin, {
      leagueId,
      seasonId:  season.id,
      userId:    user.id,
      eventType: 'week_reset',
      payload:   { week },
    })

    return NextResponse.json({ success: true, week, standingsRebuilt: rows.length })
  } catch (err) {
    console.error('reset-week error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
