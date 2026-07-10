'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { HelmetSVG } from '../../../../lib/helmet/HelmetSVG'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#0A0E1A'
const GOLD   = '#F0B429'
const CARD   = '#0D1220'
const BORDER = '#1A2035'
const F      = 'var(--font-barlow), "Barlow Condensed", sans-serif'

const ROUND_LABEL = { 1: 'ROUND 1', 2: 'SEMIFINALS', 3: 'FINAL' }
const ROUND_WEEK  = { 1: 15, 2: 16, 3: 17 }

const teamName = p => p?.team_name || p?.display_name || 'Unknown'

// ─── Mini helmet ──────────────────────────────────────────────────────────────
function MiniHelmet({ profile, uid }) {
  return (
    <div style={{ width: 30, height: 26, flexShrink: 0 }}>
      <HelmetSVG
        base={profile?.helmet_color || '#1B2A4A'}
        secondary={profile?.helmet_secondary || '#F0B429'}
        pattern={profile?.helmet_pattern || 'solid'}
        uid={uid}
        width={30}
        height={26}
      />
    </div>
  )
}

// ─── One side of a matchup ────────────────────────────────────────────────────
function SeedRow({ userId, seed, score, profiles, isWinner, isComplete, slotHint, uid }) {
  if (!userId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
        minHeight: 40, color: '#374151', fontSize: 12, fontStyle: 'italic',
      }}>
        {slotHint}
      </div>
    )
  }

  const profile = profiles[userId]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', minHeight: 40,
      backgroundColor: isWinner ? `${GOLD}14` : 'transparent',
      borderLeft: `3px solid ${isWinner ? GOLD : 'transparent'}`,
    }}>
      <MiniHelmet profile={profile} uid={uid} />
      <span style={{
        fontSize: 10, fontWeight: 800, color: '#4B5563', fontFamily: F,
        minWidth: 16, letterSpacing: '0.03em',
      }}>
        {seed != null ? `#${seed}` : ''}
      </span>
      <span style={{
        flex: 1, fontSize: 12.5, fontFamily: F, letterSpacing: '0.01em',
        fontWeight: isWinner ? 800 : 600,
        color: isWinner ? GOLD : isComplete ? '#6B7280' : '#D1D5DB',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {teamName(profile)}
      </span>
      {isComplete && (
        <span style={{
          fontSize: 12.5, fontWeight: 800, fontFamily: F,
          color: isWinner ? GOLD : '#4B5563', minWidth: 40, textAlign: 'right',
        }}>
          {Number(score ?? 0).toFixed(1)}
        </span>
      )}
    </div>
  )
}

// ─── Matchup card ─────────────────────────────────────────────────────────────
function MatchupCard({ m, profiles, onOpen }) {
  const isComplete = m.status === 'complete'
  const clickable  = isComplete && m.high_seed_user_id && m.low_seed_user_id

  return (
    <div
      onClick={clickable ? () => onOpen(m) : undefined}
      style={{
        backgroundColor: CARD,
        border: `1px solid ${isComplete ? '#2A3450' : BORDER}`,
        borderRadius: 10, overflow: 'hidden',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.borderColor = GOLD + '77' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isComplete ? '#2A3450' : BORDER }}
    >
      <SeedRow
        userId={m.high_seed_user_id} seed={m.high_seed} score={m.high_score}
        profiles={profiles} isComplete={isComplete} uid={`${m.id}-h`}
        isWinner={isComplete && m.winner_user_id === m.high_seed_user_id}
        slotHint="Awaiting winner"
      />
      <div style={{ height: 1, backgroundColor: BORDER }} />
      <SeedRow
        userId={m.low_seed_user_id} seed={m.low_seed} score={m.low_score}
        profiles={profiles} isComplete={isComplete} uid={`${m.id}-l`}
        isWinner={isComplete && m.winner_user_id === m.low_seed_user_id}
        slotHint="Awaiting winner"
      />
    </div>
  )
}

// ─── Bye card ─────────────────────────────────────────────────────────────────
function ByeCard({ userId, seed, profiles, uid }) {
  const profile = profiles[userId]
  return (
    <div style={{
      backgroundColor: '#0B0F1C', border: `1px dashed ${BORDER}`, borderRadius: 10,
      padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 8, minHeight: 40,
    }}>
      <MiniHelmet profile={profile} uid={uid} />
      <span style={{ fontSize: 10, fontWeight: 800, color: '#4B5563', fontFamily: F, minWidth: 16 }}>
        #{seed}
      </span>
      <span style={{
        flex: 1, fontSize: 12.5, fontFamily: F, fontWeight: 600, color: '#6B7280',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {teamName(profile)}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', fontFamily: F,
        color: '#4B5563', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '2px 6px',
      }}>
        BYE
      </span>
    </div>
  )
}

// ─── One bracket (3 round columns) ────────────────────────────────────────────
function BracketColumns({ matchups, profiles, currentRound, onOpen }) {
  // Seeds sitting in a semifinal's high slot with no round-1 feeder had a bye.
  const semis     = matchups.filter(m => m.round === 2)
  const feederIds = new Set(matchups.map(m => m.feeds_into_matchup_id).filter(Boolean))
  const byes      = semis
    .filter(s => s.high_seed_user_id && feederIds.has(s.id))
    .map(s => ({ userId: s.high_seed_user_id, seed: s.high_seed }))

  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
      {[1, 2, 3].map(round => {
        const inRound = matchups.filter(m => m.round === round)
        if (!inRound.length && !(round === 1 && byes.length)) return null

        const isCurrent = round === currentRound

        return (
          <div key={round} style={{ flex: '1 0 200px', minWidth: 200 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8, paddingLeft: 2,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', fontFamily: F,
                color: isCurrent ? GOLD : '#4B5563',
              }}>
                {ROUND_LABEL[round]}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#374151', fontFamily: F, letterSpacing: '0.08em' }}>
                WK {ROUND_WEEK[round]}
              </span>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              justifyContent: 'center', minHeight: 100,
            }}>
              {inRound.map(m => (
                <MatchupCard key={m.id} m={m} profiles={profiles} onOpen={onOpen} />
              ))}
              {round === 1 && byes.map(b => (
                <ByeCard key={b.userId} userId={b.userId} seed={b.seed} profiles={profiles} uid={`bye-${b.userId}`} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Champion banner ──────────────────────────────────────────────────────────
function ChampionBanner({ userId, profiles }) {
  const profile = profiles[userId]
  return (
    <div style={{
      background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}08)`,
      border: `1px solid ${GOLD}55`, borderRadius: 14,
      padding: '18px 16px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 58, height: 50, flexShrink: 0 }}>
        <HelmetSVG
          base={profile?.helmet_color || '#1B2A4A'}
          secondary={profile?.helmet_secondary || '#F0B429'}
          pattern={profile?.helmet_pattern || 'solid'}
          uid="champ" width={58} height={50}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
          color: `${GOLD}BB`, fontFamily: F, marginBottom: 3,
        }}>
          🏆 LEAGUE CHAMPION
        </div>
        <div style={{
          fontSize: 22, fontWeight: 900, color: GOLD, fontFamily: F,
          letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {teamName(profile)}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlayoffsPage() {
  const { id } = useParams()
  const router = useRouter()

  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [league,      setLeague]      = useState(null)
  const [brackets,    setBrackets]    = useState([])
  const [profiles,    setProfiles]    = useState({})
  const [currentWeek, setCurrentWeek] = useState(15)
  const [showConsolation, setShowConsolation] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: lg } = await supabase.from('leagues').select('id, name').eq('id', id).single()
      if (!lg) { setError('League not found'); setLoading(false); return }
      setLeague(lg)

      const { data: season } = await supabase
        .from('app_seasons').select('id, current_week').eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()
      if (!season) { setError('No active season'); setLoading(false); return }
      setCurrentWeek(season.current_week)

      const { data: bracketRows, error: bErr } = await supabase
        .from('playoff_brackets')
        .select(`
          id, bracket_type,
          playoff_matchups (
            id, round, week, status,
            high_seed_user_id, low_seed_user_id, high_seed, low_seed,
            high_score, low_score, winner_user_id, feeds_into_matchup_id
          )
        `)
        .eq('league_id', id)
        .eq('season_id', season.id)

      if (bErr) { setError(`Failed to load brackets: ${bErr.message}`); setLoading(false); return }
      if (!bracketRows?.length) {
        setError('Playoffs have not started yet'); setLoading(false); return
      }
      setBrackets(bracketRows)

      const userIds = [...new Set(
        bracketRows.flatMap(b => b.playoff_matchups)
          .flatMap(m => [m.high_seed_user_id, m.low_seed_user_id])
          .filter(Boolean)
      )]

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, team_name, display_name, helmet_color, helmet_secondary, helmet_pattern')
        .in('id', userIds)

      setProfiles(Object.fromEntries((profs ?? []).map(p => [p.id, p])))
      setLoading(false)
    }
    load()
  }, [id, router])

  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${BORDER}`, borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )

  if (error) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#6B7280', fontFamily: 'sans-serif', fontSize: 14 }}>{error}</p>
      <button onClick={() => router.push(`/leagues/${id}`)} style={{ color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back</button>
    </main>
  )

  const championship = brackets.find(b => b.bracket_type === 'championship')
  const consolation  = brackets.find(b => b.bracket_type === 'consolation')

  const currentRound = currentWeek >= 17 ? 3 : currentWeek === 16 ? 2 : 1

  const champFinal = championship?.playoff_matchups.find(m => m.round === 3)
  const champion   = champFinal?.status === 'complete' ? champFinal.winner_user_id : null

  const openMatchup = m => router.push(`/leagues/${id}/matchup?pm=${m.id}`)

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 14px 48px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          backgroundColor: '#060912EE', backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${CARD}`, margin: '0 -14px 18px',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button
            onClick={() => router.push(`/leagues/${id}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: 0 }}
          >
            ← {league?.name}
          </button>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#D1D5DB', fontFamily: F, letterSpacing: '0.05em' }}>
            PLAYOFFS
          </span>
        </div>

        {champion && <ChampionBanner userId={champion} profiles={profiles} />}

        {/* ── Championship bracket ───────────────────────────────────────── */}
        {championship && (
          <>
            <h2 style={{
              margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: GOLD,
              letterSpacing: '0.14em', fontFamily: F,
            }}>
              CHAMPIONSHIP BRACKET
            </h2>
            <BracketColumns
              matchups={championship.playoff_matchups}
              profiles={profiles}
              currentRound={currentRound}
              onOpen={openMatchup}
            />
          </>
        )}

        {/* ── Consolation bracket ────────────────────────────────────────── */}
        {consolation && (
          <div style={{ marginTop: 28 }}>
            <button
              onClick={() => setShowConsolation(v => !v)}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderTop: `1px solid ${BORDER}`,
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: 800, color: '#4B5563',
                letterSpacing: '0.14em', fontFamily: F,
              }}>
                CONSOLATION BRACKET
              </span>
              <span style={{ color: '#374151', fontSize: 12 }}>{showConsolation ? '▲' : '▼'}</span>
            </button>

            {showConsolation && (
              <div style={{ marginTop: 10 }}>
                <BracketColumns
                  matchups={consolation.playoff_matchups}
                  profiles={profiles}
                  currentRound={currentRound}
                  onOpen={openMatchup}
                />
              </div>
            )}
          </div>
        )}

        <p style={{ marginTop: 22, fontSize: 11, color: '#2D3748', textAlign: 'center', fontFamily: 'sans-serif' }}>
          Tap a completed matchup to see the box score.
        </p>
      </div>
    </main>
  )
}
