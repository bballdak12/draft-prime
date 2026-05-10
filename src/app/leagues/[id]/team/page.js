'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { buildLineup } from '../../../../lib/scoring/lineup'

// ─── Tier constants ───────────────────────────────────────────────────────────
const TIER_COLOR = {
  legend: '#FFF8E7',
  hero:   '#FF4B33',
  gold:   '#FFD700',
  silver: '#A8A9AD',
  bronze: '#CD7F32',
}
const TIER_LABEL = {
  legend: 'LEGEND',
  hero:   'HERO',
  gold:   'GOLD',
  silver: 'SILVER',
  bronze: 'BRONZE',
}
const TIER_ORDER = { legend: 5, hero: 4, gold: 3, silver: 2, bronze: 1 }

const GOLD = '#F0B429'
const BG   = '#0A0E1A'

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatPill({ label, value }) {
  return (
    <span style={{ fontSize: 10, marginRight: 10 }}>
      <span style={{ color: '#4B5563', letterSpacing: '0.05em' }}>{label} </span>
      <span style={{ color: '#9CA3AF', fontWeight: 600 }}>
        {value != null ? Number(value).toFixed(1) : '—'}
      </span>
    </span>
  )
}

function TierBadge({ tier }) {
  const color = TIER_COLOR[tier] || '#A8A9AD'
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.08em',
      color,
      backgroundColor: `${color}1A`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      padding: '1px 5px',
      fontFamily: 'var(--font-barlow, sans-serif)',
      flexShrink: 0,
    }}>
      {TIER_LABEL[tier] || tier?.toUpperCase()}
    </span>
  )
}

function RosterRow({ slot, player, isStarter, isLast }) {
  const tier  = player?.tier
  const color = tier ? TIER_COLOR[tier] : null
  const rowBg = isStarter ? '#0F1628' : '#080C18'

  // Era display: "Patriots · 2001–2007" style
  const era = [player?.team, player?.era].filter(Boolean).join(' · ')

  // Legend name gets a subtle shimmer
  const nameStyle = tier === 'legend'
    ? {
        background: 'linear-gradient(90deg, #FFF8E7 30%, #FFD700 50%, #FFF8E7 70%)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'legendNameShimmer 3s linear infinite',
      }
    : { color: '#F9FAFB' }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      backgroundColor: rowBg,
      borderLeft: `3px solid ${color ? `${color}55` : '#12192E'}`,
      borderBottom: isLast ? 'none' : '1px solid #0D1220',
      padding: '11px 14px',
      gap: 10,
      minHeight: 60,
    }}>

      {/* Position slot */}
      <div style={{
        width: 42,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: color || '#2D3748',
        fontFamily: 'var(--font-barlow, sans-serif)',
        flexShrink: 0,
        textAlign: 'center',
      }}>
        {slot}
      </div>

      {/* Tier glow dot */}
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: color || '#1A2035',
        flexShrink: 0,
        boxShadow: color ? `0 0 7px 1px ${color}66` : 'none',
      }} />

      {/* Player info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {player ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'var(--font-barlow, sans-serif)',
                letterSpacing: '0.01em',
                ...nameStyle,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 170,
              }}>
                {player.name}
              </span>
              <TierBadge tier={tier} />
            </div>
            {era && (
              <div style={{ fontSize: 10, color: '#374151', marginTop: 1, letterSpacing: '0.02em' }}>
                {era}
              </div>
            )}
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center' }}>
              <StatPill label="CEI" value={player.ceiling} />
              <StatPill label="CON" value={player.consistency} />
              <StatPill label="FLR" value={player.floor} />
            </div>
          </>
        ) : (
          <span style={{ fontSize: 13, color: '#1F2937', fontStyle: 'italic', letterSpacing: '0.02em' }}>
            — Empty —
          </span>
        )}
      </div>

      {/* OVR badge */}
      {player ? (
        <div style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          borderRadius: 8,
          backgroundColor: `${color}18`,
          border: `1px solid ${color}44`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 18,
            fontWeight: 900,
            color,
            fontFamily: 'var(--font-barlow, sans-serif)',
            lineHeight: 1,
          }}>
            {player.overall_rating}
          </span>
          <span style={{ fontSize: 8, color: `${color}88`, letterSpacing: '0.08em', marginTop: 1 }}>
            OVR
          </span>
        </div>
      ) : (
        <div style={{ width: 44, height: 44 }} />
      )}
    </div>
  )
}

function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 800,
      color: GOLD,
      letterSpacing: '0.18em',
      fontFamily: 'var(--font-barlow, sans-serif)',
      padding: '0 16px',
      marginBottom: 6,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      {label}
      <div style={{ flex: 1, height: 1, backgroundColor: `${GOLD}22` }} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { id } = useParams()
  const router  = useRouter()

  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [league,   setLeague]   = useState(null)
  const [teamName, setTeamName] = useState('My Team')
  const [players,  setPlayers]  = useState([])
  const [lineup,   setLineup]   = useState(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // League
      const { data: leagueData } = await supabase
        .from('leagues').select('id, name').eq('id', id).single()
      if (!leagueData) { setError('League not found'); setLoading(false); return }
      setLeague(leagueData)

      // Profile / team name
      const { data: profile } = await supabase
        .from('profiles').select('team_name, display_name').eq('id', user.id).single()
      setTeamName(profile?.team_name || profile?.display_name || 'My Team')

      // Most recent draft
      const { data: draft } = await supabase
        .from('drafts').select('id, status, total_rounds')
        .eq('league_id', id)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()

      if (!draft) { setError('No draft found for this league'); setLoading(false); return }

      // My picks
      const { data: picks } = await supabase
        .from('draft_picks').select('player_id, pick_number, round')
        .eq('draft_id', draft.id)
        .eq('team_user_id', user.id)
        .order('pick_number')

      if (!picks?.length) {
        setLineup({ starters: [], bench: [] })
        setLoading(false)
        return
      }

      // Fetch player data (ceiling=CEI, consistency=CON, floor=FLR are on players table)
      const { data: playerData, error: pErr } = await supabase
        .from('players')
        .select('id, name, position, team, era, tier, overall_rating, ceiling, consistency, floor')
        .in('id', picks.map(p => p.player_id))

      if (pErr || !playerData?.length) {
        setError('Could not load player data')
        setLoading(false)
        return
      }

      setPlayers(playerData)
      setLineup(buildLineup(playerData))
      setLoading(false)
    }
    load()
  }, [id])

  // ── Summary stats ─────────────────────────────────────────────────────
  const avgOvr = players.length
    ? Math.round(players.reduce((s, p) => s + (p.overall_rating || 0), 0) / players.length)
    : null

  const bestTier = players.reduce((best, p) =>
    (TIER_ORDER[p.tier] || 0) > (TIER_ORDER[best] || 0) ? p.tier : best
  , 'bronze')

  const bestTierColor = TIER_COLOR[bestTier] || '#CD7F32'

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid #1A2035', borderTopColor: GOLD,
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#374151', fontSize: 13, fontFamily: 'sans-serif' }}>Loading roster…</p>
      </div>
    </main>
  )

  if (error) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#F87171', fontFamily: 'sans-serif' }}>{error}</p>
      <button onClick={() => router.push(`/leagues/${id}`)} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
        ← Back to league
      </button>
    </main>
  )

  const starters = lineup?.starters ?? []
  const bench    = lineup?.bench ?? []

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes legendNameShimmer {
          from { background-position: -200% center }
          to   { background-position:  200% center }
        }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 60 }}>

        {/* ── Sticky header ───────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          backgroundColor: '#060912EE',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #0D1220',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button
            onClick={() => router.push(`/leagues/${id}`)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4B5563', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, padding: 0,
            }}
          >
            ← {league?.name || 'League'}
          </button>
          <button
            onClick={() => router.push(`/leagues/${id}/draft`)}
            style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
              color: GOLD, background: `${GOLD}15`, border: `1px solid ${GOLD}44`,
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'var(--font-barlow, sans-serif)',
            }}
          >
            DRAFT GRADE
          </button>
        </div>

        {/* ── Team header ──────────────────────────────────────────────── */}
        <div style={{ padding: '20px 16px 16px' }}>
          <p style={{
            fontSize: 10, color: '#2D3748', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 4,
            fontFamily: 'var(--font-barlow, sans-serif)',
          }}>
            {league?.name}
          </p>
          <h1 style={{
            fontSize: 30, fontWeight: 900, color: '#F9FAFB', margin: 0,
            fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.02em',
          }}>
            {teamName}
          </h1>
        </div>

        {/* ── Summary bar ──────────────────────────────────────────────── */}
        <div style={{
          margin: '0 16px 24px',
          backgroundColor: '#0D1220',
          border: '1px solid #141E35',
          borderRadius: 10,
          padding: '14px 8px',
          display: 'flex',
        }}>
          {[
            { label: 'AVG OVR',   value: avgOvr ?? '—',                   color: '#D1D5DB' },
            { label: 'BEST TIER', value: bestTier.toUpperCase(),           color: bestTierColor },
            { label: 'PLAYERS',   value: players.length,                   color: '#D1D5DB' },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              flex: 1, textAlign: 'center',
              borderRight: i < 2 ? '1px solid #141E35' : 'none',
              padding: '0 4px',
            }}>
              <div style={{
                fontSize: 22, fontWeight: 900, color: stat.color,
                fontFamily: 'var(--font-barlow, sans-serif)', lineHeight: 1.1,
              }}>
                {stat.value}
              </div>
              <div style={{
                fontSize: 9, color: '#2D3748', letterSpacing: '0.12em',
                marginTop: 3, fontFamily: 'var(--font-barlow, sans-serif)',
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── STARTERS ─────────────────────────────────────────────────── */}
        <SectionHeader label="STARTERS" />
        <div style={{
          border: '1px solid #0D1220', borderRadius: 10,
          overflow: 'hidden', margin: '0 16px 24px',
        }}>
          {starters.map((s, i) => (
            <RosterRow
              key={`starter-${i}`}
              slot={s.slot}
              player={s.player}
              isStarter={true}
              isLast={i === starters.length - 1}
            />
          ))}
        </div>

        {/* ── BENCH ────────────────────────────────────────────────────── */}
        <SectionHeader label="BENCH" />
        <div style={{
          border: '1px solid #0D1220', borderRadius: 10,
          overflow: 'hidden', margin: '0 16px',
        }}>
          {bench.length > 0 ? (
            bench.slice(0, 6).map((player, i) => (
              <RosterRow
                key={player.id}
                slot={player.position}
                player={player}
                isStarter={false}
                isLast={i === Math.min(bench.length, 6) - 1}
              />
            ))
          ) : (
            <div style={{
              padding: '18px 14px', backgroundColor: '#080C18',
              color: '#1F2937', fontSize: 13, fontStyle: 'italic',
            }}>
              No bench players
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
