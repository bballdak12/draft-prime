'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { HelmetSVG } from '../../../../lib/helmet/HelmetSVG'

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD = '#F0B429'
const BG   = '#0A0E1A'
const TIER_COLOR = {
  legend: '#FFF8E7', hero: '#FF4B33', gold: '#FFD700',
  silver: '#A8A9AD', bronze: '#CD7F32',
}
const STATUS_META = {
  accepted:  { label: 'Accepted ✓',  color: '#34D399' },
  rejected:  { label: 'Rejected ✗',  color: '#F87171' },
  cancelled: { label: 'Cancelled',   color: '#6B7280' },
  expired:   { label: 'Expired',     color: '#4B5563' },
  pending:   { label: 'Pending',     color: GOLD      },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeLeft(expiresAt) {
  const ms = new Date(expiresAt) - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}d left`
  if (h >= 1) return `${h}h left`
  return `${Math.floor(ms / 60000)}m left`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function TierDot({ tier }) {
  const c = TIER_COLOR[tier] || '#2D3748'
  return (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      backgroundColor: c, flexShrink: 0, display: 'inline-block',
      marginRight: 4, verticalAlign: 'middle',
    }} />
  )
}

function PlayerList({ playerIds, playerMap, label, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
        color, marginBottom: 4, textTransform: 'uppercase',
      }}>
        {label}
      </div>
      {playerIds.length === 0 ? (
        <div style={{ fontSize: 10, color: '#1F2937', fontStyle: 'italic' }}>None</div>
      ) : (
        playerIds.map(id => {
          const p = playerMap[id]
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
              <TierDot tier={p?.tier} />
              <span style={{ fontSize: 11, color: '#D1D5DB', fontWeight: 600, lineHeight: 1.3 }}>
                {p?.name || id.slice(0, 8) + '…'}
              </span>
              {p && (
                <span style={{ fontSize: 9, color: '#374151', marginLeft: 4 }}>
                  {p.position}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function TradeCard({ trade, myUserId, playerMap, profileMap, onAccept, onReject, onCancel, acting }) {
  const isIncoming = trade.receiver_user_id === myUserId
  const otherId    = isIncoming ? trade.proposer_user_id : trade.receiver_user_id
  const other      = profileMap[otherId] || {}
  const svgW       = Math.round(44 * (300 / 260))
  const isPending  = trade.status === 'pending'
  const isExpired  = isPending && new Date(trade.expires_at) < new Date()
  const statusMeta = STATUS_META[isExpired ? 'expired' : trade.status] || STATUS_META.pending
  const busy       = acting === trade.id

  // From the current user's perspective:
  // - incoming: proposer gives proposer_players, receiver (me) gives receiver_players
  // - outgoing: I give proposer_players, they give receiver_players
  const youGiveIds = isIncoming ? trade.receiver_players : trade.proposer_players
  const youGetIds  = isIncoming ? trade.proposer_players : trade.receiver_players

  return (
    <div style={{
      background: '#0D1220',
      border: `1px solid ${isPending && !isExpired ? `${GOLD}33` : '#141E35'}`,
      borderRadius: 12, padding: '14px', marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <HelmetSVG
          base={other.helmet_color || '#1B2A4A'}
          secondary={other.helmet_secondary || GOLD}
          pattern={other.helmet_pattern || 'solid'}
          uid={`trade-${trade.id}`}
          width={svgW} height={44}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F9FAFB' }}>
            {other.team_name || other.display_name || 'Unknown Team'}
          </div>
          <div style={{ fontSize: 10, color: '#374151', marginTop: 1 }}>
            {isIncoming ? 'Incoming trade offer' : 'Your trade offer'}
            {' · '}
            {formatDate(trade.proposed_at)}
          </div>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
          color: statusMeta.color, flexShrink: 0,
        }}>
          {isExpired ? 'Expired' : statusMeta.label}
        </div>
      </div>

      {/* Players */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <PlayerList playerIds={youGiveIds} playerMap={playerMap} label="You Give" color="#EF4444" />
        <div style={{ width: 1, background: '#141E35', flexShrink: 0 }} />
        <PlayerList playerIds={youGetIds}  playerMap={playerMap} label="You Get"  color="#34D399" />
      </div>

      {/* Message */}
      {trade.message && (
        <div style={{
          background: '#060912', border: '1px solid #141E35',
          borderRadius: 6, padding: '7px 10px', marginBottom: 10,
          fontSize: 11, color: '#6B7280', fontStyle: 'italic',
        }}>
          "{trade.message}"
        </div>
      )}

      {/* Time remaining */}
      {isPending && !isExpired && (
        <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 10 }}>
          ⏱ {timeLeft(trade.expires_at)}
        </div>
      )}

      {/* Actions */}
      {isPending && !isExpired && (
        <div style={{ display: 'flex', gap: 8 }}>
          {isIncoming && (
            <>
              <button
                onClick={() => onAccept(trade)}
                disabled={busy}
                style={{
                  flex: 1, padding: '10px', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 800, letterSpacing: '0.04em',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  backgroundColor: busy ? '#1A2035' : '#16A34A',
                  color: busy ? '#374151' : '#fff',
                  fontFamily: 'var(--font-barlow, sans-serif)',
                }}
              >
                {busy ? '…' : 'Accept'}
              </button>
              <button
                onClick={() => onReject(trade)}
                disabled={busy}
                style={{
                  flex: 1, padding: '10px', border: '1px solid #374151',
                  borderRadius: 8, fontSize: 13, fontWeight: 800,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  backgroundColor: 'transparent',
                  color: busy ? '#374151' : '#9CA3AF',
                  fontFamily: 'var(--font-barlow, sans-serif)',
                }}
              >
                {busy ? '…' : 'Reject'}
              </button>
            </>
          )}
          {!isIncoming && (
            <button
              onClick={() => onCancel(trade)}
              disabled={busy}
              style={{
                flex: 1, padding: '10px', border: '1px solid #374151',
                borderRadius: 8, fontSize: 13, fontWeight: 800,
                cursor: busy ? 'not-allowed' : 'pointer',
                backgroundColor: 'transparent',
                color: busy ? '#374151' : '#9CA3AF',
                fontFamily: 'var(--font-barlow, sans-serif)',
              }}
            >
              {busy ? 'Cancelling…' : 'Cancel Trade'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TradesPage() {
  const { id: leagueId } = useParams()
  const router = useRouter()

  const [loading,    setLoading]    = useState(true)
  const [acting,     setActing]     = useState(null) // trade.id being processed
  const [tab,        setTab]        = useState('incoming')
  const [error,      setError]      = useState(null)
  const [league,     setLeague]     = useState(null)
  const [currentUser,setCurrentUser]= useState(null)
  const [trades,     setTrades]     = useState([])
  const [playerMap,  setPlayerMap]  = useState({})
  const [profileMap, setProfileMap] = useState({})
  const [toast,      setToast]      = useState(null) // { msg, type }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Load all trades for this league ─────────────────────────────────────────
  const loadTrades = useCallback(async (supabase) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/trades/list?leagueId=${leagueId}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
    })
    if (!res.ok) { const j = await res.json(); setError(j.error || 'Failed to load trades'); return }
    const { trades: tradeRows, players, profiles } = await res.json()

    setTrades(tradeRows || [])

    const pm = {}; players?.forEach(p => { pm[p.id] = p })
    setPlayerMap(pm)

    const pfm = {}; profiles?.forEach(p => { pfm[p.id] = p })
    setProfileMap(pfm)
  }, [leagueId])

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUser(user)

      const { data: lg } = await supabase.from('leagues').select('id, name').eq('id', leagueId).single()
      setLeague(lg)

      await loadTrades(supabase)
      setLoading(false)
    }
    load()
  }, [leagueId, loadTrades])

  // ── Realtime subscription: refresh when a trade row changes ─────────────────
  useEffect(() => {
    if (!currentUser) return
    const supabase = createClient()
    const chan = supabase
      .channel(`trades-${leagueId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trades',
        filter: `league_id=eq.${leagueId}`,
      }, () => loadTrades(supabase))
      .subscribe()
    return () => { supabase.removeChannel(chan) }
  }, [leagueId, currentUser, loadTrades])

  // ── Accept ───────────────────────────────────────────────────────────────────
  const handleAccept = async (trade) => {
    setActing(trade.id)
    const supabase = createClient()

    // Get the current session token to authenticate the API call
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      showToast('Session expired — please reload', 'error')
      setActing(null)
      return
    }

    const res = await fetch('/api/trades/accept', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body:    JSON.stringify({ tradeId: trade.id }),
    })
    const result = await res.json()
    setActing(null)

    if (!res.ok) {
      showToast('Failed to accept: ' + (result.error || res.statusText), 'error')
      return
    }
    showToast('Trade accepted! Rosters updated ✓')
    await loadTrades(supabase)
  }

  // ── Reject ───────────────────────────────────────────────────────────────────
  const handleReject = async (trade) => {
    setActing(trade.id)
    const supabase = createClient()
    await supabase.from('trades').update({
      status: 'rejected', responded_at: new Date().toISOString(),
    }).eq('id', trade.id)
    setActing(null)
    showToast('Trade rejected')
    await loadTrades(supabase)
  }

  // ── Cancel ───────────────────────────────────────────────────────────────────
  const handleCancel = async (trade) => {
    setActing(trade.id)
    const supabase = createClient()
    await supabase.from('trades').update({
      status: 'cancelled', responded_at: new Date().toISOString(),
    }).eq('id', trade.id)
    setActing(null)
    showToast('Trade cancelled')
    await loadTrades(supabase)
  }

  // ─── Filtered views ─────────────────────────────────────────────────────────
  const now = new Date()
  const incoming = trades.filter(t =>
    t.receiver_user_id === currentUser?.id &&
    t.status === 'pending' &&
    new Date(t.expires_at) > now
  )
  const outgoing = trades.filter(t =>
    t.proposer_user_id === currentUser?.id &&
    t.status === 'pending' &&
    new Date(t.expires_at) > now
  )
  const history = trades.filter(t =>
    t.status !== 'pending' ||
    new Date(t.expires_at) <= now
  )

  const tabData = { incoming, outgoing, history }
  const tabConfig = [
    { key: 'incoming', label: 'INCOMING', badge: incoming.length },
    { key: 'outgoing', label: 'OUTGOING', badge: outgoing.length },
    { key: 'history',  label: 'HISTORY',  badge: 0 },
  ]

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', color: '#F9FAFB', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>

        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          backgroundColor: '#060912EE', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #0D1220',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button onClick={() => router.push(`/leagues/${leagueId}`)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4B5563', fontSize: 13, padding: 0,
          }}>
            ← {league?.name || 'League'}
          </button>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#4B5563', textTransform: 'uppercase' }}>
            Trade Center
          </span>
          <button
            onClick={() => router.push(`/leagues/${leagueId}/trade`)}
            style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
              color: '#0A0E1A', background: GOLD, border: 'none',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
              fontFamily: 'var(--font-barlow, sans-serif)',
            }}
          >
            + NEW
          </button>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', borderBottom: '1px solid #0D1220',
          backgroundColor: '#080C18', position: 'sticky', top: 45, zIndex: 19,
        }}>
          {tabConfig.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '12px 0',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === key ? GOLD : 'transparent'}`,
                color: tab === key ? GOLD : '#4B5563',
                fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                transition: 'color 0.15s, border-color 0.15s',
                position: 'relative',
                fontFamily: 'var(--font-barlow, sans-serif)',
              }}
            >
              {label}
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: '50%', transform: 'translateX(28px)',
                  backgroundColor: '#EF4444', color: '#fff',
                  borderRadius: '50%', width: 16, height: 16,
                  fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Trade list ────────────────────────────────────────────────── */}
        <div style={{ padding: '16px 16px 0' }}>
          {error && (
            <div style={{ color: '#F87171', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
              {error}
            </div>
          )}

          {tabData[tab].length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>
                {tab === 'incoming' ? '📭' : tab === 'outgoing' ? '📤' : '📋'}
              </div>
              <p style={{ color: '#374151', fontSize: 14 }}>
                {tab === 'incoming' && 'No incoming trade offers'}
                {tab === 'outgoing' && 'No outgoing trade offers'}
                {tab === 'history' && 'No trade history yet'}
              </p>
              {tab !== 'history' && (
                <button
                  onClick={() => router.push(`/leagues/${leagueId}/trade`)}
                  style={{
                    marginTop: 16, padding: '10px 20px',
                    backgroundColor: GOLD, color: '#0A0E1A',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                    fontSize: 13, fontWeight: 800,
                    fontFamily: 'var(--font-barlow, sans-serif)',
                  }}
                >
                  Propose a Trade
                </button>
              )}
            </div>
          ) : (
            tabData[tab].map(trade => (
              <TradeCard
                key={trade.id}
                trade={trade}
                myUserId={currentUser?.id}
                playerMap={playerMap}
                profileMap={profileMap}
                onAccept={handleAccept}
                onReject={handleReject}
                onCancel={handleCancel}
                acting={acting}
              />
            ))
          )}
        </div>

        {/* ── Toast ─────────────────────────────────────────────────────── */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            backgroundColor: toast.type === 'error' ? '#7F1D1D' : '#14532D',
            border: `1px solid ${toast.type === 'error' ? '#EF444455' : '#16A34A55'}`,
            color: toast.type === 'error' ? '#FCA5A5' : '#86EFAC',
            borderRadius: 10, padding: '10px 20px',
            fontSize: 13, fontWeight: 600, zIndex: 999,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </main>
  )
}
