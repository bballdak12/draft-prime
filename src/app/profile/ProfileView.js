'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { HelmetSVG } from '../../lib/helmet/HelmetSVG'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#0A0E1A'
const GOLD   = '#F0B429'
const CARD   = '#0D1220'
const BORDER = '#1A2035'
const F      = 'var(--font-barlow), "Barlow Condensed", sans-serif'

const TIER_COLOR = {
  bronze: '#CD7F32', silver: '#C0C0C0', gold: '#F0B429', earned: '#34D399',
}
const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', earned: 'Earned' }

function memberSince(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Badge detail modal ─────────────────────────────────────────────────────────
function BadgeModal({ badge, earned, onClose }) {
  const color = earned ? (TIER_COLOR[earned.level] ?? GOLD) : '#374151'
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, backgroundColor: '#0A0E1Acc',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: CARD, border: `1px solid ${color}55`, borderTop: `3px solid ${color}`,
          borderRadius: 16, padding: '22px', maxWidth: 340, width: '100%', textAlign: 'center',
        }}
      >
        <div style={{
          fontSize: 52, lineHeight: 1, marginBottom: 10,
          filter: earned ? `drop-shadow(0 0 14px ${color}88)` : 'grayscale(1)',
          opacity: earned ? 1 : 0.35,
        }}>
          {badge.icon}
        </div>
        <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#F9FAFB', fontFamily: F }}>
          {badge.name}
        </h3>
        {earned ? (
          <span style={{
            display: 'inline-block', margin: '0 0 10px', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
            color, background: `${color}1A`, border: `1px solid ${color}55`, borderRadius: 4, padding: '2px 8px', fontFamily: F,
          }}>
            {(TIER_LABEL[earned.level] ?? 'Earned').toUpperCase()}
            {earned.count > 1 ? ` · ${earned.count}×` : ''}
          </span>
        ) : (
          <span style={{ display: 'block', fontSize: 11, color: '#4B5563', margin: '0 0 10px', letterSpacing: '0.1em', fontFamily: F }}>
            🔒 LOCKED
          </span>
        )}
        <p style={{ margin: '0 0 6px', fontSize: 13, color: '#9CA3AF', lineHeight: 1.5 }}>{badge.description}</p>
        {earned && (
          <p style={{ margin: 0, fontSize: 11, color: '#4B5563' }}>Earned {fmtDate(earned.earned_at)}</p>
        )}
        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 10,
            background: '#060912', border: `1px solid ${BORDER}`, color: '#9CA3AF', fontSize: 13, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────────
export default function ProfileView({ userId }) {
  const router  = useRouter()
  const params  = useSearchParams()
  const ctxLeague = params.get('league')   // shared-league context for H2H

  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [viewerId, setViewerId] = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [catalog,  setCatalog]  = useState([])
  const [earned,   setEarned]   = useState({})     // badge_id → user_badge row
  const [career,   setCareer]   = useState({ wins: 0, losses: 0, championships: 0 })
  const [history,  setHistory]  = useState([])
  const [h2h,      setH2h]      = useState(null)
  const [openBadge, setOpenBadge] = useState(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setViewerId(user.id)

    // Profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, display_name, team_name, helmet_color, helmet_secondary, helmet_pattern, created_at')
      .eq('id', userId).maybeSingle()
    if (!prof) { setError('Profile not found.'); setLoading(false); return }
    setProfile(prof)

    // Badge catalog + this user's earned badges
    const [{ data: badges }, { data: userBadges }] = await Promise.all([
      supabase.from('badges').select('*').order('sort_order'),
      supabase.from('user_badges').select('*').eq('user_id', userId),
    ])
    setCatalog(badges ?? [])
    setEarned(Object.fromEntries((userBadges ?? []).map(b => [b.badge_id, b])))

    // Career record: sum across all of the user's standings rows
    const { data: standings } = await supabase
      .from('league_standings')
      .select('league_id, season_id, wins, losses, points_for')
      .eq('user_id', userId)
    const totW = (standings ?? []).reduce((s, r) => s + (r.wins || 0), 0)
    const totL = (standings ?? []).reduce((s, r) => s + (r.losses || 0), 0)
    const champ = (userBadges ?? []).find(b => b.badge_id === 'league_champion')
    setCareer({ wins: totW, losses: totL, championships: champ?.count ?? 0 })

    // Season history: rank the user within each (league, season)
    const leagueIds = [...new Set((standings ?? []).map(r => r.league_id))]
    const seasonIds = [...new Set((standings ?? []).map(r => r.season_id))]
    const [{ data: allStand }, { data: leagues }, { data: seasons }] = await Promise.all([
      leagueIds.length
        ? supabase.from('league_standings').select('league_id, season_id, user_id, wins, losses, points_for').in('league_id', leagueIds)
        : Promise.resolve({ data: [] }),
      leagueIds.length
        ? supabase.from('leagues').select('id, name').in('id', leagueIds)
        : Promise.resolve({ data: [] }),
      seasonIds.length
        ? supabase.from('app_seasons').select('id, season_number').in('id', seasonIds)
        : Promise.resolve({ data: [] }),
    ])
    const leagueName = Object.fromEntries((leagues ?? []).map(l => [l.id, l.name]))
    const seasonNum  = Object.fromEntries((seasons ?? []).map(s => [s.id, s.season_number]))

    const rows = (standings ?? []).map(r => {
      const peers = (allStand ?? [])
        .filter(s => s.league_id === r.league_id && s.season_id === r.season_id)
        .sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : b.points_for - a.points_for)
      const place = peers.findIndex(s => s.user_id === userId) + 1
      return {
        key: `${r.league_id}-${r.season_id}`,
        league: leagueName[r.league_id] || 'League',
        season: seasonNum[r.season_id] ?? '—',
        wins: r.wins, losses: r.losses,
        place, teams: peers.length,
      }
    }).sort((a, b) => (b.season - a.season))
    setHistory(rows)

    // H2H — only when viewing someone else from a shared-league context
    if (ctxLeague && userId !== user.id) {
      const { data: matchups } = await supabase
        .from('weekly_matchups')
        .select('home_team_user_id, away_team_user_id, home_score, away_score, status')
        .eq('league_id', ctxLeague)
        .eq('status', 'complete')
      let vw = 0, vl = 0
      for (const m of (matchups ?? [])) {
        const pair = [m.home_team_user_id, m.away_team_user_id]
        if (!pair.includes(user.id) || !pair.includes(userId)) continue
        const viewerHome = m.home_team_user_id === user.id
        const viewerScore = viewerHome ? m.home_score : m.away_score
        const otherScore  = viewerHome ? m.away_score : m.home_score
        if (Number(viewerScore) > Number(otherScore)) vw++
        else if (Number(viewerScore) < Number(otherScore)) vl++
      }
      if (vw + vl > 0) setH2h({ wins: vw, losses: vl })
    }

    setLoading(false)
  }, [userId, ctxLeague])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )
  if (error) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#F87171', fontFamily: 'sans-serif' }}>{error}</p>
      <button onClick={() => router.back()} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back</button>
    </main>
  )

  const isOwn      = viewerId === userId
  const displayName = profile.display_name || 'Manager'
  const earnedCount = Object.keys(earned).length

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {openBadge && (
        <BadgeModal badge={openBadge} earned={earned[openBadge.id] ?? null} onClose={() => setOpenBadge(null)} />
      )}

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 56px' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: 0, marginBottom: 16 }}
        >
          ← Back
        </button>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <HelmetSVG
            base={profile.helmet_color || '#1B2A4A'}
            secondary={profile.helmet_secondary || GOLD}
            pattern={profile.helmet_pattern || 'solid'}
            uid={`profile-${userId}`}
            width={76} height={66}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#F9FAFB', fontFamily: F, lineHeight: 1.1 }}>
              {displayName}{isOwn && <span style={{ fontSize: 12, color: '#374151', fontWeight: 400 }}> · You</span>}
            </h1>
            {profile.team_name && profile.team_name !== '—' && (
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9CA3AF', fontFamily: F, fontWeight: 700 }}>{profile.team_name}</p>
            )}
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#4B5563', letterSpacing: '0.04em' }}>
              Member since {memberSince(profile.created_at)}
            </p>
          </div>
          {isOwn && (
            <button
              onClick={() => router.push('/setup')}
              style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, backgroundColor: '#1A2035', color: '#9CA3AF', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              Edit
            </button>
          )}
        </div>

        {/* ── Career record ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 22,
        }}>
          {[
            { label: 'CAREER RECORD', value: `${career.wins}–${career.losses}` },
            { label: 'WIN %', value: (career.wins + career.losses) ? `${Math.round((career.wins / (career.wins + career.losses)) * 100)}%` : '—' },
            { label: 'TITLES', value: `${career.championships}`, gold: true },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
              padding: '12px 8px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.gold ? GOLD : '#F9FAFB', fontFamily: F, lineHeight: 1 }}>
                {s.gold && career.championships > 0 ? '🏆 ' : ''}{s.value}
              </div>
              <div style={{ fontSize: 9, color: '#4B5563', letterSpacing: '0.1em', fontFamily: F, fontWeight: 700, marginTop: 5 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── H2H (contextual) ──────────────────────────────────────────────── */}
        {h2h && (
          <div style={{
            backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: '12px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: '#4B5563', letterSpacing: '0.1em', fontFamily: F, fontWeight: 700 }}>
              HEAD-TO-HEAD vs YOU
            </span>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#F9FAFB', fontFamily: F }}>
              {h2h.losses}–{h2h.wins}
              <span style={{ fontSize: 10, color: '#4B5563', fontWeight: 400 }}> (their record)</span>
            </span>
          </div>
        )}

        {/* ── Badge shelf ───────────────────────────────────────────────────── */}
        <h2 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: '#4B5563', letterSpacing: '0.12em', fontFamily: F }}>
          BADGES ({earnedCount}/{catalog.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
          {catalog.map(badge => {
            const e = earned[badge.id]
            const color = e ? (TIER_COLOR[e.level] ?? GOLD) : '#374151'
            return (
              <button
                key={badge.id}
                onClick={() => setOpenBadge(badge)}
                title={badge.name}
                style={{
                  aspectRatio: '1', borderRadius: 12, cursor: 'pointer',
                  backgroundColor: e ? `${color}12` : '#0A0E1A',
                  border: `1px solid ${e ? `${color}55` : '#141E35'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  position: 'relative',
                }}
              >
                <span style={{
                  fontSize: 26, lineHeight: 1,
                  filter: e ? `drop-shadow(0 0 8px ${color}77)` : 'grayscale(1)',
                  opacity: e ? 1 : 0.25,
                }}>
                  {badge.icon}
                </span>
                {e ? (
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color, fontFamily: F }}>
                    {(TIER_LABEL[e.level] ?? 'Earned').toUpperCase()}{e.count > 1 ? ` ${e.count}×` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, opacity: 0.5 }}>🔒</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Season history ────────────────────────────────────────────────── */}
        <h2 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: '#4B5563', letterSpacing: '0.12em', fontFamily: F }}>
          SEASON HISTORY
        </h2>
        {history.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#374151', padding: '12px 0' }}>No completed seasons yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(h => {
              const medal = h.place === 1 ? '🥇' : h.place === 2 ? '🥈' : h.place === 3 ? '🥉' : null
              return (
                <div key={h.key} style={{
                  backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#F9FAFB', fontFamily: F, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.league}
                    </div>
                    <div style={{ fontSize: 11, color: '#4B5563' }}>Season {h.season} · {h.wins}–{h.losses}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: h.place <= 3 ? GOLD : '#9CA3AF', fontFamily: F, flexShrink: 0 }}>
                    {medal ? `${medal} ` : ''}{h.place ? `${h.place}` : '—'}{h.teams ? <span style={{ color: '#374151', fontWeight: 400 }}>/{h.teams}</span> : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
