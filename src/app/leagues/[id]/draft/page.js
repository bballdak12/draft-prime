'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { generatePack } from '../../../../lib/draft/packGenerator'
import { HelmetSVG } from '../../../../lib/helmet/HelmetSVG'
import { logActivityFromClient } from '../../../../lib/activity/logEvent'

// Inlined from packGenerator (avoids a Turbopack static-analysis limitation)
function getDraftRoundInfo(round) {
  if (round === 1)                return { packOddsType: 'legend'  }
  if (round === 2 || round === 6) return { packOddsType: 'captain' }
  return                                  { packOddsType: 'normal'  }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG   = '#0A0E1A'
const GOLD = '#F0B429'
const F    = 'var(--font-barlow), "Barlow Condensed", sans-serif'

const HELMET_PALETTE = [
  '#C62828', '#AD1457', '#6A1B9A', '#1565C0', '#0277BD',
  '#00695C', '#2E7D32', '#E65100', '#F57F17', '#827717',
  '#37474F', '#1A237E',
]

// Per-tier visual tokens used on draft cards and board dots
const TIER_STYLE = {
  bronze: { border: '#CD7F32', glow: '#CD7F3244', label: 'Bronze' },
  silver: { border: '#C0C0C0', glow: '#C0C0C044', label: 'Silver' },
  gold:   { border: '#F0B429', glow: '#F0B42944', label: 'Gold'   },
  hero:   { border: '#7C4DFF', glow: '#7C4DFF55', label: 'Hero'   },
  legend: { border: '#FF1744', glow: '#FF174455', label: 'Legend' },
}

// Per-position accent colors on cards / board
const POS_COLOR = {
  QB: '#EF4444', RB: '#22C55E', WR: '#3B82F6',
  TE: '#F59E0B', K:  '#A855F7', DST: '#64748B',
}

// ─── Pure helpers ──────────────────────────────────────────────────────────────
function hashColor(str = '') {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff
  return HELMET_PALETTE[h % HELMET_PALETTE.length]
}

// Seeded PRNG (Mulberry32) — same draft.id → identical race on every client
function uuidSeed(uuid = '') {
  const h = uuid.replace(/-/g, '')
  let s = 0
  for (let i = 0; i < Math.min(h.length, 8); i++) {
    s = (s * 31 + parseInt(h[i] || '0', 16)) & 0x7fffffff
  }
  return (s | 1)
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundLabel(round) {
  const info = getDraftRoundInfo(round)
  if (info.packOddsType === 'captain') return `Round ${round} — Captain Pick`
  if (info.packOddsType === 'legend') return `Round ${round} — Legend Pick`
  return `Round ${round}`
}

// ─── HelmetDisplay ─────────────────────────────────────────────────────────────
// Full SVG helmet — uses saved helmet_color / helmet_secondary / helmet_pattern
// from profile. `presenceColor` overrides base color when set (live lobby change).
// `isMe` adds gold ring; `online` shows green pulse dot.
function HelmetDisplay({ base, secondary, pattern, presenceColor, teamName, uid, size = 56, online = false, isMe = false, onClick }) {
  const svgW = Math.round(size * (300 / 260))
  const svgH = size

  // presenceColor (quick lobby pick) overrides saved base color
  const displayBase = presenceColor || base || '#1B2A4A'

  return (
    <div
      onClick={onClick}
      title={isMe ? 'Tap to change helmet color' : teamName}
      style={{
        position: 'relative',
        width: svgW,
        height: svgH,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        borderRadius: 6,
        outline: isMe ? `2.5px solid ${GOLD}` : '2.5px solid transparent',
        outlineOffset: 3,
        boxShadow: isMe ? `0 0 14px ${GOLD}44` : 'none',
        transition: 'outline-color 0.2s, box-shadow 0.2s',
      }}
    >
      <HelmetSVG
        base={displayBase}
        secondary={secondary || '#F0B429'}
        pattern={pattern || 'solid'}
        uid={uid || 'lobby'}
        width={svgW}
        height={svgH}
      />

      {/* Online indicator dot */}
      <div style={{
        position: 'absolute', bottom: 2, right: 2,
        width: 10, height: 10, borderRadius: '50%',
        backgroundColor: online ? '#4CAF50' : '#2a2a2a',
        border: `2px solid ${BG}`,
        boxShadow: online ? '0 0 7px #4CAF5066' : 'none',
        transition: 'background 0.3s',
      }} />
    </div>
  )
}

// ─── ColorPickerModal ──────────────────────────────────────────────────────────
function ColorPickerModal({ current, onSelect, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#111827', borderRadius: 18, padding: 28,
          border: '1px solid #232840', minWidth: 290,
        }}
      >
        <p style={{
          fontFamily: F, fontWeight: 700, fontSize: 13, letterSpacing: 3,
          textTransform: 'uppercase', color: '#666', marginBottom: 20,
        }}>
          Helmet Color
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 4 }}>
          {HELMET_PALETTE.map(c => (
            <button
              key={c}
              onClick={() => { onSelect(c); onClose() }}
              style={{
                width: 52, height: 52, borderRadius: 10, backgroundColor: c, border: 'none',
                outline: c === current ? `3px solid ${GOLD}` : '3px solid transparent',
                outlineOffset: 2,
                cursor: 'pointer',
                boxShadow: c === current ? `0 0 16px ${c}99` : 'none',
                transition: 'outline 0.15s, box-shadow 0.15s',
              }}
            />
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '10px 0',
            backgroundColor: 'transparent', border: '1px solid #232840',
            borderRadius: 8, color: '#555', fontFamily: F, fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── ChatPanel ─────────────────────────────────────────────────────────────────
function ChatPanel({ messages, onSend }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text) return
    onSend(text)
    setInput('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: '#0c1020', borderRadius: 14,
      border: '1px solid #1a2035', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #1a2035',
        fontFamily: F, fontWeight: 700, fontSize: 11,
        letterSpacing: 3, textTransform: 'uppercase', color: '#3a4060',
      }}>
        League Chat
      </div>

      {/* messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        {messages.length === 0 && (
          <p style={{ color: '#2a2f45', fontSize: 13, textAlign: 'center', marginTop: 28 }}>
            Say hello 👋
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ lineHeight: 1.4 }}>
            <span style={{ fontFamily: F, fontWeight: 700, fontSize: 12.5, color: GOLD }}>
              {msg.displayName}{' '}
            </span>
            <span style={{ color: '#bbb', fontSize: 13 }}>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #1a2035', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 200))}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Message… (emoji ok)"
          maxLength={200}
          style={{
            flex: 1, backgroundColor: '#131926', border: '1px solid #242a3e',
            borderRadius: 8, padding: '9px 12px', color: '#ddd', fontSize: 13,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          style={{
            backgroundColor: GOLD, color: BG,
            fontFamily: F, fontWeight: 800, fontSize: 14,
            padding: '9px 16px', borderRadius: 8, border: 'none',
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            opacity: input.trim() ? 1 : 0.35,
            transition: 'opacity 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ─── LobbyView (State 1 — fully built) ────────────────────────────────────────
function LobbyView({
  draft, members, user, isCommissioner,
  onlineUsers, presenceColors,
  chatMessages, onSendChat,
  onStartDraft, onHelmetColorChange,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  const myColor = presenceColors[user?.id] || hashColor(user?.id || '')

  // Build 12 slots: filled members + null placeholders
  const slots = Array.from({ length: 12 }, (_, i) => members[i] ?? null)

  const handleStart = async () => {
    setStarting(true)
    await onStartDraft()
    // setStarting(false) intentionally omitted — UI will transition away
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #141928',
        backgroundColor: '#070B16',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <a
            href={`/leagues/${draft.league_id}`}
            style={{ color: '#445', fontSize: 13, textDecoration: 'none', flexShrink: 0 }}
          >
            ← League
          </a>
          <span style={{ color: '#1e2436' }}>|</span>
          <span style={{ fontFamily: F, fontWeight: 800, fontSize: 24, color: 'white', letterSpacing: 0.5 }}>
            Draft Lobby
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#3a4060', fontSize: 12, fontFamily: F }}>
            {members.length} / 12 teams
          </span>
          <div style={{
            padding: '5px 14px', borderRadius: 6,
            border: `1px solid ${GOLD}55`,
            fontFamily: F, fontWeight: 700, fontSize: 11,
            letterSpacing: 3, color: GOLD, textTransform: 'uppercase',
          }}>
            Lobby
          </div>
        </div>
      </header>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left panel: helmet grid */}
        <div style={{ flex: 1, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* 4 × 3 helmet grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}>
            {slots.map((member, i) => {
              if (!member) {
                return (
                  <div
                    key={`empty-${i}`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      padding: '20px 8px', borderRadius: 14,
                      border: '1px dashed #1a2035',
                    }}
                  >
                    {/* ghost helmet */}
                    <div style={{
                      width: 56, height: 46,
                      borderRadius: '50% 50% 38% 38% / 60% 60% 42% 42%',
                      backgroundColor: '#111828',
                    }} />
                    <span style={{ color: '#232840', fontSize: 11, fontFamily: F, fontWeight: 600, letterSpacing: 1 }}>
                      OPEN
                    </span>
                  </div>
                )
              }

              const isMe         = member.user_id === user?.id
              const online       = onlineUsers.has(member.user_id)
              const presenceColor = presenceColors[member.user_id] || null

              return (
                <div
                  key={member.user_id}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    padding: '18px 8px', borderRadius: 14,
                    backgroundColor: isMe ? '#0c1530' : 'transparent',
                    border: isMe ? `1px solid ${GOLD}33` : '1px solid #0e1525',
                    transition: 'background 0.2s',
                  }}
                >
                  <HelmetDisplay
                    base={member.helmet_color}
                    secondary={member.helmet_secondary}
                    pattern={member.helmet_pattern}
                    presenceColor={presenceColor}
                    teamName={member.team_name}
                    uid={member.user_id}
                    size={56}
                    online={online}
                    isMe={isMe}
                    onClick={isMe ? () => setPickerOpen(true) : undefined}
                  />

                  <div style={{ textAlign: 'center', width: '100%', paddingInline: 4 }}>
                    <p style={{
                      fontFamily: F, fontWeight: 700, fontSize: 14, letterSpacing: 0.3,
                      color: isMe ? GOLD : 'white',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      marginBottom: 2,
                    }}>
                      {member.team_name}
                    </p>
                    <p style={{
                      color: '#3a4060', fontSize: 11,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {member.display_name}
                    </p>

                    {/* badges */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                      {member.is_commissioner && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          backgroundColor: `${GOLD}1a`, color: GOLD,
                          fontFamily: F, fontWeight: 700, fontSize: 10, letterSpacing: 1,
                        }}>
                          COMMISH
                        </span>
                      )}
                      {isMe && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 4,
                          backgroundColor: '#1a2035', color: '#3a4a70',
                          fontFamily: F, fontWeight: 600, fontSize: 10, letterSpacing: 1,
                        }}>
                          YOU · tap helmet
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Start Draft / waiting strip ── */}
          <div style={{ marginTop: 'auto' }}>
            {isCommissioner ? (
              <>
                <button
                  onClick={handleStart}
                  disabled={starting || members.length < 2}
                  style={{
                    width: '100%', padding: '20px 0',
                    backgroundColor: (starting || members.length < 2) ? '#5a4a10' : GOLD,
                    color: BG,
                    fontFamily: F, fontWeight: 800, fontSize: 22,
                    letterSpacing: 3, textTransform: 'uppercase',
                    border: 'none', borderRadius: 14,
                    cursor: (starting || members.length < 2) ? 'not-allowed' : 'pointer',
                    boxShadow: members.length >= 2 && !starting ? `0 6px 28px ${GOLD}44` : 'none',
                    transition: 'background 0.2s, box-shadow 0.2s',
                  }}
                >
                  {starting ? 'Starting…' : members.length < 2 ? `Need at least 2 teams (${members.length}/2)` : '🏈  Start Draft'}
                </button>
                {members.length >= 2 && !starting && (
                  <p style={{ color: '#2a3050', fontSize: 12, textAlign: 'center', marginTop: 10, fontFamily: F }}>
                    {12 - members.length > 0
                      ? `${12 - members.length} slot${12 - members.length !== 1 ? 's' : ''} still open — you can start now or wait`
                      : 'All 12 teams are in. Ready to draft!'}
                  </p>
                )}
              </>
            ) : (
              <div style={{
                padding: '18px 20px', borderRadius: 14,
                backgroundColor: '#0c1020', border: '1px solid #1a2035',
                textAlign: 'center',
              }}>
                <p style={{ color: '#3a4060', fontSize: 14 }}>
                  Waiting for the commissioner to start the draft…
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: chat (fixed width) */}
        <div style={{
          width: 300, padding: '28px 24px 28px 0',
          display: 'flex', flexDirection: 'column',
        }}>
          <ChatPanel messages={chatMessages} onSend={onSendChat} />
        </div>
      </div>

      {/* Helmet color picker modal */}
      {pickerOpen && (
        <ColorPickerModal
          current={myColor}
          onSelect={onHelmetColorChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ─── HelmetRaceView (State 2 — full animation) ────────────────────────────────
//
// Sequence:
//   ready (2.5 s) → countdown 3-2-1-GO (3 s) → race (until last helmet finishes)
//   → results (3 s) → onRaceComplete(draftOrder)
//
// All helmets receive deterministic speeds seeded from draft.id so every client
// sees the same race.  Last helmet to cross = picks 1st overall.
//
// Helmet positions are updated via direct DOM refs (no React state) so the RAF
// loop never causes re-renders and runs at full frame rate.
function HelmetRaceView({ draft, members, presenceColors, isCommissioner, onRaceComplete }) {
  // ── Layout constants ──────────────────────────────────────────────────────
  const LANE_H    = 54   // px per lane row
  const HEL_D     = 38   // helmet circle diameter
  const START_X   = 24   // initial left offset of each helmet inside the track
  const FIN_GAP   = 100  // px from right edge of track to finish line

  // ── Component state ───────────────────────────────────────────────────────
  // phase: 'ready' | 'countdown' | 'race' | 'results'
  const [phase,        setPhase]        = useState('ready')
  const [cdNum,        setCdNum]        = useState(3)     // 3,2,1, or -1 = GO!
  const [cdKey,        setCdKey]        = useState(0)     // bumped to re-trigger CSS animation
  const [finishLabels, setFinishLabels] = useState({})    // userId → finish position number
  const [totalDone,    setTotalDone]    = useState(0)
  const [resultsTimer, setResultsTimer] = useState(3)
  const [finalOrder,   setFinalOrder]   = useState([])    // draft order (1st pick first)

  // ── Refs (mutated outside React render cycle) ─────────────────────────────
  const trackRef     = useRef(null)   // track container DOM node
  const helmetEls    = useRef({})     // userId → moving div DOM node
  const rafRef       = useRef(null)
  const finalRef     = useRef([])     // committed draft order
  const committedRef = useRef(false)

  // ── Phase 1: GET READY (2.5 s) ────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setPhase('countdown'), 2500)
    return () => clearTimeout(t)
  }, []) // runs once on mount

  // ── Phase 2: COUNTDOWN (3 s) ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    setCdNum(3); setCdKey(k => k + 1)
    const ts = [
      setTimeout(() => { setCdNum(2);  setCdKey(k => k + 1) },  750),
      setTimeout(() => { setCdNum(1);  setCdKey(k => k + 1) }, 1500),
      setTimeout(() => { setCdNum(-1); setCdKey(k => k + 1) }, 2250), // -1 = GO!
      setTimeout(() => setPhase('race'), 2800),
    ]
    return () => ts.forEach(clearTimeout)
  }, [phase])

  // ── Phase 3: RACE ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'race') return

    const trackEl  = trackRef.current
    const trackW   = trackEl ? trackEl.offsetWidth : Math.max(window.innerWidth - 40, 400)
    const finishX  = trackW - FIN_GAP              // finish line absolute x from track left
    const travelD  = finishX - START_X - HEL_D    // total distance each helmet travels

    if (travelD <= 0) return

    // Deterministic RNG seeded from draft.id — identical on every client
    const rng = mulberry32(uuidSeed(draft.id))

    // Pre-generate per-helmet data (speeds + burst schedule) from the seed
    const helmets = members.map(m => {
      const baseSpeed = 115 + rng() * 125  // 115–240 px/s

      // Generate a burst schedule for up to 25 s (more than any race will last)
      const bursts = []
      let bt = rng() * 0.3
      while (bt < 25) {
        const dur  = 0.15 + rng() * 0.6
        const mult = 0.4 + rng() * 1.2   // 0.4× to 1.6×
        bursts.push({ start: bt, end: bt + dur, mult })
        bt += dur + 0.15 + rng() * 0.9
      }

      return { id: m.user_id, baseSpeed, bursts, pos: 0, done: false }
    })

    const finishedIds = []
    let startTs = null
    let lastTs  = null

    const tick = now => {
      if (!startTs) { startTs = now; lastTs = now }
      const dt      = Math.min((now - lastTs) / 1000, 0.05)  // seconds, capped at 50 ms
      const elapsed = (now - startTs) / 1000
      lastTs = now

      // Count remaining (snapshot before this frame's updates)
      const remaining = helmets.filter(h => !h.done).length

      for (const h of helmets) {
        if (h.done) continue

        // Active burst multiplier at current elapsed time
        let burstMult = 1.0
        for (const b of h.bursts) {
          if (elapsed >= b.start && elapsed < b.end) { burstMult = b.mult; break }
        }

        // Suspense: last 3 unfinished AND in the final 15 % of the track → 20 % speed
        const suspenseMult =
          remaining <= 3 && h.pos > travelD * 0.85 ? 0.2 : 1.0

        h.pos = Math.min(h.pos + h.baseSpeed * burstMult * suspenseMult * dt, travelD)

        // Push position to DOM directly — avoids React re-renders in the hot path
        const el = helmetEls.current[h.id]
        if (el) el.style.transform = `translateX(${Math.round(h.pos)}px) translateY(-50%)`

        // Cross finish line?
        if (h.pos >= travelD) {
          h.done = true
          finishedIds.push(h.id)
          const pos = finishedIds.length

          // Show finish-position badge (triggers a React re-render, which is fine
          // because we're manipulating positions via refs, not state)
          setFinishLabels(prev => ({ ...prev, [h.id]: pos }))
          setTotalDone(pos)

          // Brief gold flash on the helmet circle
          const circle = el?.querySelector('[data-hel-circle]')
          if (circle) {
            circle.style.boxShadow = `0 0 28px 6px ${GOLD}cc`
            setTimeout(() => { if (circle) circle.style.boxShadow = '' }, 500)
          }
        }
      }

      if (finishedIds.length < helmets.length) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // All done — last finisher picks 1st overall, so reverse
        const draftOrder = [...finishedIds].reverse()
        finalRef.current = draftOrder
        setFinalOrder(draftOrder)
        setPhase('results')
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 4: RESULTS countdown then hand off ───────────────────────────────
  useEffect(() => {
    if (phase !== 'results') return
    let count = 3
    setResultsTimer(3)
    const iv = setInterval(() => {
      count--
      setResultsTimer(count)
      if (count <= 0) {
        clearInterval(iv)
        if (!committedRef.current && finalRef.current.length > 0) {
          committedRef.current = true
          onRaceComplete(finalRef.current)
        }
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, onRaceComplete])

  // ── Derived ────────────────────────────────────────────────────────────────
  const memberMap   = Object.fromEntries(members.map(m => [m.user_id, m]))
  const trackHeight = members.length * LANE_H + 40
  const trackW_css  = '100%'

  // ── Shared overlay wrapper ─────────────────────────────────────────────────
  const Overlay = ({ children }) => (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 10,
    }}>
      {children}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: GET READY
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <Overlay>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes racePulse {
            0%,100% { opacity:1; letter-spacing:6px; }
            50%      { opacity:.5; letter-spacing:10px; }
          }
        `}} />
        <p style={{
          fontFamily: F, fontWeight: 800, fontSize: 'clamp(48px, 8vw, 96px)',
          color: 'white', textTransform: 'uppercase',
          animation: 'racePulse 1.1s ease-in-out infinite',
        }}>
          Get Ready
        </p>
        <p style={{ color: '#3a4060', fontFamily: F, fontSize: 18, marginTop: 24, letterSpacing: 2 }}>
          Draft order race starting…
        </p>
      </Overlay>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: COUNTDOWN
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'countdown') {
    const isGo    = cdNum === -1
    const display = isGo ? 'GO!' : String(cdNum)
    return (
      <Overlay>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slamIn {
            from { transform: scale(2.2) translateY(-30px); opacity: 0; }
            to   { transform: scale(1)   translateY(0);     opacity: 1; }
          }
        `}} />
        <div
          key={cdKey}
          style={{
            fontFamily: F, fontWeight: 800,
            fontSize: 'clamp(96px, 20vw, 200px)',
            color: isGo ? GOLD : 'white',
            lineHeight: 1,
            animation: 'slamIn 0.28s cubic-bezier(.2,.8,.4,1) forwards',
            textShadow: isGo ? `0 0 60px ${GOLD}88` : '0 4px 24px rgba(0,0,0,0.8)',
            userSelect: 'none',
          }}
        >
          {display}
        </div>
        {isGo && (
          <p style={{
            fontFamily: F, fontWeight: 700, fontSize: 22,
            color: GOLD, letterSpacing: 4, textTransform: 'uppercase',
            marginTop: 12, opacity: 0.8,
          }}>
            Helmets Racing!
          </p>
        )}
      </Overlay>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'results') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUp {
            from { opacity:0; transform: translateY(16px); }
            to   { opacity:1; transform: translateY(0); }
          }
        `}} />

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <p style={{ fontFamily: F, fontWeight: 800, fontSize: 48, color: GOLD, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8 }}>
            Draft Order Locked 🔒
          </p>
          <p style={{ color: '#3a4060', fontFamily: F, fontSize: 16 }}>
            Last to finish picks first · Draft starts in{' '}
            <span style={{ color: GOLD, fontWeight: 700 }}>{Math.max(resultsTimer, 0)}</span>…
          </p>
        </div>

        {/* Draft order list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 480 }}>
          {finalOrder.map((uid, i) => {
            const m     = memberMap[uid]
            const color = presenceColors[uid] || hashColor(uid)
            const initials = (m?.team_name || '??').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={uid}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  backgroundColor: i === 0 ? '#0e1f10' : '#0c1020',
                  border: i === 0 ? `1px solid ${GOLD}55` : '1px solid #1a2035',
                  borderRadius: 12, padding: '12px 16px',
                  animation: `slideUp 0.35s ${i * 0.05}s ease-out both`,
                }}
              >
                {/* Pick number */}
                <span style={{
                  fontFamily: F, fontWeight: 800, fontSize: 22,
                  color: i === 0 ? GOLD : '#3a4060',
                  width: 36, textAlign: 'right', flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                {/* Mini helmet */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', backgroundColor: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: i === 0 ? `0 0 16px ${color}88` : 'none',
                }}>
                  <span style={{ fontFamily: F, fontWeight: 800, fontSize: 13, color: 'white' }}>
                    {initials}
                  </span>
                </div>
                {/* Names */}
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 16, color: i === 0 ? GOLD : 'white', marginBottom: 1 }}>
                    {m?.team_name || uid.slice(0, 8)}
                  </p>
                  <p style={{ color: '#3a4060', fontSize: 12 }}>{m?.display_name}</p>
                </div>
                {i === 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    fontFamily: F, fontWeight: 800, fontSize: 11, letterSpacing: 2,
                    color: GOLD, textTransform: 'uppercase',
                    border: `1px solid ${GOLD}55`, borderRadius: 6, padding: '3px 10px',
                  }}>
                    1st Pick
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: RACE
  // ─────────────────────────────────────────────────────────────────────────
  // Finish line x is computed dynamically in the RAF effect; here we draw it
  // with CSS right: FIN_GAP so it always matches the logical finish.
  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes finishPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}} />

      {/* Header bar */}
      <div style={{
        padding: '14px 28px', borderBottom: '1px solid #141928',
        backgroundColor: '#070B16', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: F, fontWeight: 800, fontSize: 22, color: 'white', letterSpacing: 1 }}>
          🏁 Helmet Race
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: F, fontSize: 13, color: '#3a4060' }}>
            {totalDone} / {members.length} finished
          </span>
          <span style={{
            fontFamily: F, fontWeight: 700, fontSize: 11, letterSpacing: 3,
            color: GOLD, border: `1px solid ${GOLD}44`, borderRadius: 6, padding: '4px 12px',
          }}>
            Last = 1st Pick
          </span>
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          paddingTop: 20, paddingBottom: 20,
        }}
      >
        {/* Finish line */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          right: FIN_GAP, width: 3,
          background: `repeating-linear-gradient(to bottom, ${GOLD} 0px, ${GOLD} 10px, #222 10px, #222 20px)`,
          zIndex: 2,
        }} />
        {/* Finish line glow */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          right: FIN_GAP - 8, width: 20,
          background: `linear-gradient(to right, transparent, ${GOLD}22, transparent)`,
          animation: 'finishPulse 1.5s ease-in-out infinite',
          zIndex: 1,
        }} />
        {/* FINISH label */}
        <div style={{
          position: 'absolute', top: 8, right: FIN_GAP - 38, zIndex: 3,
          fontFamily: F, fontWeight: 800, fontSize: 11, letterSpacing: 2,
          color: GOLD, textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          FINISH
        </div>

        {/* Start line */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: START_X + HEL_D + 4, width: 1,
          backgroundColor: '#1a2035', zIndex: 1,
        }} />

        {/* Helmet lanes */}
        {members.map((m, i) => {
          const color = presenceColors[m.user_id] || hashColor(m.user_id)
          const initials = (m.team_name || '??')
            .split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
          const finishPos = finishLabels[m.user_id]

          return (
            <div
              key={m.user_id}
              style={{
                position: 'absolute',
                top: 20 + i * LANE_H,
                left: 0, right: 0,
                height: LANE_H,
              }}
            >
              {/* Lane stripe (subtle) */}
              {i % 2 === 0 && (
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundColor: 'rgba(255,255,255,0.015)',
                }} />
              )}

              {/* Moving helmet group — position driven by RAF via ref */}
              <div
                ref={el => { helmetEls.current[m.user_id] = el }}
                style={{
                  position: 'absolute',
                  left: START_X,
                  top: '50%',
                  transform: 'translateX(0) translateY(-50%)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  willChange: 'transform',
                }}
              >
                {/* Helmet circle */}
                <div
                  data-hel-circle
                  style={{
                    width: HEL_D, height: HEL_D, borderRadius: '50%',
                    backgroundColor: color, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 2px 12px ${color}55`,
                    transition: 'box-shadow 0.3s',
                  }}
                >
                  <span style={{
                    fontFamily: F, fontWeight: 800, fontSize: 13,
                    color: 'rgba(255,255,255,0.9)', userSelect: 'none',
                  }}>
                    {initials}
                  </span>
                </div>
                {/* Team name */}
                <span style={{
                  fontFamily: F, fontWeight: 700, fontSize: 14, color: 'white',
                  whiteSpace: 'nowrap', userSelect: 'none',
                  opacity: finishPos ? 0.5 : 1,
                }}>
                  {m.team_name}
                </span>
              </div>

              {/* Finish-position badge — appears at finish line when helmet crosses */}
              {finishPos && (
                <div style={{
                  position: 'absolute',
                  right: FIN_GAP - 68,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontFamily: F, fontWeight: 800, fontSize: 13,
                  color: finishPos <= 3 ? '#3a4060' : GOLD,
                  backgroundColor: finishPos <= 3 ? '#0c1020' : `${GOLD}22`,
                  border: `1px solid ${finishPos <= 3 ? '#1a2035' : GOLD + '55'}`,
                  borderRadius: 6, padding: '2px 10px',
                  whiteSpace: 'nowrap',
                  zIndex: 4,
                }}>
                  {finishPos === members.length
                    ? '🏆 1st Pick'
                    : finishPos === members.length - 1
                      ? '🥈 2nd Pick'
                      : finishPos === members.length - 2
                        ? '🥉 3rd Pick'
                        : `#${members.length - finishPos + 1} pick`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── DraftBoardPanel ──────────────────────────────────────────────────────────
// Left panel: all rounds × all picks, snake order, live-updating.
function DraftBoardPanel({ draft, members, draftPicks, currentPickNum }) {
  const totalTeams  = draft.draft_order?.length || members.length || 1
  const totalRounds = draft.total_rounds || 10
  const pickByNum   = Object.fromEntries(draftPicks.map(p => [p.pick_number, p]))
  const memberMap   = Object.fromEntries(members.map(m => [m.user_id, m]))

  useEffect(() => {
    document.getElementById(`ps-${currentPickNum}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentPickNum])

  const rounds = []
  for (let r = 1; r <= totalRounds; r++) {
    const slots = []
    for (let pos = 0; pos < totalTeams; pos++) {
      const pn = (r - 1) * totalTeams + pos + 1
      const ti = r % 2 === 1 ? pos : totalTeams - 1 - pos
      const uid = draft.draft_order?.[ti]
      slots.push({ pn, uid, member: memberMap[uid], pick: pickByNum[pn], isCurrent: pn === currentPickNum })
    }
    rounds.push({ r, slots })
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {rounds.map(({ r, slots }) => {
        const ri = getDraftRoundInfo(r)
        const accent = ri.packOddsType === 'legend' ? GOLD
          : ri.packOddsType === 'captain' ? '#7C4DFF' : '#2a3050'
        return (
          <div key={r}>
            <div style={{
              padding: '7px 14px', position: 'sticky', top: 0, zIndex: 2,
              backgroundColor: '#070b14', borderBottom: '1px solid #111928',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: F, fontWeight: 800, fontSize: 11, letterSpacing: 2, color: accent, textTransform: 'uppercase' }}>
                R{r}
              </span>
              {ri.packOddsType === 'captain' && <span style={{ fontFamily: F, fontSize: 10, color: '#4a3090', letterSpacing: 1 }}>Captain</span>}
              {ri.packOddsType === 'legend'  && <span style={{ fontFamily: F, fontSize: 10, color: '#806010', letterSpacing: 1 }}>Legend</span>}
            </div>

            {slots.map(({ pn, member, pick, isCurrent }) => {
              const player   = pick?.players
              const ts       = player ? (TIER_STYLE[player.tier] || TIER_STYLE.bronze) : null
              return (
                <div
                  id={`ps-${pn}`}
                  key={pn}
                  style={{
                    padding: '5px 12px 5px 10px',
                    borderLeft: isCurrent ? `3px solid ${GOLD}` : '3px solid transparent',
                    backgroundColor: isCurrent ? '#0b1828' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 7, minHeight: 38,
                    transition: 'background 0.3s',
                  }}
                >
                  <span style={{ color: '#1e2840', fontSize: 10, width: 22, textAlign: 'right', flexShrink: 0, fontFamily: F }}>
                    {pn}
                  </span>

                  {player ? (
                    <>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: ts.border, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: F, fontWeight: 700, fontSize: 12.5, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {player.name}
                          </span>
                          {pick?.is_auto_draft && (
                            <span style={{ fontSize: 9, fontFamily: F, fontWeight: 700, color: '#3a4060', border: '1px solid #2a3050', borderRadius: 3, padding: '0 3px', flexShrink: 0, letterSpacing: 0.5 }}>AUTO</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 1 }}>
                          <span style={{ fontSize: 10, color: POS_COLOR[player.position] || '#666', fontFamily: F, fontWeight: 700 }}>{player.position}</span>
                          <span style={{ fontSize: 10, color: '#2a3050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {memberMap[pick.team_user_id]?.team_name || '—'}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontFamily: F, fontWeight: 800, fontSize: 13, color: ts.border, flexShrink: 0 }}>{player.overall_rating}</span>
                    </>
                  ) : (
                    <span style={{ color: isCurrent ? '#445' : '#1a2035', fontSize: 12, fontFamily: F, flex: 1, fontWeight: isCurrent ? 700 : 400 }}>
                      {isCurrent ? `▶ ${member?.team_name || '—'}` : member?.team_name || '—'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── PackCard ─────────────────────────────────────────────────────────────────
// One of the 5 cards shown in the pack opening area.
// Props:
//   packReady   – true once the 300ms shake window has passed; controls entrance
//   dim         – true when another card is selected/hovered (dims this card)
//   preReveal   – 'hero'|'gold'|'legend'|null  (tier-5 pre-flip effect)
//   onHover/onHoverEnd – for parent to track which card is hovered
function PackCard({ player, index, flipped, selected, dim, onSelect, onHover, onHoverEnd, disabled, packReady, preReveal }) {
  const ts  = player ? (TIER_STYLE[player.tier] || TIER_STYLE.bronze) : TIER_STYLE.bronze
  const is5 = index === 4
  const tier = player?.tier || 'bronze'

  const showHeroGlow     = is5 && !flipped && preReveal === 'hero'
  const showGoldBurst    = is5 &&  flipped && tier === 'gold'
  const showLegendShimmer= is5 &&  flipped && tier === 'legend'

  // Entrance delay: card i enters at 300ms base + 80ms stagger
  const entranceDelay = (0.30 + index * 0.08).toFixed(2)

  // Flip speed: hero/legend get a slower, more dramatic flip
  const flipDuration = is5 && (tier === 'hero' || tier === 'legend') ? '0.7s' : '0.48s'

  return (
    <div
      onMouseEnter={() => flipped && !disabled && onHover?.(index)}
      onMouseLeave={() => flipped && !disabled && onHoverEnd?.()}
      style={{
        position: 'relative',
        flexShrink: 0,
        perspective: '700px',
        // Entrance: invisible until packReady, then staggered slide-up
        opacity:    packReady ? undefined : 0,
        animation:  packReady ? `cardEntrance 0.45s cubic-bezier(0.2,0.8,0.3,1) ${entranceDelay}s both` : 'none',
        // Selection lift + hover dimming
        transform:  selected ? 'translateY(-8px)' : 'translateY(0px)',
        filter:     dim ? 'brightness(0.4) saturate(0.5)' : 'brightness(1) saturate(1)',
        transition: 'transform 0.18s ease, filter 0.14s ease',
      }}
    >
      {/* Gold particle burst — fires when card 5 flips (gold tier) */}
      {showGoldBurst && (
        <div style={{
          position: 'absolute', inset: '-4px', borderRadius: 18,
          pointerEvents: 'none', zIndex: 10,
          animation: 'goldBurst 1.5s ease-out forwards',
        }} />
      )}

      {/* ── 3-D flip container ── */}
      <div
        onClick={flipped && !disabled && player ? onSelect : undefined}
        style={{
          width: 118, height: 170, borderRadius: 14,
          position: 'relative',
          transformStyle: 'preserve-3d',
          WebkitTransformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: `transform ${flipDuration} cubic-bezier(0.42, 0.0, 0.18, 1.0)`,
          cursor: flipped && !disabled && player ? 'pointer' : 'default',
          // Hero glow ring pulses on the back face before flip
          animation: showHeroGlow ? 'heroPulse 0.65s ease-in-out 3' : 'none',
          // Selection ring (only visible when card face is showing)
          boxShadow: selected && flipped
            ? `0 0 0 3px ${GOLD}, 0 12px 44px ${GOLD}55`
            : is5 && flipped
              ? `0 8px 36px ${ts.glow}`
              : 'none',
        }}
      >
        {/* ── Card BACK face ── */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          backgroundColor: '#07090f',
          border: '2px solid #1a2440',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
          overflow: 'hidden',
        }}>
          {/* Subtle gold diamond-grid pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `
              repeating-linear-gradient( 45deg, transparent, transparent 9px, rgba(240,180,41,0.07) 9px, rgba(240,180,41,0.07) 10px),
              repeating-linear-gradient(-45deg, transparent, transparent 9px, rgba(240,180,41,0.07) 9px, rgba(240,180,41,0.07) 10px)
            `,
          }} />
          {/* Emblem circle */}
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            border: '1.5px solid rgba(240,180,41,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(240,180,41,0.04)',
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🏈</span>
          </div>
          <span style={{
            fontFamily: F, fontWeight: 800, fontSize: 9, letterSpacing: 3,
            color: '#F0B429', opacity: 0.32, textTransform: 'uppercase',
          }}>
            Draft Prime
          </span>
        </div>

        {/* ── Card FRONT face ── */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          backgroundColor: '#0c1525',
          border: `2px solid ${selected ? GOLD : ts.border}`,
          boxShadow: `inset 0 0 0 1px ${ts.border}14`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '12px 8px', overflow: 'hidden',
        }}>
          {player && (
            <>
              {/* Legend shimmer overlay */}
              {showLegendShimmer && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 12,
                  background: 'linear-gradient(105deg, transparent 25%, rgba(255,248,231,0.28) 50%, transparent 75%)',
                  backgroundSize: '260% 100%',
                  animation: 'legendShimmer 2.2s linear infinite',
                  pointerEvents: 'none', zIndex: 1,
                }} />
              )}
              {/* Tier badge */}
              <div style={{
                padding: '2px 10px', borderRadius: 4, position: 'relative', zIndex: 2,
                backgroundColor: `${ts.border}22`, border: `1px solid ${ts.border}66`,
                fontFamily: F, fontWeight: 800, fontSize: 10, letterSpacing: 2,
                color: ts.border, textTransform: 'uppercase',
              }}>
                {tier}
              </div>
              {/* OVR */}
              <div style={{
                fontFamily: F, fontWeight: 800, fontSize: 46, lineHeight: 1,
                color: ts.border, textShadow: `0 0 22px ${ts.glow}`,
                position: 'relative', zIndex: 2,
              }}>
                {player.overall_rating}
              </div>
              {/* Name */}
              <div style={{
                fontFamily: F, fontWeight: 700, fontSize: 12.5, color: 'white',
                textAlign: 'center', lineHeight: 1.3, padding: '0 4px',
                position: 'relative', zIndex: 2,
              }}>
                {player.name}
              </div>
              {/* Position */}
              <div style={{
                fontFamily: F, fontWeight: 800, fontSize: 13,
                color: POS_COLOR[player.position] || '#888', letterSpacing: 1,
                position: 'relative', zIndex: 2,
              }}>
                {player.position}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ★ BEST badge — pops in when card 5 reveals */}
      {is5 && flipped && (
        <div style={{
          position: 'absolute', top: -13, left: '50%',
          backgroundColor: GOLD, color: BG,
          fontFamily: F, fontWeight: 800, fontSize: 10, letterSpacing: 1,
          padding: '2px 12px', borderRadius: 20, textTransform: 'uppercase',
          whiteSpace: 'nowrap', zIndex: 5,
          boxShadow: `0 2px 14px ${GOLD}77`,
          animation: 'badgeIn 0.38s cubic-bezier(0.2,0.8,0.3,1) both',
        }}>
          ★ Best
        </div>
      )}
    </div>
  )
}

// ─── ActiveDraftView (State 3 — full) ─────────────────────────────────────────
function ActiveDraftView({ draft, members, user, isCommissioner, chatMessages, onSendChat, presenceColors }) {
  // ── State ────────────────────────────────────────────────────────────────────
  const [draftPicks,  setDraftPicks]  = useState([])
  const [pack,        setPack]        = useState(null)      // { packOddsType, players, playerIds, packId }
  const [packLoading, setPackLoading] = useState(false)
  const [packError,   setPackError]   = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)   // 0–4
  const [confirming,  setConfirming]  = useState(false)
  const [timerSecs,   setTimerSecs]   = useState(60)
  const [cardFlips,   setCardFlips]   = useState([false, false, false, false, false])
  const [tier5Reveal, setTier5Reveal] = useState(null)     // null | 'hero' | 'legend' | 'gold'
  const [roundOverlay, setRoundOverlay] = useState(null)   // { round, isLegend }
  const [autoDraftOn,  setAutoDraftOn]  = useState(false)
  const [packReady,    setPackReady]    = useState(false)   // true after 300ms shake window
  const [hoveredCard,  setHoveredCard]  = useState(null)   // 0-4 | null
  const [autoFired,    setAutoFired]    = useState(false)

  // ── Refs (stable values for callbacks) ───────────────────────────────────────
  const supaRef       = useRef(null)
  const draftRef      = useRef(draft)
  const userRef       = useRef(user)
  const packRef       = useRef(null)
  const confirmRef    = useRef(false)
  const autoFiredRef  = useRef(false)
  // null = "uninitialized"; set to current round on first render so mid-draft
  // joins don't spuriously flash the round overlay on mount.
  const prevRoundRef  = useRef(null)

  // Keep refs in sync each render
  draftRef.current  = draft
  userRef.current   = user
  confirmRef.current = confirming
  // Do NOT sync autoFiredRef here — the effect sets it imperatively before the
  // state update is committed, so syncing from state would race and overwrite it.
  // autoFiredRef is reset explicitly in doLoadPack when a new turn begins.

  // ── Derived values ────────────────────────────────────────────────────────────
  const totalTeams  = draft.draft_order?.length || members.length || 1
  const totalPicks  = (draft.total_rounds || 10) * totalTeams
  const pickNum     = draft.current_pick_number || 1
  const round       = Math.ceil(pickNum / totalTeams)
  const roundInfo   = getDraftRoundInfo(round)
  const isMyTurn    = draft.current_team_user_id === user?.id
  const memberMap   = Object.fromEntries(members.map(m => [m.user_id, m]))
  const currentMember = memberMap[draft.current_team_user_id]
  const lastPick    = draftPicks[draftPicks.length - 1]

  // ── Init supabase + load picks + realtime ─────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supaRef.current = supabase

    supabase.from('draft_picks')
      .select('id, pick_number, round, team_user_id, player_id, is_auto_draft, players(id, name, position, tier, overall_rating)')
      .eq('draft_id', draft.id)
      .order('pick_number')
      .then(({ data }) => { if (data) setDraftPicks(data) })

    const sub = supabase.channel(`active-picks:${draft.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'draft_picks',
        filter: `draft_id=eq.${draft.id}`,
      }, async ({ new: row }) => {
        const { data } = await supabase.from('draft_picks')
          .select('id, pick_number, round, team_user_id, player_id, is_auto_draft, players(id, name, position, tier, overall_rating)')
          .eq('id', row.id).single()
        if (data) setDraftPicks(prev => {
          if (prev.some(p => p.id === data.id)) return prev
          return [...prev, data].sort((a, b) => a.pick_number - b.pick_number)
        })
      })
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [draft.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Round-transition overlay ─────────────────────────────────────────────────
  useEffect(() => {
    // First render: record starting round without showing overlay.
    // This prevents a spurious flash when a user opens the page mid-draft.
    if (prevRoundRef.current === null) {
      prevRoundRef.current = round
      return
    }
    if (round > prevRoundRef.current) {
      const ri = getDraftRoundInfo(round)
      setRoundOverlay({ round, isLegend: ri.packOddsType === 'legend' })
      const t = setTimeout(() => setRoundOverlay(null), 1700)
      return () => clearTimeout(t)
    }
    prevRoundRef.current = round
  }, [round])

  // ── Load / generate pack when it's my turn ────────────────────────────────────
  useEffect(() => {
    if (!isMyTurn || !user) return
    setPack(null); packRef.current = null
    setSelectedCard(null); setPackError(null)
    setAutoFired(false); autoFiredRef.current = false
    setCardFlips([false, false, false, false, false])
    doLoadPack()
  }, [isMyTurn, pickNum]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pack reveal sequence ──────────────────────────────────────────────────────
  // Timeline (ms from when pack state is set):
  //   0–300ms   : container shake ("rips open"); cards invisible
  //   300ms     : packReady → true; cards stagger in face-down (entrance anim)
  //   1000ms    : card 1 flips
  //   1300ms    : card 2 flips
  //   1600ms    : card 3 flips
  //   1900ms    : card 4 flips
  //   1900 + tier5Delay : pre-reveal effect fires
  //   1900 + tier5Delay + preRevealOffset : card 5 flips
  useEffect(() => {
    if (!pack) return
    setCardFlips([false, false, false, false, false])
    setTier5Reveal(null)
    setSelectedCard(null)
    setHoveredCard(null)
    setPackReady(false)

    const timers = []

    // Shake window → reveal cards
    timers.push(setTimeout(() => setPackReady(true), 300))

    // Cards 1–4 flip at 300ms intervals starting at 1000ms
    const flipBase = 1000
    ;[0, 1, 2, 3].forEach(i =>
      timers.push(setTimeout(() =>
        setCardFlips(prev => { const n = [...prev]; n[i] = true; return n }),
        flipBase + i * 300,
      ))
    )

    // Card 5 tier-based suspense after card 4 flips (at 1900ms)
    const tier5 = pack.players[4]?.tier || 'bronze'
    const lastFlip = flipBase + 3 * 300  // 1900ms — when card 4 flips
    const suspense  = { bronze: 800, silver: 800, gold: 1500, hero: 2200, legend: 3500 }[tier5] || 800
    const c5Flip    = lastFlip + suspense

    // Pre-reveal ambient effect (fires before card 5 flips)
    const preRevealLead = { gold: 600, hero: 1300, legend: 1900 }[tier5]
    if (preRevealLead) {
      timers.push(setTimeout(() => setTier5Reveal(tier5), c5Flip - preRevealLead))
    }

    // Card 5 flip + clear pre-reveal
    timers.push(setTimeout(() => {
      setCardFlips(p => { const n = [...p]; n[4] = true; return n })
      setTimeout(() => setTier5Reveal(null), 900)
    }, c5Flip))

    return () => timers.forEach(clearTimeout)
  }, [pack])

  // ── Timer (derived from draft.pick_deadline server timestamp) ─────────────────
  useEffect(() => {
    if (!draft.pick_deadline) { setTimerSecs(60); return }
    const tick = () => {
      const rem = Math.max(0, Math.ceil((new Date(draft.pick_deadline) - Date.now()) / 1000))
      setTimerSecs(rem)
    }
    tick()
    const iv = setInterval(tick, 500)
    return () => clearInterval(iv)
  }, [draft.pick_deadline])

  // ── Auto-draft at timer = 0 ──────────────────────────────────────────────────
  useEffect(() => {
    if (timerSecs > 0 || !isMyTurn || confirmRef.current || autoFiredRef.current) return
    const p = packRef.current
    if (!p || p.players.length < 2) return
    autoFiredRef.current = true
    setAutoFired(true)
    setAutoDraftOn(true)
    // Randomly pick the best (index 4) or 2nd-best (index 3)
    doSubmitPick(Math.random() < 0.5 ? 4 : 3, true)
  }, [timerSecs, isMyTurn]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pack loader (idempotent — checks draft_packs first) ──────────────────────
  const doLoadPack = async () => {
    setPackLoading(true)
    const supabase = supaRef.current || createClient()
    const d = draftRef.current
    const u = userRef.current
    if (!d || !u) { setPackLoading(false); return }

    const pNum  = d.current_pick_number || 1
    const teams = d.draft_order?.length || members.length || 1
    const r     = Math.ceil(pNum / teams)

    try {
      // Check for an already-generated pack for this pick
      const { data: existing } = await supabase.from('draft_packs')
        .select('*').eq('draft_id', d.id).eq('pick_number', pNum).eq('team_user_id', u.id)
        .maybeSingle()

      let packData
      if (existing) {
        const { data: players } = await supabase.from('players')
          .select('id, name, position, tier, overall_rating').in('id', existing.player_ids)
        const ordered = existing.player_ids.map(id => players?.find(p => p.id === id)).filter(Boolean)
        packData = { packOddsType: existing.pack_odds_type, players: ordered, playerIds: existing.player_ids, packId: existing.id }
      } else {
        const result = await generatePack(supabase, { round: r, draftId: d.id, teamUserId: u.id })
        const { data: stored, error: packSaveErr } = await supabase.from('draft_packs').insert([{
          draft_id: d.id, pick_number: pNum, team_user_id: u.id,
          pack_odds_type: result.packOddsType, player_ids: result.playerIds,
        }]).select().single()
        if (packSaveErr) console.warn('[Pack] save failed (pick will still work):', packSaveErr.message)
        packData = { ...result, packId: stored?.id }
      }

      setPack(packData)
      packRef.current = packData
    } catch (err) {
      console.error('[Pack]', err.message)
      setPackError(err.message)
    } finally {
      setPackLoading(false)
    }
  }

  // ── Submit a pick ─────────────────────────────────────────────────────────────
  const doSubmitPick = async (cardIdx, isAuto = false) => {
    const p  = packRef.current
    const d  = draftRef.current
    const u  = userRef.current
    if (!p || !d || !u || confirmRef.current) return

    const player = p.players[cardIdx]
    if (!player) return

    confirmRef.current = true
    setConfirming(true)

    const supabase = supaRef.current || createClient()
    const teams    = d.draft_order?.length || members.length || 1
    const pNum     = d.current_pick_number || 1
    const r        = Math.ceil(pNum / teams)
    const posInR   = (pNum - 1) % teams

    const { error: pickErr } = await supabase.from('draft_picks').insert([{
      draft_id: d.id, pack_id: p.packId ?? null,
      pick_number: pNum, round: r, pick_in_round: posInR + 1,
      team_user_id: u.id, player_id: player.id, is_auto_draft: isAuto,
    }])

    if (pickErr) {
      console.error('[Pick insert]', pickErr.message)
      confirmRef.current = false
      setConfirming(false)
      return
    }

    // Advance draft to next pick
    const nextPick = pNum + 1
    const totPicks = (d.total_rounds || 10) * teams

    if (nextPick > totPicks) {
      await supabase.from('drafts').update({ status: 'complete' }).eq('id', d.id)
      logActivityFromClient(supabase, {
        leagueId: d.league_id,
        eventType: 'draft_complete',
        payload: {},
      })
    } else {
      const nextRound    = Math.ceil(nextPick / teams)
      const nextPos      = (nextPick - 1) % teams
      const nextTeamIdx  = nextRound % 2 === 1 ? nextPos : teams - 1 - nextPos
      const nextTeamUid  = d.draft_order?.[nextTeamIdx] ?? null
      const deadline     = new Date(Date.now() + 62_000).toISOString()   // 62 s (2 s network buffer)

      await supabase.from('drafts').update({
        current_pick_number: nextPick,
        current_team_user_id: nextTeamUid,
        pick_deadline: deadline,
      }).eq('id', d.id)
    }

    // Clear local pack; Realtime arrival re-evaluates isMyTurn
    setPack(null); packRef.current = null
    setSelectedCard(null)
    setConfirming(false); confirmRef.current = false
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const timerRed  = timerSecs <= 10
  const timerStr  = `${Math.floor(timerSecs / 60)}:${String(timerSecs % 60).padStart(2, '0')}`
  const allFlipped = cardFlips.every(Boolean)

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100vh', backgroundColor: BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        /* ── Card entrance: slide up from below ── */
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(32px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        /* ── Pack container rip-open shake ── */
        @keyframes packShake {
          0%   { transform: scale(1)    rotate(0deg);   }
          12%  { transform: scale(1.03) rotate(-1.6deg); }
          26%  { transform: scale(1.04) rotate(1.8deg);  }
          40%  { transform: scale(1.02) rotate(-1.1deg); }
          55%  { transform: scale(1.01) rotate(0.6deg);  }
          70%  { transform: scale(1.005) rotate(-0.25deg);}
          100% { transform: scale(1)    rotate(0deg);   }
        }
        /* ── Hero card glow pulse on card back ── */
        @keyframes heroPulse {
          0%   { box-shadow: 0 0  0px  0px rgba(255,75,51,0),    0 0  0px  0px rgba(255,100,40,0); }
          45%  { box-shadow: 0 0 28px 10px rgba(255,75,51,0.55), 0 0 50px 20px rgba(255,100,40,0.2); }
          100% { box-shadow: 0 0 55px 28px rgba(255,75,51,0),    0 0 90px 40px rgba(255,100,40,0); }
        }
        /* ── Gold particle burst from card 5 ── */
        @keyframes goldBurst {
          0%   {
            box-shadow: 0 0 0 0 #FFD70099, 0 0 0 0 #FFD70066, 0 0 0 0 #FFD70044;
            opacity: 1;
          }
          55%  {
            box-shadow:
              0 -60px 14px -8px #FFD70066,   60px 0 14px -8px #FFD70055,
              0  60px 14px -8px #FFD70044,  -60px 0 14px -8px #FFD70055,
              44px -44px 14px -10px #FFD70044, 44px 44px 14px -10px #FFD70033,
             -44px -44px 14px -10px #FFD70044,-44px 44px 14px -10px #FFD70033;
            opacity: 0.85;
          }
          100% {
            box-shadow:
              0 -110px 22px -14px #FFD70000,  110px 0 22px -14px #FFD70000,
              0  110px 22px -14px #FFD70000, -110px 0 22px -14px #FFD70000,
              78px -78px 22px -16px #FFD70000, 78px 78px 22px -16px #FFD70000,
             -78px -78px 22px -16px #FFD70000,-78px 78px 22px -16px #FFD70000;
            opacity: 0;
          }
        }
        /* ── Legend screen flash (full-screen ivory) ── */
        @keyframes legendScreenFlash {
          0%   { opacity: 0;   }
          18%  { opacity: 0.72; }
          55%  { opacity: 0.28; }
          100% { opacity: 0;   }
        }
        /* ── Legend card-face shimmer ── */
        @keyframes legendShimmer {
          from { background-position: -260% center; }
          to   { background-position: 260% center;  }
        }
        /* ── ★ BEST badge pop-in ── */
        @keyframes badgeIn {
          from { transform: translateX(-50%) scale(0.4); opacity: 0; }
          to   { transform: translateX(-50%) scale(1);   opacity: 1; }
        }
        /* ── Timer pulse (red countdown) ── */
        @keyframes timerPulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.65; transform: scale(1.06); }
        }
        /* ── Draft board pick highlight ── */
        @keyframes pickGlow {
          0%,100% { background-color: #0b1828; }
          50%      { background-color: #0d2040; }
        }
        /* ── Pre-reveal: ambient hero glow on center panel ── */
        @keyframes heroGlowPulse {
          0%,100% { box-shadow: none; }
          50%      { box-shadow: 0 0 80px 24px #FF4B3333; }
        }
        /* ── Pre-reveal: ambient gold on center panel ── */
        @keyframes goldBurstAnim {
          0%,100% { box-shadow: none; }
          50%      { box-shadow: 0 0 90px 28px #F0B42944; }
        }
        /* ── Round-transition overlay ── */
        @keyframes roundSplash {
          0%   { opacity: 0; transform: scale(0.85); }
          20%  { opacity: 1; transform: scale(1);    }
          80%  { opacity: 1; transform: scale(1);    }
          100% { opacity: 0; transform: scale(1.05); }
        }
      `}} />

      {/* ── Round-transition overlay ── */}
      {roundOverlay && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80,
          backgroundColor: roundOverlay.isLegend ? 'rgba(15,10,0,0.88)' : 'rgba(0,5,20,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'roundSplash 1.7s ease-in-out forwards',
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: F, fontWeight: 800,
              fontSize: 'clamp(40px, 7vw, 80px)',
              color: roundOverlay.isLegend ? GOLD : 'white',
              letterSpacing: 5, textTransform: 'uppercase',
              textShadow: roundOverlay.isLegend ? `0 0 40px ${GOLD}88` : 'none',
            }}>
              Round {roundOverlay.round}
            </p>
            {roundOverlay.isLegend && (
              <p style={{ fontFamily: F, fontWeight: 700, fontSize: 22, color: GOLD, letterSpacing: 4, opacity: 0.8, marginTop: 8 }}>
                ⚜️ Legend Round
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Tier-5 pre-reveal effect overlay ── */}
      {tier5Reveal === 'legend' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 30, pointerEvents: 'none',
          animation: 'legendScreenFlash 1.4s ease-out forwards',
        }} />
      )}

      {/* ── Top bar ── */}
      <header style={{
        padding: '0 24px', height: 58, flexShrink: 0,
        backgroundColor: '#060910', borderBottom: '1px solid #111928',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        {/* Round + pick info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <span style={{
            fontFamily: F, fontWeight: 800, fontSize: 16, color: roundInfo.packOddsType === 'legend' ? GOLD : 'white',
            letterSpacing: 0.5, whiteSpace: 'nowrap',
          }}>
            {roundLabel(round)}
          </span>
          <span style={{ color: '#2a3050', fontSize: 13 }}>
            Pick {pickNum} of {totalPicks}
          </span>
          {currentMember && (
            <span style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: '#4a5880', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              — {currentMember.team_name}
            </span>
          )}
        </div>

        {/* Timer */}
        <div style={{
          fontFamily: F, fontWeight: 800, fontSize: 26, letterSpacing: 1,
          color: timerRed ? '#FF4B33' : 'white',
          animation: timerRed ? 'timerPulse 0.8s ease-in-out infinite' : 'none',
          minWidth: 64, textAlign: 'center', flexShrink: 0,
        }}>
          {timerStr}
        </div>

        {/* Auto-draft toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {autoDraftOn && (
            <button
              onClick={() => setAutoDraftOn(false)}
              style={{
                fontFamily: F, fontWeight: 700, fontSize: 11, letterSpacing: 2,
                color: '#FF4B33', border: '1px solid #FF4B3355', borderRadius: 6,
                padding: '5px 12px', backgroundColor: '#FF4B3311', cursor: 'pointer',
              }}
            >
              AUTO DRAFT ON · Turn Off
            </button>
          )}
        </div>
      </header>

      {/* ── Three-column body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT: Draft board */}
        <div style={{
          width: 280, flexShrink: 0, borderRight: '1px solid #111928',
          display: 'flex', flexDirection: 'column', backgroundColor: '#06090e',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #111928', flexShrink: 0 }}>
            <span style={{ fontFamily: F, fontWeight: 700, fontSize: 11, letterSpacing: 3, color: '#2a3050', textTransform: 'uppercase' }}>
              Draft Board
            </span>
          </div>
          <DraftBoardPanel draft={draft} members={members} draftPicks={draftPicks} currentPickNum={pickNum} />
        </div>

        {/* CENTER: Pack or waiting */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px 20px', overflow: 'auto',
          position: 'relative',
        }}>
          {/* Hero pre-reveal glow */}
          {tier5Reveal === 'hero' && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              animation: 'heroGlowPulse 0.8s ease-in-out infinite',
            }} />
          )}
          {tier5Reveal === 'gold' && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              animation: 'goldBurstAnim 0.7s ease-in-out infinite',
            }} />
          )}

          {isMyTurn ? (
            /* ── MY TURN: pack opening ── */
            <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
              {/* Round description */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: F, fontWeight: 800, fontSize: 26, color: roundInfo.packOddsType === 'legend' ? GOLD : 'white', letterSpacing: 2, textTransform: 'uppercase' }}>
                  {roundInfo.packOddsType === 'captain' ? 'Select Your Captain' : roundInfo.packOddsType === 'legend' ? '⚜️ Legend Round — Choose Wisely' : 'Make Your Pick'}
                </p>
                {roundInfo.positions && (
                  <p style={{ color: '#3a4060', fontSize: 14, marginTop: 4, fontFamily: F }}>
                    {roundInfo.positions.join(' / ')} only
                  </p>
                )}
              </div>

              {/* Cards row */}
              {packLoading ? (
                <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  {[0,1,2,3,4].map(i => (
                    <div key={i} style={{ width: 118, height: 170, borderRadius: 14, backgroundColor: '#0a0e1a', border: '2px solid #141e30', animation: `timerPulse ${0.8 + i * 0.12}s ease-in-out infinite` }} />
                  ))}
                </div>
              ) : packError ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <p style={{ color: '#FF4B33', fontFamily: F, fontSize: 15, marginBottom: 16 }}>{packError}</p>
                  <button onClick={doLoadPack} style={{ fontFamily: F, fontWeight: 700, fontSize: 14, padding: '10px 24px', borderRadius: 10, backgroundColor: '#141e30', color: GOLD, border: `1px solid ${GOLD}44`, cursor: 'pointer' }}>
                    Retry
                  </button>
                </div>
              ) : pack ? (
                /* Container shakes for 300ms then cards stagger in */
                <div style={{
                  display: 'flex', gap: 14, alignItems: 'flex-end',
                  flexWrap: 'wrap', justifyContent: 'center',
                  padding: '16px 8px',
                  animation: !packReady ? 'packShake 0.3s ease-in-out both' : 'none',
                }}>
                  {pack.players.map((player, i) => (
                    <PackCard
                      key={player?.id || i}
                      player={player}
                      index={i}
                      flipped={cardFlips[i]}
                      selected={selectedCard === i}
                      dim={
                        (selectedCard !== null && selectedCard !== i) ||
                        (selectedCard === null && hoveredCard !== null && hoveredCard !== i)
                      }
                      onSelect={() => setSelectedCard(prev => prev === i ? null : i)}
                      onHover={() => setHoveredCard(i)}
                      onHoverEnd={() => setHoveredCard(null)}
                      disabled={confirming || !allFlipped}
                      packReady={packReady}
                      preReveal={i === 4 ? tier5Reveal : null}
                    />
                  ))}
                </div>
              ) : null}

              {/* Confirm pick button */}
              {selectedCard !== null && allFlipped && !confirming && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#3a4060', fontSize: 13, fontFamily: F, marginBottom: 12 }}>
                    {pack?.players[selectedCard]?.name} · {pack?.players[selectedCard]?.position} · OVR {pack?.players[selectedCard]?.overall_rating}
                  </p>
                  <button
                    onClick={() => doSubmitPick(selectedCard)}
                    style={{
                      fontFamily: F, fontWeight: 800, fontSize: 18, letterSpacing: 2,
                      padding: '14px 48px', borderRadius: 12,
                      backgroundColor: GOLD, color: BG, border: 'none', cursor: 'pointer',
                      boxShadow: `0 4px 24px ${GOLD}55`, textTransform: 'uppercase',
                    }}
                  >
                    Draft This Player
                  </button>
                </div>
              )}

              {confirming && (
                <p style={{ fontFamily: F, fontSize: 16, color: GOLD, letterSpacing: 2 }}>Locking in pick…</p>
              )}
            </div>

          ) : (
            /* ── NOT MY TURN: waiting state ── */
            <div style={{ textAlign: 'center', maxWidth: 480 }}>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 32, color: '#2a3868', letterSpacing: 2, marginBottom: 8 }}>
                On the Clock
              </p>
              <p style={{ fontFamily: F, fontWeight: 700, fontSize: 22, color: 'white', marginBottom: 28 }}>
                {currentMember?.team_name || '—'}
              </p>

              {/* Last pick recap */}
              {lastPick?.players && (
                <div style={{
                  backgroundColor: '#0c1525', border: '1px solid #1a2540',
                  borderRadius: 14, padding: '16px 20px', marginBottom: 24, textAlign: 'left',
                }}>
                  <p style={{ fontFamily: F, fontSize: 11, letterSpacing: 2, color: '#2a3050', textTransform: 'uppercase', marginBottom: 10 }}>Last Pick</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: TIER_STYLE[lastPick.players.tier]?.border || '#444',
                    }} />
                    <div>
                      <p style={{ fontFamily: F, fontWeight: 700, fontSize: 18, color: 'white' }}>{lastPick.players.name}</p>
                      <p style={{ fontSize: 12, color: '#3a4060' }}>
                        {lastPick.players.position} · OVR {lastPick.players.overall_rating} ·{' '}
                        <span style={{ color: TIER_STYLE[lastPick.players.tier]?.border }}>{lastPick.players.tier}</span>
                        {lastPick.is_auto_draft && <span style={{ color: '#3a4060' }}> · AUTO</span>}
                      </p>
                    </div>
                    <span style={{ marginLeft: 'auto', fontFamily: F, fontSize: 12, color: '#2a3050' }}>
                      #{lastPick.pick_number}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#2a3050', marginTop: 8 }}>
                    — {memberMap[lastPick.team_user_id]?.team_name}
                  </p>
                </div>
              )}

              <p style={{ color: '#1e2840', fontSize: 14 }}>{draftPicks.length} / {totalPicks} picks complete</p>
            </div>
          )}
        </div>

        {/* RIGHT: Chat */}
        <div style={{
          width: 280, flexShrink: 0, borderLeft: '1px solid #111928',
          display: 'flex', flexDirection: 'column', padding: '0 0 0 0',
        }}>
          <ChatPanel messages={chatMessages} onSend={onSendChat} />
        </div>
      </div>
    </div>
  )
}

// ─── Grade helpers (pure JS) ──────────────────────────────────────────────────

const TIER_SCORE = { legend: 10, hero: 8, gold: 6, silver: 4, bronze: 2 }

function calcTeamScore(teamPicks, allPicks) {
  if (!teamPicks.length) return 0

  // ── Tier quality (50pts max) ──────────────────────────────────────────────
  const myAvg = teamPicks.reduce((s, p) => s + (TIER_SCORE[p.players?.tier] || 0), 0) / teamPicks.length

  // League-wide per-team averages → overall league average
  const byTeam = {}
  for (const pick of allPicks) {
    const uid = pick.team_user_id
    if (!byTeam[uid]) byTeam[uid] = { sum: 0, n: 0 }
    byTeam[uid].sum += TIER_SCORE[pick.players?.tier] || 0
    byTeam[uid].n++
  }
  const teamAvgs  = Object.values(byTeam).map(t => t.n ? t.sum / t.n : 0)
  const leagueAvg = teamAvgs.length
    ? teamAvgs.reduce((a, b) => a + b, 0) / teamAvgs.length
    : myAvg

  let tierPts
  if (myAvg >= leagueAvg) {
    // 35–50: how far above league avg toward the max (10)
    const headroom = Math.max(0.01, 10 - leagueAvg)
    tierPts = 35 + Math.min(15, ((myAvg - leagueAvg) / headroom) * 15)
  } else {
    // 0–35: how far above the floor (2 = all bronze)
    const headroom = Math.max(0.01, leagueAvg - 2)
    tierPts = Math.max(0, ((myAvg - 2) / headroom) * 35)
  }

  // ── Positional balance (30pts max) ───────────────────────────────────────
  // Ideal starter slots filled in first 9 draft rounds
  const IDEAL = { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1, K: 1 }
  const starterPicks = teamPicks.filter(p => (p.round || 1) <= 9)
  const posCounts = {}
  for (const pick of starterPicks) {
    const pos = pick.players?.position
    if (pos) posCounts[pos] = (posCounts[pos] || 0) + 1
  }
  let posPts = 30
  for (const [pos, needed] of Object.entries(IDEAL)) {
    posPts -= Math.max(0, needed - (posCounts[pos] || 0)) * 3
  }
  posPts = Math.max(0, posPts)

  // ── Bench depth (20pts max) ───────────────────────────────────────────────
  // Round 10+: reward Gold-or-better picks on the bench
  const benchPicks = teamPicks.filter(p => (p.round || 1) >= 10)
  let depthPts = 0
  if (benchPicks.length) {
    const benchAvg = benchPicks.reduce((s, p) => s + (TIER_SCORE[p.players?.tier] || 0), 0) / benchPicks.length
    // Gold (6) → full marks; linear scale from bronze floor (2) → gold ceiling (6)
    depthPts = Math.min(20, Math.max(0, ((benchAvg - 2) / 4) * 20))
  }

  return Math.round(Math.min(100, tierPts + posPts + depthPts))
}

function scoreToGrade(score) {
  if (score >= 93) return 'A+'
  if (score >= 90) return 'A'
  if (score >= 87) return 'A-'
  if (score >= 83) return 'B+'
  if (score >= 80) return 'B'
  if (score >= 77) return 'B-'
  if (score >= 73) return 'C+'
  if (score >= 70) return 'C'
  if (score >= 67) return 'C-'
  return 'D'
}

function gradeColor(grade) {
  if (grade.startsWith('A')) return '#00C853'
  if (grade.startsWith('B')) return '#F0B429'
  if (grade.startsWith('C')) return '#FF9800'
  return '#FF3D00'
}

// ─── Mini card used in PostDraftView (best / worst pick display) ───────────────
function GradeMiniCard({ label, icon, pick }) {
  const ts = pick?.players ? (TIER_STYLE[pick.players.tier] || TIER_STYLE.bronze) : TIER_STYLE.bronze
  return (
    <div style={{
      width: 190, borderRadius: 16,
      backgroundColor: '#0b1020',
      border: `2px solid ${pick ? ts.border : '#1a2440'}`,
      boxShadow: pick ? `0 4px 28px ${ts.glow}` : 'none',
      padding: '18px 14px', textAlign: 'center',
    }}>
      <p style={{
        fontFamily: F, fontWeight: 700, fontSize: 10, letterSpacing: 3,
        color: '#2a3050', textTransform: 'uppercase', marginBottom: 10,
      }}>
        {icon} {label}
      </p>
      {pick?.players ? (
        <>
          <div style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 4,
            backgroundColor: `${ts.border}22`, border: `1px solid ${ts.border}66`,
            fontFamily: F, fontWeight: 800, fontSize: 10, letterSpacing: 2,
            color: ts.border, textTransform: 'uppercase', marginBottom: 10,
          }}>
            {pick.players.tier}
          </div>
          <div style={{
            fontFamily: F, fontWeight: 800, fontSize: 50, color: ts.border,
            lineHeight: 1, textShadow: `0 0 22px ${ts.glow}`, marginBottom: 6,
          }}>
            {pick.players.overall_rating}
          </div>
          <div style={{
            fontFamily: F, fontWeight: 700, fontSize: 13, color: 'white',
            lineHeight: 1.3, marginBottom: 6,
          }}>
            {pick.players.name}
          </div>
          <div style={{
            fontFamily: F, fontWeight: 800, fontSize: 12,
            color: POS_COLOR[pick.players.position] || '#888', letterSpacing: 1,
          }}>
            {pick.players.position}
          </div>
        </>
      ) : (
        <p style={{ color: '#2a3050', fontFamily: F }}>—</p>
      )}
    </div>
  )
}

// ─── PostDraftView (State 4 — full) ───────────────────────────────────────────
function PostDraftView({ draft, members, user }) {
  const router = useRouter()

  const [allPicks,      setAllPicks]      = useState([])
  const [picksReady,    setPicksReady]    = useState(false)
  const [contentIn,     setContentIn]     = useState(false)  // grade slams in
  const [showContinue,  setShowContinue]  = useState(false)  // 3s later
  const [showLeague,    setShowLeague]    = useState(false)
  const [expandedTeam,  setExpandedTeam]  = useState(null)

  // Load all picks with player data
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('draft_picks')
      .select('id, pick_number, round, team_user_id, is_auto_draft, players(id, name, position, tier, overall_rating)')
      .eq('draft_id', draft.id)
      .order('pick_number')
      .then(({ data }) => {
        setAllPicks(data || [])
        setPicksReady(true)
        setTimeout(() => setContentIn(true), 150)   // small delay → grade slams in cleanly
      })
  }, [draft.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Continue button appears 3 s after content
  useEffect(() => {
    if (!contentIn) return
    const t = setTimeout(() => setShowContinue(true), 3000)
    return () => clearTimeout(t)
  }, [contentIn])

  // ── Derived grade data ────────────────────────────────────────────────────────
  const myPicks = allPicks.filter(p => p.team_user_id === user?.id)
  const myScore = picksReady ? calcTeamScore(myPicks, allPicks) : 0
  const myGrade = scoreToGrade(myScore)
  const myColor = gradeColor(myGrade)

  const bestPick = myPicks.length
    ? myPicks.reduce((b, p) => (p.players?.overall_rating || 0) > (b?.players?.overall_rating || 0) ? p : b, myPicks[0])
    : null
  const worstPick = myPicks.length
    ? myPicks.reduce((w, p) => (p.players?.overall_rating || 999) < (w?.players?.overall_rating || 999) ? p : w, myPicks[0])
    : null

  const teamGrades = picksReady
    ? (draft.draft_order || []).map(uid => {
        const picks  = allPicks.filter(p => p.team_user_id === uid)
        const score  = calcTeamScore(picks, allPicks)
        const grade  = scoreToGrade(score)
        const member = members.find(m => m.user_id === uid)
        const best   = picks.length ? picks.reduce((b, p) => (p.players?.overall_rating || 0) > (b?.players?.overall_rating || 0) ? p : b, picks[0]) : null
        const worst  = picks.length ? picks.reduce((w, p) => (p.players?.overall_rating || 999) < (w?.players?.overall_rating || 999) ? p : w, picks[0]) : null
        return { uid, score, grade, color: gradeColor(grade), member, best, worst }
      }).sort((a, b) => b.score - a.score)
    : []

  const myMember = members.find(m => m.user_id === user?.id)

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (!picksReady) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: F, fontSize: 18, color: '#2a3050', letterSpacing: 3 }}>Calculating grades…</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflow: 'auto', padding: '52px 24px 96px',
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gradeSlam {
          from { transform: scale(2.4) translateY(-24px); opacity: 0; }
          to   { transform: scale(1)   translateY(0);      opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes rowSlideIn {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0);     }
        }
      `}} />

      {/* ── Team label ── */}
      <p style={{
        fontFamily: F, fontWeight: 700, fontSize: 12, letterSpacing: 4,
        color: '#2a3050', textTransform: 'uppercase', marginBottom: 20,
        opacity: contentIn ? 1 : 0, transition: 'opacity 0.5s ease 0.1s',
      }}>
        {myMember?.team_name !== '—' ? myMember?.team_name : myMember?.display_name || 'Your Team'} · Draft Grade
      </p>

      {/* ── Grade letter (slams in) ── */}
      <div
        key={contentIn ? 'visible' : 'hidden'}
        style={{
          fontFamily: F, fontWeight: 800,
          fontSize: 'clamp(110px, 20vw, 196px)',
          color: myColor, lineHeight: 1,
          textShadow: `0 0 90px ${myColor}55`,
          userSelect: 'none',
          marginBottom: 8,
          opacity: contentIn ? 1 : 0,
          animation: contentIn ? 'gradeSlam 0.34s cubic-bezier(0.2,0.8,0.4,1) forwards' : 'none',
        }}
      >
        {myGrade}
      </div>

      {/* ── Score ── */}
      <p style={{
        fontFamily: F, fontWeight: 700, fontSize: 17, color: '#4a5880',
        letterSpacing: 2, marginBottom: 48,
        opacity: contentIn ? 1 : 0,
        animation: contentIn ? 'fadeUp 0.5s ease 0.5s both' : 'none',
      }}>
        {myScore} / 100
      </p>

      {/* ── Best & Worst picks ── */}
      <div style={{
        display: 'flex', gap: 20, marginBottom: 48,
        flexWrap: 'wrap', justifyContent: 'center',
        opacity: contentIn ? 1 : 0,
        animation: contentIn ? 'fadeUp 0.5s ease 0.7s both' : 'none',
      }}>
        <GradeMiniCard label="Best Pick"  icon="⭐" pick={bestPick}  />
        <GradeMiniCard label="Worst Pick" icon="💀" pick={worstPick} />
      </div>

      {/* ── Continue button ── */}
      {!showLeague && showContinue && (
        <button
          onClick={() => setShowLeague(true)}
          style={{
            fontFamily: F, fontWeight: 800, fontSize: 16, letterSpacing: 2,
            padding: '14px 48px', borderRadius: 12,
            backgroundColor: GOLD, color: BG, border: 'none',
            cursor: 'pointer', textTransform: 'uppercase',
            boxShadow: `0 4px 28px ${GOLD}55`,
            animation: 'fadeUp 0.38s ease both',
            marginBottom: 16,
          }}
        >
          See League Grades →
        </button>
      )}

      {/* ── League grade board ── */}
      {showLeague && (
        <div style={{
          width: '100%', maxWidth: 580,
          animation: 'fadeIn 0.4s ease both',
        }}>
          <p style={{
            fontFamily: F, fontWeight: 700, fontSize: 12, letterSpacing: 4,
            color: '#2a3050', textTransform: 'uppercase',
            textAlign: 'center', marginBottom: 24,
          }}>
            League Results
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 40 }}>
            {teamGrades.map((team, idx) => {
              const isMe      = team.uid === user?.id
              const isOpen    = expandedTeam === team.uid
              const rank      = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`

              return (
                <div
                  key={team.uid}
                  onClick={() => setExpandedTeam(isOpen ? null : team.uid)}
                  style={{
                    borderRadius: 14,
                    backgroundColor: isMe ? '#0d1a2e' : '#090d18',
                    border: `1px solid ${isMe ? GOLD + '44' : '#181f33'}`,
                    padding: '14px 20px',
                    cursor: 'pointer',
                    animation: `rowSlideIn 0.32s ease ${idx * 0.07}s both`,
                    boxShadow: isMe ? `0 0 0 1px ${GOLD}1a, 0 4px 20px #00000066` : 'none',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {/* Row summary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: '#2a3050', minWidth: 30, textAlign: 'center' }}>
                      {rank}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontFamily: F, fontWeight: 700, fontSize: 15,
                        color: isMe ? GOLD : 'white',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {team.member?.team_name !== '—' ? team.member?.team_name : (team.member?.display_name || 'Unknown Team')}
                        {isMe && <span style={{ color: '#4a5880', fontSize: 11, marginLeft: 8, fontWeight: 600 }}>YOU</span>}
                      </p>
                    </div>
                    <span style={{
                      fontFamily: F, fontWeight: 800, fontSize: 22,
                      color: team.color, textShadow: `0 0 14px ${team.color}55`,
                      minWidth: 44, textAlign: 'right',
                    }}>
                      {team.grade}
                    </span>
                    <span style={{ color: '#2a3050', fontSize: 11, marginLeft: 2 }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Expanded picks + score breakdown */}
                  {isOpen && (
                    <div style={{
                      marginTop: 16, paddingTop: 16,
                      borderTop: '1px solid #161c2e',
                      animation: 'fadeUp 0.22s ease both',
                    }}>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                        {[{ label: 'Best Pick', icon: '⭐', pick: team.best }, { label: 'Worst Pick', icon: '💀', pick: team.worst }].map(({ label, icon, pick }) => {
                          const ts = pick?.players ? (TIER_STYLE[pick.players.tier] || TIER_STYLE.bronze) : TIER_STYLE.bronze
                          return (
                            <div key={label} style={{ flex: 1, minWidth: 140 }}>
                              <p style={{ fontFamily: F, fontSize: 10, letterSpacing: 2, color: '#2a3050', textTransform: 'uppercase', marginBottom: 6 }}>
                                {icon} {label}
                              </p>
                              {pick?.players ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: ts.border, flexShrink: 0 }} />
                                  <div>
                                    <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: 'white' }}>{pick.players.name}</p>
                                    <p style={{ fontSize: 11, color: '#3a4060' }}>
                                      {pick.players.position} · OVR {pick.players.overall_rating} ·{' '}
                                      <span style={{ color: ts.border }}>{pick.players.tier}</span>
                                    </p>
                                  </div>
                                </div>
                              ) : <span style={{ color: '#2a3050', fontFamily: F, fontSize: 13 }}>—</span>}
                            </div>
                          )
                        })}
                      </div>
                      <p style={{ fontFamily: F, fontSize: 10, letterSpacing: 2, color: '#2a3050', textTransform: 'uppercase' }}>
                        Score: {team.score} / 100
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Go to League ── */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => router.push(`/leagues/${draft.league_id}`)}
              style={{
                fontFamily: F, fontWeight: 800, fontSize: 16, letterSpacing: 2,
                padding: '14px 48px', borderRadius: 12,
                backgroundColor: GOLD, color: BG, border: 'none',
                cursor: 'pointer', textTransform: 'uppercase',
                boxShadow: `0 4px 28px ${GOLD}55`,
              }}
            >
              Go to My League
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DraftPage — root component ────────────────────────────────────────────────
export default function DraftPage() {
  const { id: leagueId } = useParams()
  const router = useRouter()

  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [user, setUser]                 = useState(null)
  const [league, setLeague]             = useState(null)
  const [members, setMembers]           = useState([])
  const [draft, setDraft]               = useState(null)
  const [isCommissioner, setIsComm]     = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [onlineUsers, setOnlineUsers]   = useState(new Set())
  const [presenceColors, setPresColors] = useState({})

  const supaRef      = useRef(null)
  const chatChanRef  = useRef(null)
  const myColorRef   = useRef(null)
  const myNameRef    = useRef(null)
  const userIdRef    = useRef(null)

  // ── Bootstrap: auth → data → realtime ──────────────────────────────────────
  useEffect(() => {
    const subs = []   // cleanup fns
    let alive = true

    async function init() {
      const supabase = createClient()
      supaRef.current = supabase

      // Auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (!alive) return
      setUser(user)
      userIdRef.current = user.id

      // League
      const { data: leagueData, error: lErr } = await supabase
        .from('leagues').select('*').eq('id', leagueId).single()
      if (!alive) return
      if (lErr || !leagueData) { setError('League not found.'); setLoading(false); return }
      setLeague(leagueData)

      // Members + profiles
      const { data: memberRows } = await supabase
        .from('league_members')
        .select('user_id, is_commissioner, joined_at')
        .eq('league_id', leagueId)
        .order('joined_at')
      if (!alive) return

      const uids = (memberRows || []).map(m => m.user_id)
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, team_name, helmet_color, helmet_secondary, helmet_pattern')
        .in('id', uids)
      if (!alive) return

      const pMap = Object.fromEntries((profileRows || []).map(p => [p.id, p]))
      const merged = (memberRows || []).map(m => ({
        user_id: m.user_id,
        is_commissioner: m.is_commissioner,
        display_name: pMap[m.user_id]?.display_name || 'Unknown',
        // Fall back to display_name when team_name hasn't been set yet
        team_name:        pMap[m.user_id]?.team_name        || pMap[m.user_id]?.display_name || '—',
        helmet_color:     pMap[m.user_id]?.helmet_color     || '#1B2A4A',
        helmet_secondary: pMap[m.user_id]?.helmet_secondary || '#F0B429',
        helmet_pattern:   pMap[m.user_id]?.helmet_pattern   || 'solid',
      }))

      const isComm = !!merged.find(m => m.user_id === user.id)?.is_commissioner
      if (!alive) return
      setMembers(merged)
      setIsComm(isComm)

      // Display name for chat attribution
      myNameRef.current = merged.find(m => m.user_id === user.id)?.display_name || 'You'

      // Draft row — load existing, or commissioner auto-creates
      let { data: draftRow, error: dErr } = await supabase
        .from('drafts').select('*')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!alive) return

      if (!draftRow) {
        if (isComm) {
          const { data: newRow, error: cErr } = await supabase
            .from('drafts')
            .insert([{ league_id: leagueId, status: 'pending', draft_order: [], total_rounds: 10 }])
            .select().single()
          if (cErr || !newRow) {
            setError('Could not create draft session: ' + (cErr?.message || 'unknown error'))
            setLoading(false)
            return
          }
          if (!alive) return
          draftRow = newRow
        } else {
          setError("The commissioner hasn't started the draft yet. Check back soon!")
          setLoading(false)
          return
        }
      }

      setDraft(draftRow)

      // ── Realtime: postgres_changes on drafts ──────────────────────────────
      const draftSub = supabase
        .channel(`dr:draft-status:${draftRow.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'drafts',
          filter: `id=eq.${draftRow.id}`,
        }, ({ new: updated }) => {
          if (alive) setDraft(updated)
        })
        .subscribe()
      subs.push(() => supabase.removeChannel(draftSub))

      // ── Realtime: presence + broadcast chat ───────────────────────────────
      const initColor = hashColor(user.id)
      myColorRef.current = initColor

      const chatChan = supabase.channel(`dr:lobby:${draftRow.id}`, {
        config: { presence: { key: user.id } },
      })
      chatChanRef.current = chatChan

      const syncPresence = () => {
        const state = chatChan.presenceState()
        const online = new Set(Object.keys(state))
        const colors = {}
        for (const [uid, arr] of Object.entries(state)) {
          const c = arr[0]?.helmet_color
          if (c) colors[uid] = c
        }
        if (alive) {
          setOnlineUsers(online)
          setPresColors(colors)
        }
      }

      chatChan
        .on('presence', { event: 'sync' },  syncPresence)
        .on('presence', { event: 'join' },  syncPresence)
        .on('presence', { event: 'leave' }, syncPresence)
        .on('broadcast', { event: 'chat' }, ({ payload }) => {
          if (alive) setChatMessages(prev => [...prev.slice(-99), payload])
        })
        .subscribe(async status => {
          if (status === 'SUBSCRIBED') {
            await chatChan.track({ user_id: user.id, helmet_color: myColorRef.current })
          }
        })
      subs.push(() => supabase.removeChannel(chatChan))

      if (alive) setLoading(false)
    }

    init()
    return () => {
      alive = false
      subs.forEach(fn => fn())
    }
  }, [leagueId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action: send chat ───────────────────────────────────────────────────────
  const handleSendChat = useCallback(text => {
    chatChanRef.current?.send({
      type: 'broadcast', event: 'chat',
      payload: { displayName: myNameRef.current || 'You', text },
    })
  }, [])

  // ── Action: change helmet color ────────────────────────────────────────────
  const handleHelmetColorChange = useCallback(async color => {
    const uid = userIdRef.current
    if (!uid) return
    myColorRef.current = color
    // Optimistic: update local presence map immediately
    setPresColors(prev => ({ ...prev, [uid]: color }))
    // Re-broadcast updated presence to all connected clients
    await chatChanRef.current?.track({ user_id: uid, helmet_color: color })
  }, [])

  // ── Action: commissioner starts draft ──────────────────────────────────────
  const handleStartDraft = useCallback(async () => {
    if (!supaRef.current || !draft) return
    const { error } = await supaRef.current
      .from('drafts')
      .update({ status: 'helmet_race' })
      .eq('id', draft.id)
    if (error) console.error('[DraftPage] start error:', error.message)
    // Realtime subscription will flip local state
  }, [draft])

  // ── Action: race finished → set order + go active ─────────────────────────
  const handleRaceComplete = useCallback(async (orderedUserIds) => {
    if (!supaRef.current || !draft) return
    const firstDeadline = new Date(Date.now() + 62_000).toISOString()
    const { error } = await supaRef.current
      .from('drafts')
      .update({
        status: 'active',
        draft_order: orderedUserIds,
        current_pick_number: 1,
        current_team_user_id: orderedUserIds[0] ?? null,
        pick_deadline: firstDeadline,
      })
      .eq('id', draft.id)
    if (error) console.error('[DraftPage] race complete error:', error.message)
  }, [draft])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontFamily: F, fontSize: 20, color: '#2a3050', letterSpacing: 2 }}>
          Loading draft room…
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: BG,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
      }}>
        <p style={{ color: '#556', fontSize: 16, maxWidth: 380, textAlign: 'center' }}>{error}</p>
        <a href={`/leagues/${leagueId}`} style={{ color: GOLD, fontSize: 14, textDecoration: 'none' }}>
          ← Back to League
        </a>
      </div>
    )
  }

  if (!draft) return null

  const shared = {
    draft, members, user, isCommissioner,
    onlineUsers, presenceColors,
    chatMessages, onSendChat: handleSendChat,
  }

  switch (draft.status) {
    case 'pending':
      return (
        <LobbyView
          {...shared}
          onStartDraft={handleStartDraft}
          onHelmetColorChange={handleHelmetColorChange}
        />
      )
    case 'helmet_race':
      return (
        <HelmetRaceView
          {...shared}
          onRaceComplete={handleRaceComplete}
        />
      )
    case 'active':
      return <ActiveDraftView {...shared} />
    case 'complete':
      return <PostDraftView {...shared} />
    default:
      return (
        <LobbyView
          {...shared}
          onStartDraft={handleStartDraft}
          onHelmetColorChange={handleHelmetColorChange}
        />
      )
  }
}
