'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { HelmetSVG } from '../../../lib/helmet/HelmetSVG'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#0A0E1A'
const GOLD   = '#F0B429'
const CARD   = '#0D1220'
const BORDER = '#1A2035'
const F      = 'var(--font-barlow), "Barlow Condensed", sans-serif'

const TIER_COLOR = {
  legend: '#FFF8E7', hero: '#FF4B33', gold: '#FFD700',
  silver: '#A8A9AD', bronze: '#CD7F32',
}

const EVENT_ICON = {
  member_joined:  '👋',
  draft_complete: '🏁',
  trade_accepted: '🔄',
  pack_opened:    '🎴',
  player_dropped: '📤',
  matchup_final:  '🏆',
  announcement:   '📣',
}

const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return ''
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)        return 'now'
  if (secs < 3600)      return `${Math.floor(secs / 60)}m`
  if (secs < 86400)     return `${Math.floor(secs / 3600)}h`
  if (secs < 604800)    return `${Math.floor(secs / 86400)}d`
  return `${Math.floor(secs / 604800)}w`
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

const fmtScore = n => Number(n ?? 0).toFixed(2)

// Bold name fragment used inside feed sentences
function B({ children, color = '#F9FAFB' }) {
  return <span style={{ fontWeight: 800, color, fontFamily: F, letterSpacing: '0.01em' }}>{children}</span>
}

// ─── Activity feed item ───────────────────────────────────────────────────────
function ActivityItem({ event, nameFor }) {
  const p     = event.payload ?? {}
  const actor = p.team_name || nameFor(event.user_id)

  let sentence
  switch (event.event_type) {
    case 'member_joined':
      sentence = <><B>{actor}</B> joined the league</>
      break

    case 'draft_complete':
      sentence = <>The draft is complete — rosters are locked in</>
      break

    case 'pack_opened': {
      const tc = TIER_COLOR[p.tier] ?? '#F9FAFB'
      sentence = (
        <>
          <B>{actor}</B> opened a pack and added <B color={tc}>{p.player_name}</B>
          <span style={{ color: '#4B5563' }}> ({capitalize(p.tier)} {p.ovr})</span>
          {p.dropped_player_name && <>, dropping <B>{p.dropped_player_name}</B></>}
        </>
      )
      break
    }

    case 'player_dropped':
      sentence = <><B>{actor}</B> dropped <B>{p.player_name}</B></>
      break

    case 'trade_accepted':
      sentence = (
        <>
          Trade: <B>{p.proposer_name}</B> sent <B>{(p.gave ?? []).join(', ') || '—'}</B> to{' '}
          <B>{p.receiver_name}</B> for <B>{(p.got ?? []).join(', ') || '—'}</B>
        </>
      )
      break

    case 'matchup_final': {
      const homeWon = (p.home_score ?? 0) > (p.away_score ?? 0)
      const [wName, wScore, lName, lScore] = homeWon
        ? [p.home_name, p.home_score, p.away_name, p.away_score]
        : [p.away_name, p.away_score, p.home_name, p.home_score]
      sentence = p.winner_name ? (
        <>
          Week {p.week} Final: <B color={GOLD}>{wName} {fmtScore(wScore)}</B>
          <span style={{ color: '#4B5563' }}> def. </span>
          <B>{lName} {fmtScore(lScore)}</B>
        </>
      ) : (
        <>
          Week {p.week} Final: <B>{p.home_name} {fmtScore(p.home_score)}</B>
          <span style={{ color: '#4B5563' }}> tied </span>
          <B>{p.away_name} {fmtScore(p.away_score)}</B>
        </>
      )
      break
    }

    case 'announcement':
      sentence = <>{p.text ?? p.message ?? 'League announcement'}</>
      break

    default:
      sentence = <>League event</>
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px',
      borderBottom: `1px solid ${CARD}`,
    }}>
      <span style={{ fontSize: 15, lineHeight: '19px', flexShrink: 0 }}>
        {EVENT_ICON[event.event_type] ?? '•'}
      </span>
      <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 13, lineHeight: 1.45, color: '#9CA3AF' }}>
        {sentence}
      </p>
      <span style={{ fontSize: 10, color: '#374151', flexShrink: 0, lineHeight: '19px' }}>
        {timeAgo(event.created_at)}
      </span>
    </div>
  )
}

// ─── Nav tile ─────────────────────────────────────────────────────────────────
function NavTile({ icon, label, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
        padding: '16px 8px 13px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2A3450' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
        color: '#9CA3AF', fontFamily: F,
      }}>
        {label.toUpperCase()}
      </span>
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: -7, right: -7,
          backgroundColor: '#EF4444', color: '#fff',
          borderRadius: '50%', minWidth: 20, height: 20, padding: '0 4px',
          fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, boxShadow: '0 0 8px #EF444488',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LeaguePage() {
  const { id } = useParams()
  const router = useRouter()

  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [league,         setLeague]         = useState(null)
  const [currentUserId,  setCurrentUserId]  = useState(null)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [members,        setMembers]        = useState([])
  const [records,        setRecords]        = useState({})       // user_id → {wins, losses}
  const [season,         setSeason]         = useState(null)     // {id, current_week, season_number}
  const [matchup,        setMatchup]        = useState(null)
  const [hasDrafted,     setHasDrafted]     = useState(true)
  const [hasAvailablePack, setHasAvailablePack] = useState(false)
  const [pendingTrades,  setPendingTrades]  = useState(0)
  const [copied,         setCopied]         = useState(false)
  const [membersOpen,    setMembersOpen]    = useState(false)

  const [events,         setEvents]         = useState([])
  const [hasMore,        setHasMore]        = useState(false)
  const [loadingMore,    setLoadingMore]    = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      // League
      const { data: leagueData, error: leagueError } = await supabase
        .from('leagues').select('*').eq('id', id).single()
      if (leagueError || !leagueData) {
        setError('League not found.')
        setLoading(false)
        return
      }
      setLeague(leagueData)

      // Members + profiles (separate queries — league_members.user_id FK
      // points to auth.users, so PostgREST can't embed profiles)
      const { data: memberRows, error: memberErr } = await supabase
        .from('league_members')
        .select('user_id, is_commissioner, joined_at')
        .eq('league_id', id)
        .order('joined_at')
      if (memberErr) {
        setError('Could not load members: ' + memberErr.message)
        setLoading(false)
        return
      }

      const userIds = (memberRows ?? []).map(m => m.user_id)
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, team_name, helmet_color, helmet_secondary, helmet_pattern')
        .in('id', userIds)
      const profileMap = Object.fromEntries((profileRows ?? []).map(p => [p.id, p]))

      const merged = (memberRows ?? []).map(m => ({
        ...m,
        display_name:     profileMap[m.user_id]?.display_name || 'Unknown',
        team_name:        profileMap[m.user_id]?.team_name || profileMap[m.user_id]?.display_name || '—',
        helmet_color:     profileMap[m.user_id]?.helmet_color,
        helmet_secondary: profileMap[m.user_id]?.helmet_secondary,
        helmet_pattern:   profileMap[m.user_id]?.helmet_pattern,
      }))
      setMembers(merged)
      setIsCommissioner(!!merged.find(m => m.user_id === user.id)?.is_commissioner)

      // Latest draft — the draft CTA stays visible until it completes
      const { data: draft } = await supabase
        .from('drafts').select('id, status')
        .eq('league_id', id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setHasDrafted(draft?.status === 'complete')

      // Active season
      const { data: seasonRow } = await supabase
        .from('app_seasons').select('id, current_week, season_number')
        .eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()
      setSeason(seasonRow ?? null)

      if (seasonRow) {
        // My matchup this week
        const { data: matchups } = await supabase
          .from('weekly_matchups')
          .select('id, week, home_team_user_id, away_team_user_id, home_score, away_score, status')
          .eq('league_id', id)
          .eq('season_id', seasonRow.id)
          .eq('week', seasonRow.current_week)
          .or(`home_team_user_id.eq.${user.id},away_team_user_id.eq.${user.id}`)
          .limit(1)
        setMatchup(matchups?.[0] ?? null)

        // Records for the member list
        const { data: standings } = await supabase
          .from('league_standings').select('user_id, wins, losses')
          .eq('league_id', id).eq('season_id', seasonRow.id)
        setRecords(Object.fromEntries((standings ?? []).map(s => [s.user_id, s])))

        // Unopened weekly pack badge
        const now = new Date().toISOString()
        const { data: pendingPack } = await supabase
          .from('weekly_packs').select('id')
          .eq('league_id', id).eq('season_id', seasonRow.id)
          .eq('user_id', user.id).eq('status', 'pending')
          .lte('available_from', now).gte('expires_at', now)
          .maybeSingle()
        setHasAvailablePack(!!pendingPack)
      }

      // Pending incoming trades badge
      const { count: tradeCount } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', id)
        .eq('receiver_user_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
      setPendingTrades(tradeCount || 0)

      // Activity feed — latest page
      const { data: activity } = await supabase
        .from('league_activity')
        .select('*')
        .eq('league_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      setEvents(activity ?? [])
      setHasMore((activity ?? []).length === PAGE_SIZE)

      setLoading(false)
    }
    load().catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  // ── Realtime: new activity appears live ─────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`league-activity-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'league_activity', filter: `league_id=eq.${id}` },
        ({ new: row }) => {
          setEvents(prev => prev.some(e => e.id === row.id) ? prev : [row, ...prev])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  // ── Load more (cursor on created_at) ─────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !events.length) return
    setLoadingMore(true)
    const supabase = createClient()
    const oldest = events[events.length - 1].created_at
    const { data } = await supabase
      .from('league_activity')
      .select('*')
      .eq('league_id', id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    setEvents(prev => {
      const seen = new Set(prev.map(e => e.id))
      return [...prev, ...(data ?? []).filter(e => !seen.has(e.id))]
    })
    setHasMore((data ?? []).length === PAGE_SIZE)
    setLoadingMore(false)
  }, [id, events, loadingMore])

  const nameFor = useCallback(uid => {
    const m = members.find(m => m.user_id === uid)
    return m?.team_name || m?.display_name || 'Someone'
  }, [members])

  const copyInviteCode = () => {
    navigator.clipboard.writeText(league.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )

  if (error) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#F87171', fontFamily: 'sans-serif' }}>{error}</p>
      <button onClick={() => router.push('/dashboard')} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
        ← Back to Dashboard
      </button>
    </main>
  )

  // ── Matchup card derived state ───────────────────────────────────────────────
  const isHome    = matchup?.home_team_user_id === currentUserId
  const oppId     = matchup ? (isHome ? matchup.away_team_user_id : matchup.home_team_user_id) : null
  const opp       = members.find(m => m.user_id === oppId)
  const myScore   = matchup ? (isHome ? matchup.home_score : matchup.away_score) : 0
  const oppScore  = matchup ? (isHome ? matchup.away_score : matchup.home_score) : 0
  const isFinal   = matchup?.status === 'complete'
  const isScoring = matchup?.status === 'scoring'
  const iWon      = isFinal && Number(myScore) > Number(oppScore)
  const statusLabel = isFinal ? 'FINAL' : isScoring ? 'LIVE' : 'SCHEDULED'
  const statusColor = isFinal ? GOLD : isScoring ? '#34D399' : '#6B7280'

  const memberCount = members.length

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 56px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <button
          onClick={() => router.push('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: 0, marginBottom: 14 }}
        >
          ← Dashboard
        </button>

        <div style={{ marginBottom: 18 }}>
          <h1 style={{
            margin: 0, fontSize: 30, fontWeight: 800, color: '#F9FAFB',
            fontFamily: F, letterSpacing: '0.01em', lineHeight: 1.1,
          }}>
            {league.name}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4B5563', letterSpacing: '0.08em', fontFamily: F, fontWeight: 600 }}>
            {season ? `WEEK ${season.current_week} · SEASON ${season.season_number}` : capitalize(league.status)}
          </p>
        </div>

        {/* ── Matchup summary card ───────────────────────────────────────── */}
        {matchup && opp && (
          <div
            onClick={() => router.push(`/leagues/${id}/matchup`)}
            style={{
              backgroundColor: CARD,
              border: `1px solid ${iWon ? `${GOLD}55` : BORDER}`,
              borderRadius: 16, padding: '14px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer',
              boxShadow: iWon ? `0 0 24px ${GOLD}22` : 'none',
            }}
          >
            <HelmetSVG
              base={opp.helmet_color || '#1B2A4A'}
              secondary={opp.helmet_secondary || GOLD}
              pattern={opp.helmet_pattern || 'solid'}
              uid={`mc-${opp.user_id}`}
              width={62} height={54}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#4B5563', letterSpacing: '0.1em', fontFamily: F, fontWeight: 700, marginBottom: 2 }}>
                YOUR MATCHUP
              </div>
              <div style={{
                fontSize: 17, fontWeight: 800, color: '#F9FAFB', fontFamily: F,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                vs {opp.team_name}
              </div>
              <span style={{
                display: 'inline-block', marginTop: 4,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                color: statusColor, background: `${statusColor}1A`,
                border: `1px solid ${statusColor}44`,
                borderRadius: 4, padding: '2px 6px', fontFamily: F,
              }}>
                {statusLabel}
              </span>
            </div>
            {(isFinal || isScoring) ? (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: iWon ? GOLD : '#F9FAFB', fontFamily: F, lineHeight: 1 }}>
                  {fmtScore(myScore)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', fontFamily: F, marginTop: 3 }}>
                  {fmtScore(oppScore)}
                </div>
              </div>
            ) : (
              <span style={{ color: '#374151', fontSize: 18, flexShrink: 0 }}>›</span>
            )}
          </div>
        )}

        {/* ── Draft CTA (until the league has drafted) ───────────────────── */}
        {!hasDrafted && (
          <div style={{ marginBottom: 16 }}>
            {isCommissioner ? (
              <button
                disabled={memberCount < 2}
                onClick={() => router.push(`/leagues/${id}/draft`)}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 14,
                  backgroundColor: GOLD, color: BG, fontWeight: 800, fontSize: 15,
                  border: 'none', cursor: memberCount < 2 ? 'default' : 'pointer',
                  opacity: memberCount < 2 ? 0.4 : 1,
                  fontFamily: F, letterSpacing: '0.08em',
                }}
              >
                {memberCount < 2 ? 'NEED AT LEAST 2 MEMBERS TO START' : 'ENTER DRAFT ROOM'}
              </button>
            ) : (
              <button
                onClick={() => router.push(`/leagues/${id}/draft`)}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 14,
                  backgroundColor: league.status === 'drafting' ? GOLD : CARD,
                  color: league.status === 'drafting' ? BG : '#9CA3AF',
                  fontWeight: 800, fontSize: 15,
                  border: league.status === 'drafting' ? 'none' : `1px solid ${BORDER}`,
                  cursor: 'pointer', fontFamily: F, letterSpacing: '0.08em',
                }}
              >
                {league.status === 'drafting' ? 'JOIN DRAFT ROOM' : 'DRAFT ROOM'}
              </button>
            )}
          </div>
        )}

        {/* ── Invite code (pre-draft, league not full) ───────────────────── */}
        {!hasDrafted && memberCount < 12 && (
          <div style={{
            backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
            padding: '12px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: '#4B5563', letterSpacing: '0.1em', fontFamily: F, fontWeight: 700 }}>
                INVITE CODE
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '0.2em', color: GOLD, fontFamily: F }}>
                {league.invite_code}
              </p>
            </div>
            <button
              onClick={copyInviteCode}
              style={{
                fontSize: 12, padding: '8px 14px', borderRadius: 8,
                backgroundColor: '#1A2035', color: '#D1D5DB', border: 'none', cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {/* ── Nav grid (2×3) ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
          <NavTile icon="📋" label="My Roster"   onClick={() => router.push(`/leagues/${id}/team`)} />
          <NavTile icon="📅" label="Matchup"     onClick={() => router.push(`/leagues/${id}/matchup`)} />
          <NavTile icon="🏆" label="Standings"   onClick={() => router.push(`/leagues/${id}/standings`)} />
          <NavTile icon="🔄" label="Trades"      badge={pendingTrades} onClick={() => router.push(`/leagues/${id}/trades`)} />
          <NavTile icon="🎴" label="Weekly Pack" badge={hasAvailablePack ? 1 : 0} onClick={() => router.push(`/leagues/${id}/pack`)} />
          <NavTile icon="🏈" label="Edit Helmet" onClick={() => router.push(`/leagues/${id}/helmet`)} />
        </div>

        {/* ── Activity feed ──────────────────────────────────────────────── */}
        <h2 style={{
          margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: '#4B5563',
          letterSpacing: '0.12em', fontFamily: F,
        }}>
          LEAGUE ACTIVITY
        </h2>
        <div style={{
          backgroundColor: '#060912', border: `1px solid ${CARD}`,
          borderRadius: 14, overflow: 'hidden', marginBottom: 24,
        }}>
          {events.length === 0 ? (
            <p style={{ margin: 0, padding: '22px 16px', fontSize: 12, color: '#374151', textAlign: 'center' }}>
              No activity yet — events show up here as your league plays.
            </p>
          ) : (
            <>
              {events.map(e => (
                <ActivityItem key={e.id} event={e} nameFor={nameFor} />
              ))}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    width: '100%', padding: '11px 0',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#4B5563', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.1em', fontFamily: F,
                  }}
                >
                  {loadingMore ? 'LOADING…' : 'LOAD MORE'}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Members (collapsible) ──────────────────────────────────────── */}
        <button
          onClick={() => setMembersOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: '#4B5563', letterSpacing: '0.12em', fontFamily: F }}>
            MEMBERS ({memberCount}/12)
          </span>
          <span style={{ color: '#374151', fontSize: 12 }}>{membersOpen ? '▾' : '▸'}</span>
        </button>

        {membersOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(member => {
              const rec = records[member.user_id]
              return (
                <div
                  key={member.user_id}
                  style={{
                    backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                    padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <HelmetSVG
                    base={member.helmet_color || '#1B2A4A'}
                    secondary={member.helmet_secondary || GOLD}
                    pattern={member.helmet_pattern || 'solid'}
                    uid={`ml-${member.user_id}`}
                    width={44} height={38}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 800, color: '#F9FAFB', fontFamily: F,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {member.team_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#4B5563' }}>
                      {member.display_name}
                      {member.user_id === currentUserId && <span style={{ color: '#374151' }}> · You</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {member.is_commissioner && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                        backgroundColor: GOLD, color: BG, fontFamily: F, letterSpacing: '0.06em',
                      }}>
                        COMMISH
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#9CA3AF', fontFamily: F }}>
                      {rec ? `${rec.wins}–${rec.losses}` : '0–0'}
                    </span>
                  </div>
                </div>
              )
            })}

            {Array.from({ length: 12 - memberCount }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  border: '1px dashed #141E35', borderRadius: 12, padding: '12px',
                }}
              >
                <p style={{ margin: 0, color: '#1F2937', fontSize: 12 }}>Empty slot</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
