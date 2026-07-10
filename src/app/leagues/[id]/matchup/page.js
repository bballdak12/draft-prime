'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────────────────────
const TIER_COLOR = {
  legend: '#FFF8E7', hero: '#FF4B33', gold: '#FFD700',
  silver: '#A8A9AD', bronze: '#CD7F32',
}
const SLOT_RANK = { QB: 0, RB: 1, WR: 2, TE: 3, FLEX: 4, DST: 5, K: 6 }
const GOLD = '#F0B429'
const BG   = '#0A0E1A'

// All stat columns we need for the modal
const GAME_SELECT = `
  season, week, opponent, is_playoff, half_ppr_adjusted,
  pass_att, pass_comp, pass_yds, pass_td, pass_int,
  rush_att, rush_yds, rush_td,
  targets, receptions, rec_yds, rec_td,
  fg_att_under40, fg_made_under40, fg_att_40_49, fg_made_40_49,
  fg_att_50plus, fg_made_50plus, pat_att, pat_made,
  dst_sacks, dst_tfl, dst_int, dst_fumble_rec, dst_def_td, dst_safety, dst_pts_allowed
`.trim()

// ─── Stat line builders ───────────────────────────────────────────────────────
function statLines(game, position) {
  if (!game) return []
  const pos = (position ?? '').toUpperCase()
  const n   = v => v ?? 0

  if (pos === 'QB') {
    const lines = [
      { label: 'Passing',  value: `${n(game.pass_comp)}/${n(game.pass_att)} CMP · ${n(game.pass_yds)} YDS · ${n(game.pass_td)} TD · ${n(game.pass_int)} INT` },
    ]
    if (n(game.rush_yds) || n(game.rush_td)) {
      lines.push({ label: 'Rushing', value: `${n(game.rush_att)} CAR · ${n(game.rush_yds)} YDS · ${n(game.rush_td)} TD` })
    }
    return lines
  }
  if (pos === 'RB') return [
    { label: 'Rushing',   value: `${n(game.rush_att)} CAR · ${n(game.rush_yds)} YDS · ${n(game.rush_td)} TD` },
    { label: 'Receiving', value: `${n(game.receptions)}/${n(game.targets)} REC · ${n(game.rec_yds)} YDS · ${n(game.rec_td)} TD` },
  ]
  if (pos === 'WR' || pos === 'TE') {
    const lines = [
      { label: 'Receiving', value: `${n(game.receptions)}/${n(game.targets)} REC · ${n(game.rec_yds)} YDS · ${n(game.rec_td)} TD` },
    ]
    if (n(game.rush_yds)) lines.push({ label: 'Rushing', value: `${n(game.rush_att)} CAR · ${n(game.rush_yds)} YDS · ${n(game.rush_td)} TD` })
    return lines
  }
  if (pos === 'DST') return [
    { label: 'Defense',  value: `${n(game.dst_sacks)} SCK · ${n(game.dst_int)} INT · ${n(game.dst_fumble_rec)} FR · ${n(game.dst_tfl)} TFL · ${n(game.dst_def_td)} TD · ${n(game.dst_safety)} SAF` },
    ...(game.dst_pts_allowed != null ? [{ label: 'Pts Allowed', value: String(game.dst_pts_allowed) }] : []),
  ]
  if (pos === 'K') {
    const fgs = [
      n(game.fg_att_under40)  ? `${n(game.fg_made_under40)}/${n(game.fg_att_under40)} <40`   : null,
      n(game.fg_att_40_49)    ? `${n(game.fg_made_40_49)}/${n(game.fg_att_40_49)} 40–49`     : null,
      n(game.fg_att_50plus)   ? `${n(game.fg_made_50plus)}/${n(game.fg_att_50plus)} 50+`     : null,
    ].filter(Boolean)
    return [
      { label: 'Field Goals', value: fgs.length ? fgs.join(' · ') : '—' },
      { label: 'PAT',         value: `${n(game.pat_made)}/${n(game.pat_att)}` },
    ]
  }
  return []
}

// ─── Stat Modal ───────────────────────────────────────────────────────────────
function StatModal({ row, onClose }) {
  const { players: p, player_games: g } = row
  const tier  = p?.tier
  const color = TIER_COLOR[tier] || '#A8A9AD'
  const lines = statLines(g, p?.position)
  const gameCtx = g
    ? `${g.is_playoff ? '🏆 Playoff · ' : ''}vs ${g.opponent} · ${g.season} Wk ${g.week}`
    : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        backgroundColor: '#0A0E1Acc',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#0D1220',
          border: `1px solid ${color}44`,
          borderTop: `3px solid ${color}`,
          borderRadius: 14,
          padding: '20px 22px 24px',
          maxWidth: 360, width: '100%',
          boxShadow: `0 0 40px ${color}22`,
        }}
      >
        {/* Player + tier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 7px ${color}` }} />
          <span style={{ fontSize: 17, fontWeight: 800, color: '#F9FAFB', fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.01em' }}>
            {p?.name ?? 'Unknown'}
          </span>
          <span style={{ fontSize: 9, color, background: `${color}1A`, border: `1px solid ${color}44`, borderRadius: 3, padding: '1px 5px', fontWeight: 700, fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em', marginLeft: 'auto' }}>
            {tier?.toUpperCase()}
          </span>
        </div>

        {/* Slot + position */}
        <p style={{ fontSize: 11, color: '#4B5563', margin: '0 0 12px 17px', letterSpacing: '0.05em' }}>
          {row.slot} · {p?.position} · {p?.overall_rating} OVR
        </p>

        {/* Game context */}
        {gameCtx && (
          <div style={{
            backgroundColor: '#060912', borderRadius: 8, padding: '8px 12px',
            marginBottom: 14, fontSize: 12, color: '#6B7280', letterSpacing: '0.03em',
          }}>
            {gameCtx}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 10, color: '#4B5563', letterSpacing: '0.08em', fontFamily: 'var(--font-barlow, sans-serif)', flexShrink: 0 }}>
                {label.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'right' }}>{value}</span>
            </div>
          ))}
          {!lines.length && <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>No stat breakdown available.</p>}
        </div>

        {/* AI game recap */}
        {row.game_blurb && (
          <p style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid #141E35',
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic', fontSize: 13, lineHeight: 1.55,
            color: '#B8BEC9',
          }}>
            {row.game_blurb}
          </p>
        )}

        {/* Score */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #141E35', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#374151', letterSpacing: '0.1em', fontFamily: 'var(--font-barlow, sans-serif)' }}>HALF PPR</span>
          <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'var(--font-barlow, sans-serif)' }}>
            {(row.score ?? 0).toFixed(2)} pts
          </span>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '9px 0',
            background: '#060912', border: '1px solid #141E35', borderRadius: 8,
            color: '#4B5563', fontSize: 12, cursor: 'pointer', letterSpacing: '0.05em',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Player row ───────────────────────────────────────────────────────────────
function PlayerRow({ row, isRevealed, onTap }) {
  const { players: p, player_games: g } = row
  const tier  = p?.tier
  const color = TIER_COLOR[tier] || '#374151'

  const gameLabel = g
    ? `vs ${g.opponent} · ${g.season} Wk ${g.week}${g.is_playoff ? ' 🏆' : ''}`
    : null

  return (
    <div
      onClick={() => isRevealed && onTap(row)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 8px',
        borderBottom: '1px solid #0D1220',
        cursor: isRevealed ? 'pointer' : 'default',
        borderRadius: 6,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (isRevealed) e.currentTarget.style.background = '#141E35' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Slot */}
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.07em',
        color: color, width: 34, flexShrink: 0, textAlign: 'center',
        fontFamily: 'var(--font-barlow, sans-serif)',
      }}>
        {row.slot}
      </span>

      {/* Tier dot */}
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        backgroundColor: p ? color : '#1F2937',
        boxShadow: p ? `0 0 5px ${color}88` : 'none',
      }} />

      {/* Player info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: p ? '#E5E7EB' : '#374151',
          fontFamily: 'var(--font-barlow, sans-serif)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.2,
        }}>
          {p?.name ?? '— Empty —'}
        </div>
        {p && (
          <div style={{ fontSize: 9, color: '#374151', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isRevealed && gameLabel ? gameLabel : '🔒 Mystery Game'}
          </div>
        )}
      </div>

      {/* Score */}
      {p && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          {isRevealed ? (
            <span style={{ fontSize: 13, fontWeight: 900, color, fontFamily: 'var(--font-barlow, sans-serif)' }}>
              {(row.score ?? 0).toFixed(1)}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#2D3748' }}>—</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Team Column ──────────────────────────────────────────────────────────────
function TeamColumn({ teamName, record, score, rows, isMe, isWinner, isFinal, isRevealed, onTap }) {
  const borderColor   = isMe ? GOLD : 'transparent'
  const headerGlow    = isFinal && isWinner ? `0 0 24px ${GOLD}44` : 'none'
  const scoreColor    = isWinner && isFinal ? GOLD : '#F9FAFB'

  const sorted = [...rows].sort((a, b) => {
    const ra = SLOT_RANK[a.slot] ?? 9
    const rb = SLOT_RANK[b.slot] ?? 9
    return ra !== rb ? ra - rb : (b.score ?? 0) - (a.score ?? 0)
  })

  return (
    <div style={{
      flex: 1, minWidth: 0,
      borderLeft: `2px solid ${borderColor}`,
      boxShadow: headerGlow,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: '#0D1220',
    }}>
      {/* Team header */}
      <div style={{
        padding: '10px 10px 8px',
        background: isFinal && isWinner ? `linear-gradient(180deg, ${GOLD}18 0%, transparent 100%)` : 'transparent',
        borderBottom: '1px solid #141E35',
      }}>
        {isMe && (
          <div style={{ fontSize: 8, color: GOLD, letterSpacing: '0.12em', fontFamily: 'var(--font-barlow, sans-serif)', marginBottom: 2 }}>YOU</div>
        )}
        <div style={{
          fontSize: 13, fontWeight: 900, color: '#F9FAFB',
          fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.02em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {teamName}
        </div>
        <div style={{ fontSize: 10, color: '#4B5563', marginTop: 1 }}>
          {record}
        </div>
      </div>

      {/* Score */}
      <div style={{ padding: '12px 10px 10px', borderBottom: '1px solid #0A0E1A', textAlign: 'center' }}>
        <span style={{
          fontSize: 38, fontWeight: 900, color: scoreColor,
          fontFamily: 'var(--font-barlow, sans-serif)', lineHeight: 1,
          transition: 'color 0.3s',
        }}>
          {isFinal || isRevealed ? score.toFixed(2) : '—'}
        </span>
        {isFinal && isWinner && (
          <div style={{ fontSize: 9, color: GOLD, letterSpacing: '0.15em', fontFamily: 'var(--font-barlow, sans-serif)', marginTop: 4 }}>
            ★ WINNER
          </div>
        )}
      </div>

      {/* Roster rows */}
      <div style={{ padding: '4px 6px 6px' }}>
        {sorted.length ? (
          sorted.map((row, i) => (
            <PlayerRow
              key={row.player_id ?? i}
              row={row}
              isRevealed={isRevealed || isFinal}
              onTap={onTap}
            />
          ))
        ) : (
          <p style={{ fontSize: 11, color: '#1F2937', padding: 8, fontStyle: 'italic' }}>No starters</p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
// useSearchParams forces a client-side render up to the nearest Suspense
// boundary, and a production build of a static page fails without one.
export default function MatchupPage() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <MatchupView />
    </Suspense>
  )
}

function CenteredSpinner() {
  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )
}

function MatchupView() {
  const { id }   = useParams()
  const router   = useRouter()

  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [league,         setLeague]         = useState(null)
  const [currentUserId,  setCurrentUserId]  = useState(null)
  const [matchup,        setMatchup]        = useState(null)
  const [myRows,         setMyRows]         = useState([])
  const [oppRows,        setOppRows]        = useState([])
  const [myProfile,      setMyProfile]      = useState(null)
  const [oppProfile,     setOppProfile]     = useState(null)
  const [myRecord,       setMyRecord]       = useState({ wins: 0, losses: 0 })
  const [oppRecord,      setOppRecord]      = useState({ wins: 0, losses: 0 })
  const [selectedRow,    setSelectedRow]    = useState(null)
  const [currentWeek,    setCurrentWeek]    = useState(1)
  // The team shown in the left column. Normally the viewer; when viewing a
  // playoff matchup they aren't in, the high seed takes the left column.
  const [viewUserId,     setViewUserId]     = useState(null)

  const searchParams   = useSearchParams()
  const playoffMatchId = searchParams.get('pm')

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
        .from('app_seasons').select('id, current_week').eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()
      if (!season) { setError('No active season'); setLoading(false); return }

      // A `pm` query param means "show this playoff matchup" — the bracket page
      // links here. Playoff matchups are normalized to the home/away shape the
      // rest of this page renders: high seed is home, low seed is away.
      let m
      if (playoffMatchId) {
        const { data: pm } = await supabase
          .from('playoff_matchups')
          .select('id, week, high_seed_user_id, low_seed_user_id, high_score, low_score, status')
          .eq('id', playoffMatchId)
          .eq('league_id', id)
          .maybeSingle()

        if (!pm)                       { setError('Playoff matchup not found');   setLoading(false); return }
        if (!pm.high_seed_user_id || !pm.low_seed_user_id) {
          setError('That playoff matchup has no opponent yet'); setLoading(false); return
        }

        m = {
          id:                pm.id,
          week:              pm.week,
          home_team_user_id: pm.high_seed_user_id,
          away_team_user_id: pm.low_seed_user_id,
          home_score:        pm.high_score,
          away_score:        pm.low_score,
          status:            pm.status,
        }
      } else {
        const { data: matchups } = await supabase
          .from('weekly_matchups')
          .select('id, week, home_team_user_id, away_team_user_id, home_score, away_score, status')
          .eq('league_id', id)
          .eq('season_id', season.id)
          .eq('week', season.current_week)
          .or(`home_team_user_id.eq.${user.id},away_team_user_id.eq.${user.id}`)
          .limit(1)

        m = matchups?.[0]
        if (!m) { setError(`No matchup found for week ${season.current_week}`); setLoading(false); return }
      }

      setMatchup(m)
      setCurrentWeek(m.week)

      // The viewer takes the left column when they're playing; otherwise the
      // home (high) seed does, so a spectator still sees a coherent matchup.
      const isParticipant = m.home_team_user_id === user.id || m.away_team_user_id === user.id
      const viewId        = isParticipant ? user.id : m.home_team_user_id
      setViewUserId(viewId)

      const oppId = m.home_team_user_id === viewId ? m.away_team_user_id : m.home_team_user_id

      // Load starter scores + player data.  Fetch player_games separately to
      // avoid PostgREST FK-embed RLS issues — the authenticated-role policy on
      // player_games only resolves cleanly in a direct table select.
      const { data: allScores, error: se } = await supabase
        .from('weekly_player_scores')
        .select('user_id, slot, score, is_starter, game_revealed, player_id, game_id, game_blurb, players(name, position, tier, overall_rating)')
        .eq('league_id', id)
        .eq('season_id', season.id)
        .eq('week', m.week)
        .in('user_id', [viewId, oppId])
        .eq('is_starter', true)

      if (se) { setError(`Failed to load scores: ${se.message}`); setLoading(false); return }

      // Separate query for game details using game_ids
      const gameIds = [...new Set((allScores ?? []).map(r => r.game_id).filter(Boolean))]
      let gameMap = {}
      if (gameIds.length) {
        const { data: games } = await supabase
          .from('player_games')
          .select(`id, ${GAME_SELECT}`)
          .in('id', gameIds)
        gameMap = Object.fromEntries((games ?? []).map(g => [g.id, g]))
      }

      // Merge game data into score rows
      const enriched = (allScores ?? []).map(r => ({
        ...r,
        player_games: r.game_id ? (gameMap[r.game_id] ?? null) : null,
      }))

      setMyRows(enriched.filter(r => r.user_id === viewId))
      setOppRows(enriched.filter(r => r.user_id === oppId))

      // Profiles
      const { data: profiles } = await supabase
        .from('profiles').select('id, team_name, display_name')
        .in('id', [viewId, oppId])
      const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
      setMyProfile(pMap[viewId])
      setOppProfile(pMap[oppId])

      // Standings (for records)
      const { data: standings } = await supabase
        .from('league_standings').select('user_id, wins, losses')
        .eq('league_id', id).eq('season_id', season.id)
        .in('user_id', [viewId, oppId])
      const sMap = Object.fromEntries((standings ?? []).map(s => [s.user_id, s]))
      setMyRecord(sMap[viewId] ?? { wins: 0, losses: 0 })
      setOppRecord(sMap[oppId] ?? { wins: 0, losses: 0 })

      setLoading(false)
    }
    load()
  }, [id, playoffMatchId])

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

  const isFinal   = matchup?.status === 'complete'
  const isScoring = matchup?.status === 'scoring'
  const viewIsHome = viewUserId === matchup?.home_team_user_id
  const myScore   = viewIsHome ? matchup?.home_score : matchup?.away_score
  const oppScore  = viewIsHome ? matchup?.away_score : matchup?.home_score
  const iAmWinner = isFinal && (myScore ?? 0) > (oppScore ?? 0)
  const oppWinner = isFinal && (oppScore ?? 0) > (myScore ?? 0)

  const statusLabel  = isFinal ? 'Final' : isScoring ? 'Scoring' : 'Scheduled'
  const statusColor  = isFinal ? GOLD : isScoring ? '#34D399' : '#6B7280'

  const myName  = myProfile?.team_name  || myProfile?.display_name  || 'My Team'
  const oppName = oppProfile?.team_name || oppProfile?.display_name || 'Opponent'

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {selectedRow && <StatModal row={selectedRow} onClose={() => setSelectedRow(null)} />}

      <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 48 }}>

        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: 800, color: '#D1D5DB',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.05em',
            }}>
              WEEK {currentWeek}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: statusColor, background: `${statusColor}1A`,
              border: `1px solid ${statusColor}44`,
              borderRadius: 4, padding: '2px 7px',
              fontFamily: 'var(--font-barlow, sans-serif)',
            }}>
              {statusLabel.toUpperCase()}
            </span>
          </div>
        </div>

        {/* ── Scheduled message ─────────────────────────────────────────── */}
        {!isFinal && !isScoring && (
          <div style={{ textAlign: 'center', padding: '16px 16px 4px', color: '#374151', fontSize: 12 }}>
            Scores reveal when the week goes live
          </div>
        )}

        {/* ── Two-column matchup ────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 12px 0', alignItems: 'flex-start' }}>
          <TeamColumn
            teamName={myName}
            record={`${myRecord.wins}–${myRecord.losses}`}
            score={myScore ?? 0}
            rows={myRows}
            // The left column is the viewer's team only when they're playing.
            // Spectating a playoff matchup puts the high seed here instead.
            isMe={viewUserId === currentUserId}
            isWinner={iAmWinner}
            isFinal={isFinal}
            isRevealed={isScoring}
            onTap={setSelectedRow}
          />
          <TeamColumn
            teamName={oppName}
            record={`${oppRecord.wins}–${oppRecord.losses}`}
            score={oppScore ?? 0}
            rows={oppRows}
            isMe={false}
            isWinner={oppWinner}
            isFinal={isFinal}
            isRevealed={isScoring}
            onTap={setSelectedRow}
          />
        </div>

        {/* ── Tap hint ─────────────────────────────────────────────────── */}
        {isFinal && (
          <p style={{ textAlign: 'center', fontSize: 10, color: '#2D3748', marginTop: 12, letterSpacing: '0.05em' }}>
            Tap any player score to see stat breakdown
          </p>
        )}

        {/* ── Nav buttons ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, padding: '20px 12px 0' }}>
          <button
            onClick={() => router.push(`/leagues/${id}/standings`)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 8,
              background: '#0D1220', border: '1px solid #141E35',
              color: '#9CA3AF', fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em', fontWeight: 700,
            }}
          >
            STANDINGS
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
