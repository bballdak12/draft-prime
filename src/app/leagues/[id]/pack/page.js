'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { buildLineup } from '../../../../lib/scoring/lineup'
import { logActivityFromClient } from '../../../../lib/activity/logEvent'
import { requestBadgeAward } from '../../../../lib/badges/badgeQueue'

// ─── Constants ────────────────────────────────────────────────────────────────
const BG   = '#0A0E1A'
const GOLD = '#F0B429'
const TIER_COLOR = {
  legend: '#FFF8E7', hero: '#FF4B33', gold: '#FFD700',
  silver: '#A8A9AD', bronze: '#CD7F32',
}
const PACK_LABEL = { win: 'WIN PACK', loss: 'LOSS PACK', normal: 'WEEKLY PACK' }
const PACK_COLOR = { win: GOLD, loss: '#EF4444', normal: '#A8A9AD' }

// Suspense delay (ms) before card-5 flips, based on its tier
const CARD5_DELAY = { bronze: 500, silver: 700, gold: 1500, hero: 2500, legend: 3500 }

const sleep = ms => new Promise(r => setTimeout(r, ms))

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@keyframes packPulse {
  0%,100% { transform: scale(1); }
  50%      { transform: scale(1.018); }
}
@keyframes packShake {
  0%   { transform: translateX(0)   rotate(0deg); }
  12%  { transform: translateX(-10px) rotate(-2deg); }
  25%  { transform: translateX(10px)  rotate(2deg); }
  37%  { transform: translateX(-8px)  rotate(-1deg); }
  50%  { transform: translateX(8px)   rotate(1deg); }
  65%  { transform: translateX(-4px); }
  80%  { transform: translateX(4px); }
  100% { transform: translateX(0); }
}
@keyframes tapPulse {
  0%,100% { opacity: 0.35; transform: translateY(0); }
  50%      { opacity: 1;    transform: translateY(-4px); }
}
@keyframes legendFlash {
  0%   { opacity: 0; }
  25%  { opacity: 1; }
  75%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes heroGlow {
  0%   { opacity: 0; }
  30%  { opacity: 0.55; }
  70%  { opacity: 0.55; }
  100% { opacity: 0; }
}
@keyframes goldBurst {
  0%   { opacity: 0; transform: scale(0.7); }
  35%  { opacity: 0.65; transform: scale(1.15); }
  100% { opacity: 0; transform: scale(1.4); }
}
@keyframes successPop {
  0%   { opacity: 0; transform: scale(0.85) translateY(12px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.dp-card-inner {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}
.dp-card-inner.revealed { transform: rotateY(180deg); }
.dp-card-face {
  position: absolute; inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 10px;
}
.dp-card-front { transform: rotateY(180deg); }
.dp-pack-idle { animation: packPulse 2.6s ease-in-out infinite; }
.dp-pack-rip  { animation: packShake 0.65s ease-in-out; }
.dp-tap-hint  { animation: tapPulse 1.6s ease-in-out infinite; }
`

// ─── PackCard ─────────────────────────────────────────────────────────────────
function PackCard({ player, isRevealed, isSelected, onSelect, disabled }) {
  const color = TIER_COLOR[player?.tier] || '#374151'
  return (
    <div style={{ perspective: 1100, marginBottom: 8 }}>
      <div
        className={`dp-card-inner${isRevealed ? ' revealed' : ''}`}
        style={{ height: 88 }}
      >
        {/* Back (face-down) */}
        <div
          className="dp-card-face"
          style={{
            background: 'linear-gradient(135deg, #0D1220 0%, #1A2540 100%)',
            border: '1px solid #1A2035',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 30, opacity: 0.12 }}>🎴</span>
        </div>
        {/* Front (face-up) */}
        <div
          className="dp-card-face dp-card-front"
          onClick={() => !disabled && onSelect(player)}
          style={{
            background: isSelected ? `${color}14` : '#0D1220',
            borderTop: isSelected ? `2px solid ${color}` : `1px solid ${color}33`,
            borderRight: isSelected ? `2px solid ${color}` : `1px solid ${color}33`,
            borderBottom: isSelected ? `2px solid ${color}` : `1px solid ${color}33`,
            borderLeft: `3px solid ${color}`,
            cursor: disabled ? 'default' : 'pointer',
            padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            transition: 'background 0.2s',
          }}
        >
          {/* Tier dot */}
          <div style={{
            width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
            backgroundColor: color, boxShadow: `0 0 7px ${color}99`,
          }} />
          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: '#F9FAFB',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {player?.name}
            </div>
            <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>
              {player?.position}{player?.team ? ` · ${player.team}` : ''}{player?.era ? ` · ${player.era}` : ''}
            </div>
          </div>
          {/* OVR */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 22, fontWeight: 900, color, lineHeight: 1,
              fontFamily: 'var(--font-barlow, sans-serif)',
            }}>
              {player?.overall_rating}
            </div>
            <div style={{ fontSize: 8, color: '#4B5563', letterSpacing: '0.06em' }}>OVR</div>
          </div>
          {/* CEI/CON/FLR */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'right' }}>
            {[['CEI', player?.ceiling], ['CON', player?.consistency], ['FLR', player?.floor]].map(([lbl, val]) => (
              <div key={lbl} style={{ fontSize: 9, color: '#6B7280' }}>
                {lbl} <span style={{ color: '#9CA3AF', fontWeight: 700 }}>{val != null ? Math.round(val) : '—'}</span>
              </div>
            ))}
          </div>
          {/* Selected checkmark */}
          {isSelected && (
            <div style={{
              position: 'absolute', top: 6, right: 8,
              fontSize: 13, color, fontWeight: 900,
            }}>✓</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PackGraphic ──────────────────────────────────────────────────────────────
function PackGraphic({ pack, isRipping, onClick }) {
  const type  = pack?.pack_type ?? 'normal'
  const color = PACK_COLOR[type] ?? '#A8A9AD'
  const label = PACK_LABEL[type] ?? 'WEEKLY PACK'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
        color, fontFamily: 'var(--font-barlow, sans-serif)',
      }}>
        {label}
      </span>
      <div
        onClick={onClick}
        className={isRipping ? 'dp-pack-rip' : 'dp-pack-idle'}
        style={{
          width: 200, height: 280, borderRadius: 18,
          background: `linear-gradient(150deg, #0D1220 0%, #141E35 55%, ${color}1A 100%)`,
          border: `2px solid ${color}55`,
          boxShadow: `0 0 40px ${color}1A, inset 0 0 30px #00000055`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          cursor: isRipping ? 'default' : 'pointer',
          position: 'relative', overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Shine */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '35%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
          borderRadius: '18px 18px 0 0',
          pointerEvents: 'none',
        }} />
        <span style={{ fontSize: 52 }}>🎴</span>
        <span style={{
          fontSize: 13, fontWeight: 800, color,
          letterSpacing: '0.1em', fontFamily: 'var(--font-barlow, sans-serif)',
        }}>
          DRAFT PRIME
        </span>
        <span style={{ fontSize: 9, color: '#2D3748', letterSpacing: '0.06em', marginTop: -4 }}>
          SEASON 1
        </span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PackPage() {
  const { id } = useParams()
  const router  = useRouter()

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase,         setPhase]         = useState('loading')
  const [pack,          setPack]          = useState(null)
  const [cards,         setCards]         = useState([])        // 5 player objects
  const [revealedCount, setRevealedCount] = useState(0)
  const [specialEffect, setSpecialEffect] = useState(null)      // null | 'gold' | 'hero' | 'legend'

  const [selectedCard,  setSelectedCard]  = useState(null)
  const [pickError,     setPickError]     = useState(null)
  const [isConfirming,  setIsConfirming]  = useState(false)

  const [draftId,       setDraftId]       = useState(null)
  const [rosterIds,     setRosterIds]     = useState(new Set())  // player_ids on current roster
  const [rosterCount,   setRosterCount]   = useState(0)

  const [playerToDrop,  setPlayerToDrop]  = useState(null)
  const [benchPlayers,  setBenchPlayers]  = useState([])
  const [loadingBench,  setLoadingBench]  = useState(false)

  const [currentUserId, setCurrentUserId] = useState(null)
  const [league,        setLeague]        = useState(null)
  const [error,         setError]         = useState(null)

  const timersRef = useRef([])
  const later = useCallback((fn, ms) => {
    const t = setTimeout(fn, ms)
    timersRef.current.push(t)
  }, [])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      const { data: lg } = await supabase
        .from('leagues').select('id, name').eq('id', id).single()
      if (!lg) { setError('League not found'); setPhase('error'); return }
      setLeague(lg)

      const { data: season } = await supabase
        .from('app_seasons').select('id, current_week')
        .eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()
      if (!season) { setError('No active season'); setPhase('error'); return }

      // Current week pack
      const { data: packRow } = await supabase
        .from('weekly_packs')
        .select('*')
        .eq('league_id', id)
        .eq('season_id', season.id)
        .eq('user_id', user.id)
        .eq('week', season.current_week)
        .maybeSingle()

      // Draft + roster
      const { data: draft } = await supabase
        .from('drafts').select('id')
        .eq('league_id', id).eq('status', 'complete')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (draft) {
        setDraftId(draft.id)
        const { data: picks } = await supabase
          .from('draft_picks').select('player_id')
          .eq('draft_id', draft.id).eq('team_user_id', user.id)
          .is('dropped_at', null)
        const ids = new Set((picks ?? []).map(p => p.player_id))
        setRosterIds(ids)
        setRosterCount(ids.size)
      }

      if (!packRow) { setPhase('no-pack'); return }

      setPack(packRow)
      setCards(packRow.cards ?? [])

      const now = new Date()
      if (packRow.status === 'opened')                              { setPhase('opened'); return }
      if (packRow.status === 'forfeited')                           { setPhase('forfeited'); return }
      if (new Date(packRow.expires_at) < now)                       { setPhase('forfeited'); return }
      if (new Date(packRow.available_from) > now)                   { setPhase('not-yet'); return }
      setPhase('pre-open')
    }
    load().catch(e => { setError(e.message); setPhase('error') })
  }, [id])

  // ── Load bench players when entering drop phase ────────────────────────────
  useEffect(() => {
    if (phase !== 'dropping' || !draftId || !currentUserId) return
    setLoadingBench(true)
    const supabase = createClient()
    ;(async () => {
      const { data: picks } = await supabase
        .from('draft_picks').select('player_id')
        .eq('draft_id', draftId).eq('team_user_id', currentUserId)
        .is('dropped_at', null)
      const playerIds = (picks ?? []).map(p => p.player_id)
      const { data: players } = await supabase
        .from('players').select('id, name, position, tier, overall_rating')
        .in('id', playerIds)
      const { bench } = buildLineup(players ?? [])
      setBenchPlayers(bench)
      setLoadingBench(false)
    })()
  }, [phase, draftId, currentUserId])

  // ── Animation sequence ─────────────────────────────────────────────────────
  const startOpen = useCallback(() => {
    if (phase !== 'pre-open') return
    setPhase('ripping')

    later(() => {
      setPhase('revealing')
      // Reveal cards 1-4 at 300ms intervals
      later(() => setRevealedCount(1), 300)
      later(() => setRevealedCount(2), 600)
      later(() => setRevealedCount(3), 900)
      later(() => setRevealedCount(4), 1200)

      // Card 5 suspense based on best card's tier
      const bestTier  = cards[4]?.tier ?? 'bronze'
      const suspense  = CARD5_DELAY[bestTier] ?? 500
      const effectDur = bestTier === 'gold' ? 1200 : bestTier === 'hero' ? 2000 : bestTier === 'legend' ? 3000 : 0

      if (effectDur > 0) {
        later(() => setSpecialEffect(bestTier), 1200)
        later(() => setSpecialEffect(null), 1200 + effectDur - 200)
      }

      later(() => {
        setRevealedCount(5)
        later(() => setPhase('selecting'), 500)
      }, 1200 + suspense)
    }, 750)
  }, [phase, cards, later])

  // ── Confirm pick ───────────────────────────────────────────────────────────
  const confirmPick = useCallback(async () => {
    if (!selectedCard || !draftId) return
    setPickError(null)
    setIsConfirming(true)

    try {
      const supabase = createClient()

      if (rosterIds.has(selectedCard.id)) {
        setPickError('Already on your roster — pick another')
        setIsConfirming(false)
        return
      }

      if (rosterCount >= 16) {
        setIsConfirming(false)
        setPhase('dropping')
        return
      }

      await addPlayerToRoster(supabase)
      setPhase('success')
    } catch (e) {
      setPickError(e.message)
      setIsConfirming(false)
    }
  }, [selectedCard, draftId, rosterIds, rosterCount])

  const addPlayerToRoster = async (supabase, droppedPlayerName = null) => {
    const { error: pickErr } = await supabase
      .from('draft_picks')
      .insert({
        draft_id:     draftId,
        player_id:    selectedCard.id,
        team_user_id: currentUserId,
        pick_number:  0,
        round:        0,
        pick_in_round: 0,
        source:       'pack',
      })
    if (pickErr) throw new Error(`Add failed: ${pickErr.message}`)

    const { error: packErr } = await supabase
      .from('weekly_packs')
      .update({
        status:             'opened',
        selected_player_id: selectedCard.id,
        opened_at:          new Date().toISOString(),
      })
      .eq('id', pack.id)
    if (packErr) throw new Error(`Pack update failed: ${packErr.message}`)

    logActivityFromClient(supabase, {
      leagueId:  id,
      seasonId:  pack.season_id,
      eventType: 'pack_opened',
      payload: {
        player_name: selectedCard.name,
        tier:        selectedCard.tier,
        ovr:         selectedCard.overall_rating,
        ...(droppedPlayerName ? { dropped_player_name: droppedPlayerName } : {}),
      },
    })

    // Legend Puller badge — validated server-side against the opened pack
    if (selectedCard.tier === 'legend') {
      requestBadgeAward(supabase, {
        type: 'legend_puller', leagueId: id, seasonId: pack.season_id, packId: pack.id,
      })
    }
  }

  // ── Confirm drop + add ─────────────────────────────────────────────────────
  const confirmDrop = useCallback(async () => {
    if (!playerToDrop || !draftId) return
    setPickError(null)
    setIsConfirming(true)

    try {
      const supabase = createClient()

      const { error: dropErr } = await supabase
        .from('draft_picks')
        .update({ dropped_at: new Date().toISOString() })
        .eq('draft_id', draftId)
        .eq('team_user_id', currentUserId)
        .eq('player_id', playerToDrop.id)
        .is('dropped_at', null)
      if (dropErr) throw new Error(`Drop failed: ${dropErr.message}`)

      await addPlayerToRoster(supabase, playerToDrop.name)
      setPhase('success')
    } catch (e) {
      setPickError(e.message)
      setIsConfirming(false)
    }
  }, [playerToDrop, draftId, currentUserId, selectedCard, pack])

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────
  const packColor = PACK_COLOR[pack?.pack_type] ?? '#A8A9Ad'

  function renderHeader() {
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
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
        {pack && (
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
            color: packColor, fontFamily: 'var(--font-barlow, sans-serif)',
          }}>
            {PACK_LABEL[pack.pack_type] ?? 'WEEKLY PACK'}
          </span>
        )}
      </div>
    )
  }

  // ─── Phase renders ────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'packPulse 0.8s linear infinite' }} />
    </main>
  )

  if (phase === 'error') return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <style>{CSS}</style>
      <p style={{ color: '#F87171', fontFamily: 'sans-serif' }}>{error}</p>
      <button onClick={() => router.push(`/leagues/${id}`)} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back</button>
    </main>
  )

  if (phase === 'no-pack') return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <style>{CSS}</style>
      {renderHeader()}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🎴</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#D1D5DB', margin: '0 0 8px', fontFamily: 'var(--font-barlow, sans-serif)' }}>
          No Pack This Week
        </h2>
        <p style={{ color: '#4B5563', fontSize: 13 }}>
          Packs are distributed every Monday at 9AM ET.
        </p>
      </div>
    </main>
  )

  if (phase === 'not-yet') return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <style>{CSS}</style>
      {renderHeader()}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#D1D5DB', margin: '0 0 8px', fontFamily: 'var(--font-barlow, sans-serif)' }}>
          Pack Locked
        </h2>
        <p style={{ color: '#4B5563', fontSize: 13 }}>
          Unlocks {formatDate(pack?.available_from)}
        </p>
      </div>
    </main>
  )

  if (phase === 'forfeited') return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <style>{CSS}</style>
      {renderHeader()}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>💀</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F87171', margin: '0 0 8px', fontFamily: 'var(--font-barlow, sans-serif)' }}>
          Pack Forfeited
        </h2>
        <p style={{ color: '#4B5563', fontSize: 13 }}>Next pack drops Monday at 9AM ET.</p>
      </div>
    </main>
  )

  if (phase === 'opened') {
    const sel = cards.find(c => c.id === pack?.selected_player_id) ?? cards[cards.length - 1]
    const color = TIER_COLOR[sel?.tier] ?? '#A8A9Ad'
    return (
      <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <style>{CSS}</style>
        {renderHeader()}
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#4B5563', letterSpacing: '0.1em', marginBottom: 20, fontFamily: 'var(--font-barlow, sans-serif)' }}>
            ADDED TO ROSTER
          </p>
          <div style={{ animation: 'successPop 0.4s ease-out' }}>
            <PackCard player={sel} isRevealed isSelected={false} onSelect={() => {}} disabled />
          </div>
          <button
            onClick={() => router.push(`/leagues/${id}/team`)}
            style={{
              marginTop: 32, width: '100%', padding: '14px 0', borderRadius: 12,
              backgroundColor: GOLD, color: BG, fontWeight: 800, fontSize: 15,
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-barlow, sans-serif)',
              letterSpacing: '0.08em',
            }}
          >
            VIEW MY ROSTER
          </button>
        </div>
      </main>
    )
  }

  // ── Pre-open / Ripping / Revealing ────────────────────────────────────────
  if (phase === 'pre-open' || phase === 'ripping' || phase === 'revealing') {
    const showPack  = phase !== 'revealing'
    const showCards = phase === 'revealing'
    return (
      <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <style>{CSS}</style>

        {/* Special effects overlays */}
        {specialEffect === 'legend' && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: '#FFFDE7',
            animation: 'legendFlash 1.4s ease-in-out forwards',
            pointerEvents: 'none',
          }} />
        )}
        {specialEffect === 'hero' && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: '#FF4B33',
            animation: 'heroGlow 1.2s ease-in-out forwards',
            pointerEvents: 'none',
          }} />
        )}
        {specialEffect === 'gold' && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'radial-gradient(circle at center, #FFD70066 0%, transparent 70%)',
            animation: 'goldBurst 1.0s ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}

        {renderHeader()}

        {showPack && (
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <PackGraphic pack={pack} isRipping={phase === 'ripping'} onClick={startOpen} />
            {phase === 'pre-open' && (
              <div style={{ marginTop: 28, textAlign: 'center' }}>
                <p className="dp-tap-hint" style={{
                  fontSize: 12, fontWeight: 800, letterSpacing: '0.14em',
                  color: '#6B7280', fontFamily: 'var(--font-barlow, sans-serif)',
                  margin: '0 0 8px',
                }}>
                  ↑ TAP TO OPEN
                </p>
                <p style={{ fontSize: 10, color: '#2D3748' }}>
                  Expires {formatDate(pack?.expires_at)}
                </p>
              </div>
            )}
          </div>
        )}

        {showCards && (
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
            <p style={{ fontSize: 11, color: '#374151', letterSpacing: '0.1em', marginBottom: 12, fontFamily: 'var(--font-barlow, sans-serif)' }}>
              REVEALING CARDS…
            </p>
            {cards.map((card, i) => (
              <PackCard
                key={card.id}
                player={card}
                isRevealed={i < revealedCount}
                isSelected={false}
                onSelect={() => {}}
                disabled
              />
            ))}
          </div>
        )}
      </main>
    )
  }

  // ── Selecting ─────────────────────────────────────────────────────────────
  if (phase === 'selecting') {
    return (
      <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <style>{CSS}</style>
        {renderHeader()}

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 120px' }}>
          <p style={{
            fontSize: 11, color: '#4B5563', letterSpacing: '0.1em', marginBottom: 14,
            fontFamily: 'var(--font-barlow, sans-serif)',
          }}>
            CHOOSE ONE PLAYER FOR YOUR ROSTER
          </p>

          {cards.map((card, i) => (
            <PackCard
              key={card.id}
              player={card}
              isRevealed
              isSelected={selectedCard?.id === card.id}
              onSelect={c => { setSelectedCard(c); setPickError(null) }}
              disabled={false}
            />
          ))}

          {pickError && (
            <p style={{ color: '#EF4444', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
              {pickError}
            </p>
          )}
        </div>

        {/* Sticky confirm bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          backgroundColor: '#060912EE', backdropFilter: 'blur(8px)',
          borderTop: '1px solid #0D1220',
          padding: '16px 24px',
        }}>
          <button
            disabled={!selectedCard || isConfirming}
            onClick={confirmPick}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12,
              backgroundColor: selectedCard ? GOLD : '#1A2035',
              color: selectedCard ? BG : '#374151',
              fontWeight: 800, fontSize: 15, border: 'none',
              cursor: selectedCard ? 'pointer' : 'default',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em',
              transition: 'all 0.2s',
            }}
          >
            {isConfirming ? 'ADDING…' : selectedCard ? `ADD ${selectedCard.name.toUpperCase()} TO ROSTER` : 'SELECT A CARD'}
          </button>
        </div>
      </main>
    )
  }

  // ── Dropping (roster-full modal) ──────────────────────────────────────────
  if (phase === 'dropping') {
    const addColor = TIER_COLOR[selectedCard?.tier] ?? '#A8A9Ad'
    return (
      <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <style>{CSS}</style>
        {renderHeader()}

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
          {/* Adding */}
          <p style={{ fontSize: 11, color: addColor, letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--font-barlow, sans-serif)' }}>
            ADDING TO ROSTER
          </p>
          <PackCard player={selectedCard} isRevealed isSelected={false} onSelect={() => {}} disabled />

          <div style={{ height: 1, backgroundColor: '#0D1220', margin: '20px 0' }} />

          <p style={{ fontSize: 11, color: '#4B5563', letterSpacing: '0.1em', marginBottom: 4, fontFamily: 'var(--font-barlow, sans-serif)' }}>
            ROSTER FULL ({rosterCount}/16) — DROP A BENCH PLAYER
          </p>
          <p style={{ fontSize: 11, color: '#374151', marginBottom: 14 }}>
            Tap to select who to drop
          </p>

          {loadingBench ? (
            <p style={{ color: '#374151', fontSize: 13, textAlign: 'center', padding: 24 }}>Loading bench…</p>
          ) : benchPlayers.length === 0 ? (
            <p style={{ color: '#4B5563', fontSize: 13, textAlign: 'center', padding: 24 }}>No bench players available to drop.</p>
          ) : (
            benchPlayers.map(p => {
              const c = TIER_COLOR[p.tier] ?? '#374151'
              const isChosen = playerToDrop?.id === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => setPlayerToDrop(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', marginBottom: 6, borderRadius: 10,
                    background: isChosen ? '#1A0000' : '#0D1220',
                    border: isChosen ? '1px solid #EF4444' : `1px solid ${c}22`,
                    borderLeft: `3px solid ${isChosen ? '#EF4444' : c}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c, boxShadow: `0 0 5px ${c}` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E5E7EB', fontFamily: 'var(--font-barlow, sans-serif)' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#4B5563' }}>{p.position} · {p.overall_rating} OVR</div>
                  </div>
                  {isChosen && <span style={{ fontSize: 12, color: '#EF4444' }}>DROP</span>}
                </div>
              )
            })
          )}

          {pickError && (
            <p style={{ color: '#EF4444', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{pickError}</p>
          )}
        </div>

        {/* Sticky confirm drop bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          backgroundColor: '#060912EE', backdropFilter: 'blur(8px)',
          borderTop: '1px solid #0D1220', padding: '16px 24px',
        }}>
          <button
            disabled={!playerToDrop || isConfirming}
            onClick={confirmDrop}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12,
              backgroundColor: playerToDrop ? '#EF4444' : '#1A2035',
              color: playerToDrop ? '#fff' : '#374151',
              fontWeight: 800, fontSize: 15, border: 'none',
              cursor: playerToDrop ? 'pointer' : 'default',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em',
            }}
          >
            {isConfirming
              ? 'PROCESSING…'
              : playerToDrop
                ? `DROP ${playerToDrop.name.toUpperCase()} & ADD ${selectedCard?.name.toUpperCase()}`
                : 'SELECT A PLAYER TO DROP'}
          </button>
        </div>
      </main>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (phase === 'success') {
    const color = TIER_COLOR[selectedCard?.tier] ?? '#A8A9Ad'
    return (
      <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <style>{CSS}</style>
        {renderHeader()}
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
          <p style={{
            fontSize: 36, marginBottom: 8,
            animation: 'successPop 0.4s ease-out',
          }}>✅</p>
          <h2 style={{
            fontSize: 22, fontWeight: 900, color, margin: '0 0 20px',
            fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.02em',
            animation: 'successPop 0.5s ease-out',
          }}>
            {selectedCard?.name} added!
          </h2>
          <div style={{ animation: 'successPop 0.6s ease-out' }}>
            <PackCard player={selectedCard} isRevealed isSelected={false} onSelect={() => {}} disabled />
          </div>
          <button
            onClick={() => router.push(`/leagues/${id}/team`)}
            style={{
              marginTop: 28, width: '100%', padding: '14px 0', borderRadius: 12,
              backgroundColor: GOLD, color: BG, fontWeight: 800, fontSize: 15,
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-barlow, sans-serif)', letterSpacing: '0.08em',
            }}
          >
            VIEW MY ROSTER
          </button>
          <button
            onClick={() => router.push(`/leagues/${id}`)}
            style={{
              marginTop: 10, width: '100%', padding: '12px 0', borderRadius: 12,
              backgroundColor: 'transparent', color: '#4B5563', fontWeight: 700,
              fontSize: 13, border: '1px solid #1A2035', cursor: 'pointer',
            }}
          >
            Back to League
          </button>
        </div>
      </main>
    )
  }

  return null
}
