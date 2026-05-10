'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'

const GOLD = '#F0B429'
const BG   = '#0A0E1A'

// ─── Streak badge ─────────────────────────────────────────────────────────────
function StreakBadge({ streak }) {
  const n     = Math.abs(streak ?? 0)
  const isWin = (streak ?? 0) > 0
  const color = isWin ? '#34D399' : streak === 0 ? '#4B5563' : '#F87171'
  const label = streak === 0 ? '—' : `${isWin ? 'W' : 'L'}${n}`
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
      color,
      fontFamily: 'var(--font-barlow, sans-serif)',
    }}>
      {label}
    </span>
  )
}

// Top 6 get a playoff indicator dot
function PlayoffDot({ show }) {
  if (!show) return <div style={{ width: 8 }} />
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%',
      backgroundColor: '#34D399',
      boxShadow: '0 0 6px #34D39988',
      flexShrink: 0,
    }} title="Playoff position" />
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StandingsPage() {
  const { id } = useParams()
  const router = useRouter()

  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [league,        setLeague]        = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [rows,          setRows]          = useState([])
  const [currentWeek,   setCurrentWeek]   = useState(1)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      // League
      const { data: lg } = await supabase.from('leagues').select('id, name').eq('id', id).single()
      if (!lg) { setError('League not found'); setLoading(false); return }
      setLeague(lg)

      // Active season
      const { data: season } = await supabase
        .from('app_seasons').select('id, current_week')
        .eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()
      if (!season) { setError('No active season'); setLoading(false); return }
      setCurrentWeek(season.current_week)

      // Standings
      const { data: standings, error: se } = await supabase
        .from('league_standings')
        .select('user_id, wins, losses, points_for, points_against, current_streak, longest_streak')
        .eq('league_id', id)
        .eq('season_id', season.id)

      if (se) { setError('Could not load standings'); setLoading(false); return }

      // Sort: wins desc, then points_for desc
      const sorted = (standings ?? []).sort((a, b) =>
        b.wins !== a.wins ? b.wins - a.wins : b.points_for - a.points_for
      )

      if (!sorted.length) {
        // No standings yet — load members for a 0-0 display
        const { data: members } = await supabase
          .from('league_members').select('user_id').eq('league_id', id)
        const { data: profiles } = await supabase
          .from('profiles').select('id, team_name, display_name')
          .in('id', (members ?? []).map(m => m.user_id))
        const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
        setRows((members ?? []).map(m => ({
          user_id: m.user_id,
          team_name: pMap[m.user_id]?.team_name || pMap[m.user_id]?.display_name || 'Unknown',
          wins: 0, losses: 0, points_for: 0, points_against: 0,
          current_streak: 0, longest_streak: 0,
        })))
        setLoading(false)
        return
      }

      // Fetch profiles for name resolution
      const uids = sorted.map(s => s.user_id)
      const { data: profiles } = await supabase
        .from('profiles').select('id, team_name, display_name').in('id', uids)
      const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

      setRows(sorted.map(s => ({
        ...s,
        team_name: pMap[s.user_id]?.team_name || pMap[s.user_id]?.display_name || 'Unknown',
      })))

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )

  if (error) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#F87171', fontFamily: 'sans-serif' }}>{error}</p>
      <button onClick={() => router.push(`/leagues/${id}`)} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back</button>
    </main>
  )

  const PLAYOFF_SPOTS = 6

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 48 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          backgroundColor: '#060912EE', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #0D1220',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button
            onClick={() => router.push(`/leagues/${id}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: 0 }}
          >
            ← {league?.name}
          </button>
          <span style={{
            fontSize: 11, fontWeight: 800, color: '#4B5563',
            letterSpacing: '0.12em', fontFamily: 'var(--font-barlow, sans-serif)',
          }}>
            WEEK {currentWeek} STANDINGS
          </span>
        </div>

        {/* ── League name + playoff legend ───────────────────────────────── */}
        <div style={{ padding: '18px 16px 10px' }}>
          <h1 style={{
            fontSize: 26, fontWeight: 900, color: '#F9FAFB', margin: '0 0 4px',
            fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.02em',
          }}>
            {league?.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#34D399', boxShadow: '0 0 5px #34D39988' }} />
            <span style={{ fontSize: 10, color: '#374151', letterSpacing: '0.06em' }}>
              Playoff position (top {PLAYOFF_SPOTS})
            </span>
          </div>
        </div>

        {/* ── Column headers ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '6px 16px', gap: 0,
          borderBottom: '1px solid #0D1220',
          marginBottom: 2,
        }}>
          <div style={{ width: 28, flexShrink: 0 }} />   {/* rank */}
          <div style={{ width: 8, flexShrink: 0 }} />    {/* playoff dot */}
          <div style={{ flex: 1 }} />                     {/* team name */}
          {['W','L','PF','PA','STK'].map(col => (
            <div key={col} style={{
              width: col === 'PF' || col === 'PA' ? 52 : col === 'STK' ? 36 : 22,
              textAlign: 'right', flexShrink: 0,
              fontSize: 9, fontWeight: 800, color: '#2D3748',
              letterSpacing: '0.1em', fontFamily: 'var(--font-barlow, sans-serif)',
            }}>
              {col}
            </div>
          ))}
        </div>

        {/* ── Rows ───────────────────────────────────────────────────────── */}
        <div style={{ margin: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.length === 0 && (
            <p style={{ textAlign: 'center', color: '#374151', padding: 32, fontSize: 13 }}>
              No standings yet — scores will appear after week 1 completes.
            </p>
          )}
          {rows.map((row, idx) => {
            const rank       = idx + 1
            const isMe       = row.user_id === currentUserId
            const isLeader   = idx === 0
            const isPlayoff  = rank <= PLAYOFF_SPOTS
            const rowBg      = isMe
              ? `${GOLD}12`
              : idx % 2 === 0 ? '#0D1220' : '#0A0E1A'
            const borderLeft = isMe ? `2px solid ${GOLD}66` : '2px solid transparent'
            const nameColor  = isLeader ? GOLD : isMe ? GOLD : '#E5E7EB'

            return (
              <div
                key={row.user_id}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '9px 8px',
                  backgroundColor: rowBg,
                  borderLeft,
                  borderRadius: 8,
                  gap: 0,
                }}
              >
                {/* Rank */}
                <div style={{
                  width: 28, flexShrink: 0, textAlign: 'center',
                  fontSize: 11, fontWeight: 900, color: isLeader ? GOLD : '#374151',
                  fontFamily: 'var(--font-barlow, sans-serif)',
                }}>
                  {rank}
                </div>

                {/* Playoff dot */}
                <div style={{ width: 8, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  <PlayoffDot show={isPlayoff} />
                </div>

                {/* Team name + longest streak tooltip */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: nameColor,
                    fontFamily: 'var(--font-barlow, sans-serif)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    letterSpacing: '0.01em',
                  }}>
                    {row.team_name}
                    {isMe && <span style={{ fontSize: 8, color: GOLD, marginLeft: 6, verticalAlign: 'middle', letterSpacing: '0.08em' }}>YOU</span>}
                  </div>
                  {row.longest_streak > 0 && (
                    <div style={{ fontSize: 9, color: '#2D3748', marginTop: 1 }}>
                      Best W streak: {row.longest_streak}
                    </div>
                  )}
                </div>

                {/* W */}
                <div style={{ width: 22, textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#34D399', fontFamily: 'var(--font-barlow, sans-serif)' }}>
                  {row.wins}
                </div>
                {/* L */}
                <div style={{ width: 22, textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#F87171', fontFamily: 'var(--font-barlow, sans-serif)' }}>
                  {row.losses}
                </div>
                {/* PF */}
                <div style={{ width: 52, textAlign: 'right', flexShrink: 0, fontSize: 11, color: '#9CA3AF' }}>
                  {Number(row.points_for).toFixed(1)}
                </div>
                {/* PA */}
                <div style={{ width: 52, textAlign: 'right', flexShrink: 0, fontSize: 11, color: '#4B5563' }}>
                  {Number(row.points_against).toFixed(1)}
                </div>
                {/* Streak */}
                <div style={{ width: 36, textAlign: 'right', flexShrink: 0 }}>
                  <StreakBadge streak={row.current_streak} />
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Bottom nav ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, padding: '24px 16px 0' }}>
          <button
            onClick={() => router.push(`/leagues/${id}/matchup`)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 8,
              background: '#0D1220', border: '1px solid #141E35',
              color: '#9CA3AF', fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em', fontWeight: 700,
            }}
          >
            MATCHUP
          </button>
          <button
            onClick={() => router.push(`/leagues/${id}/team`)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 8,
              background: '#0D1220', border: '1px solid #141E35',
              color: '#9CA3AF', fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em', fontWeight: 700,
            }}
          >
            MY ROSTER
          </button>
        </div>

      </div>
    </main>
  )
}
