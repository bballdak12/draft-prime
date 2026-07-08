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
const TRADE_DEADLINE_WEEK = 11

// ─── Helpers ─────────────────────────────────────────────────────────────────
function recLabel(w, l) { return `${w ?? 0}–${l ?? 0}` }

function TierDot({ tier, size = 7 }) {
  const c = TIER_COLOR[tier] || '#2D3748'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: c, flexShrink: 0,
      boxShadow: c !== '#2D3748' ? `0 0 5px ${c}88` : 'none',
    }} />
  )
}

// ─── Step 1 — opponent row ────────────────────────────────────────────────────
function MemberRow({ member, selected, onClick }) {
  const svgW = Math.round(48 * (300 / 260))
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '10px 14px',
        background: selected ? `${GOLD}12` : '#0D1220',
        border: `1px solid ${selected ? GOLD : '#141E35'}`,
        borderRadius: 10, cursor: 'pointer',
        marginBottom: 6, textAlign: 'left',
      }}
    >
      <HelmetSVG
        base={member.helmet_color || '#1B2A4A'}
        secondary={member.helmet_secondary || GOLD}
        pattern={member.helmet_pattern || 'solid'}
        uid={`opp-${member.user_id}`}
        width={svgW} height={48}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#F9FAFB', letterSpacing: '0.01em' }}>
          {member.team_name || member.display_name}
        </div>
        <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>
          {member.display_name}
        </div>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 800, color: selected ? GOLD : '#6B7280',
        fontFamily: 'var(--font-barlow, sans-serif)',
        letterSpacing: '0.04em', flexShrink: 0,
      }}>
        {recLabel(member.wins, member.losses)}
      </div>
      {selected && (
        <div style={{ color: GOLD, fontSize: 16, flexShrink: 0 }}>✓</div>
      )}
    </button>
  )
}

// ─── Step 2 — compact player card ────────────────────────────────────────────
function PlayerCard({ player, selected, onToggle, side }) {
  const color = TIER_COLOR[player.tier] || '#2D3748'
  const selColor = side === 'give' ? '#EF4444' : '#34D399'
  const activeBorder = selected ? selColor : '#141E35'
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', padding: '8px 8px',
        background: selected ? `${selColor}18` : '#090D1A',
        border: `1px solid ${activeBorder}`,
        borderLeft: `3px solid ${selected ? selColor : `${color}55`}`,
        borderRadius: 7, cursor: 'pointer',
        marginBottom: 4, textAlign: 'left',
        outline: selected ? `1px solid ${selColor}55` : 'none',
        outlineOffset: 1,
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <TierDot tier={player.tier} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#E5E7EB',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {player.name}
        </div>
        <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.04em', marginTop: 1 }}>
          {player.position} · {(player.tier || 'bronze').toUpperCase()}
        </div>
      </div>
      {selected && (
        <span style={{ color: selColor, fontSize: 10, fontWeight: 800, flexShrink: 0 }}>✓</span>
      )}
    </button>
  )
}

// ─── Step 3 — trade summary card ─────────────────────────────────────────────
function SummarySection({ label, color, players }) {
  return (
    <div style={{
      background: '#0D1220', border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: '0.1em', marginBottom: 8 }}>
        {label}
      </div>
      {players.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <TierDot tier={p.tier} />
          <span style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 600 }}>{p.name}</span>
          <span style={{ fontSize: 10, color: '#374151', marginLeft: 2 }}>
            {p.position}
          </span>
        </div>
      ))}
      {players.length === 0 && (
        <div style={{ fontSize: 11, color: '#1F2937', fontStyle: 'italic' }}>None selected</div>
      )}
    </div>
  )
}

// ─── Loading spinner ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TradePage() {
  const { id: leagueId } = useParams()
  const router = useRouter()

  const [loading,       setLoading]       = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [sending,       setSending]       = useState(false)
  const [error,         setError]         = useState(null)
  const [step,          setStep]          = useState(1)   // 1 | 2 | 3

  // League + session
  const [league,       setLeague]       = useState(null)
  const [currentUser,  setCurrentUser]  = useState(null)
  const [season,       setSeason]       = useState(null)
  const [draft,        setDraft]        = useState(null)
  const [deadline,     setDeadline]     = useState(false)
  const [currentWeek,  setCurrentWeek]  = useState(0)

  // My record
  const [myRecord,     setMyRecord]     = useState({ wins: 0, losses: 0 })

  // Step 1
  const [members,      setMembers]      = useState([])

  // Step 2
  const [opponent,     setOpponent]     = useState(null)
  const [myRoster,     setMyRoster]     = useState([])
  const [theirRoster,  setTheirRoster]  = useState([])
  const [giveIds,      setGiveIds]      = useState(new Set())
  const [getIds,       setGetIds]       = useState(new Set())
  const [message,      setMessage]      = useState('')

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUser(user)

      // League
      const { data: lg } = await supabase
        .from('leagues').select('id, name').eq('id', leagueId).single()
      if (!lg) { setError('League not found'); setLoading(false); return }
      setLeague(lg)

      // Active season + week
      const { data: seas } = await supabase
        .from('app_seasons').select('id, current_week')
        .eq('status', 'active')
        .order('season_number', { ascending: false }).limit(1).maybeSingle()
      setSeason(seas)
      const week = seas?.current_week ?? 0
      setCurrentWeek(week)
      setDeadline(week > TRADE_DEADLINE_WEEK)

      // Most recent draft
      const { data: dr } = await supabase
        .from('drafts').select('id')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setDraft(dr)

      // All league members (other than me)
      const { data: memberRows } = await supabase
        .from('league_members').select('user_id, is_commissioner, joined_at')
        .eq('league_id', leagueId)

      if (!memberRows?.length) { setLoading(false); return }

      const uids = memberRows.map(m => m.user_id)

      // Profiles
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, team_name, helmet_color, helmet_secondary, helmet_pattern')
        .in('id', uids)

      // Standings (for records)
      let standingsMap = {}
      if (seas) {
        const { data: standings } = await supabase
          .from('league_standings')
          .select('user_id, wins, losses')
          .eq('league_id', leagueId)
          .eq('season_id', seas.id)
        standings?.forEach(s => { standingsMap[s.user_id] = s })
      }

      const profileMap = {}
      profileRows?.forEach(p => { profileMap[p.id] = p })

      // Build member list (exclude self)
      const enriched = memberRows
        .filter(m => m.user_id !== user.id)
        .map(m => ({
          user_id:         m.user_id,
          display_name:    profileMap[m.user_id]?.display_name || 'Unknown',
          team_name:       profileMap[m.user_id]?.team_name    || profileMap[m.user_id]?.display_name || 'Unknown',
          helmet_color:    profileMap[m.user_id]?.helmet_color    || '#1B2A4A',
          helmet_secondary:profileMap[m.user_id]?.helmet_secondary|| GOLD,
          helmet_pattern:  profileMap[m.user_id]?.helmet_pattern  || 'solid',
          wins:   standingsMap[m.user_id]?.wins   ?? 0,
          losses: standingsMap[m.user_id]?.losses ?? 0,
        }))

      setMembers(enriched)
      setMyRecord({
        wins:   standingsMap[user.id]?.wins   ?? 0,
        losses: standingsMap[user.id]?.losses ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [leagueId])

  // ── Load both rosters when opponent is selected ──────────────────────────────
  const selectOpponent = useCallback(async (opp) => {
    setOpponent(opp)
    setGiveIds(new Set())
    setGetIds(new Set())
    setStep(2)
    setRosterLoading(true)

    const supabase = createClient()
    if (!draft) { setRosterLoading(false); return }

    // Get all picks for the draft (league members can read all picks per RLS)
    const { data: picks } = await supabase
      .from('draft_picks')
      .select('player_id, team_user_id')
      .eq('draft_id', draft.id)
      .is('dropped_at', null)

    if (!picks?.length) { setRosterLoading(false); return }

    const myPickIds   = picks.filter(p => p.team_user_id === currentUser.id).map(p => p.player_id)
    const theirPickIds = picks.filter(p => p.team_user_id === opp.user_id).map(p => p.player_id)
    const allIds = [...new Set([...myPickIds, ...theirPickIds])]

    if (!allIds.length) { setRosterLoading(false); return }

    const { data: players } = await supabase
      .from('players')
      .select('id, name, position, tier, overall_rating')
      .in('id', allIds)

    const playerMap = {}
    players?.forEach(p => { playerMap[p.id] = p })

    // Sort: legend first, then by overall_rating desc, then position
    const sortPlayers = (ids) =>
      ids
        .map(id => playerMap[id])
        .filter(Boolean)
        .sort((a, b) => {
          const TIER_ORD = { legend: 5, hero: 4, gold: 3, silver: 2, bronze: 1 }
          const td = (TIER_ORD[b.tier] || 0) - (TIER_ORD[a.tier] || 0)
          if (td !== 0) return td
          return (b.overall_rating || 0) - (a.overall_rating || 0)
        })

    setMyRoster(sortPlayers(myPickIds))
    setTheirRoster(sortPlayers(theirPickIds))
    setRosterLoading(false)
  }, [draft, currentUser])

  // ── Toggle a player in the give/get sets ─────────────────────────────────────
  const toggleGive = (id) => setGiveIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleGet = (id) => setGetIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // ── Send trade ───────────────────────────────────────────────────────────────
  const sendTrade = async () => {
    if (sending || !season || !opponent) return
    setSending(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/trades/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          leagueId,
          seasonId:        season.id,
          receiverUserId:  opponent.user_id,
          proposerPlayers: Array.from(giveIds),
          receiverPlayers: Array.from(getIds),
          message:         message.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to send trade'); return }
      // Go to trades inbox
      router.push(`/leagues/${leagueId}/trades`)
    } finally {
      setSending(false)
    }
  }

  // ─── Derived ────────────────────────────────────────────────────────────────
  const givePlayers = myRoster.filter(p => giveIds.has(p.id))
  const getPlayers  = theirRoster.filter(p => getIds.has(p.id))
  const canSend     = giveIds.size > 0 && getIds.size > 0 && !deadline && season

  // ─── Render helpers ─────────────────────────────────────────────────────────
  const StickyHeader = ({ title, onBack }) => (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      backgroundColor: '#060912EE', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid #0D1220',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#4B5563', fontSize: 13, padding: 0,
      }}>
        ← Back
      </button>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
        color: '#4B5563', textTransform: 'uppercase',
      }}>
        {title}
      </span>
      <div style={{ width: 48 }} />
    </div>
  )

  // ─── Loading / error ────────────────────────────────────────────────────────
  if (loading) return <Spinner />

  if (error) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: '#F87171', fontFamily: 'sans-serif', padding: '0 24px', textAlign: 'center' }}>{error}</p>
      <button onClick={() => router.push(`/leagues/${leagueId}`)} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
        ← Back to league
      </button>
    </main>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1 — Pick opponent
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 1) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', color: '#F9FAFB', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60 }}>

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
            Propose Trade
          </span>
          <div style={{ width: 80 }} />
        </div>

        {/* Trade deadline banner */}
        {deadline && (
          <div style={{
            margin: '12px 16px 0',
            background: '#7F1D1D22', border: '1px solid #DC262655',
            borderRadius: 10, padding: '10px 14px',
            color: '#FCA5A5', fontSize: 13, textAlign: 'center',
          }}>
            🚫 Trade deadline passed (Week {TRADE_DEADLINE_WEEK})
          </div>
        )}

        {!season && (
          <div style={{
            margin: '12px 16px 0',
            background: '#1F2937', borderRadius: 10, padding: '10px 14px',
            color: '#6B7280', fontSize: 13, textAlign: 'center',
          }}>
            No active season — trades unavailable
          </div>
        )}

        <div style={{ padding: '20px 16px 0' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#374151', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>
            Select Opponent
          </p>

          {members.length === 0 ? (
            <p style={{ color: '#374151', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
              No other members in this league yet.
            </p>
          ) : (
            members.map(m => (
              <MemberRow
                key={m.user_id}
                member={m}
                selected={opponent?.user_id === m.user_id}
                onClick={() => selectOpponent(m)}
              />
            ))
          )}
        </div>
      </div>
    </main>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2 — Build offer
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 2) {
    const svgW = Math.round(40 * (300 / 260))
    return (
      <main style={{ backgroundColor: BG, minHeight: '100vh', color: '#F9FAFB', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 540, margin: '0 auto', paddingBottom: 100 }}>

          <StickyHeader
            title="Build Offer"
            onBack={() => { setStep(1); setOpponent(null) }}
          />

          {/* Opponent strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderBottom: '1px solid #0D1220',
            background: '#080C18',
          }}>
            <span style={{ fontSize: 10, color: '#374151', letterSpacing: '0.08em' }}>TRADING WITH</span>
            <HelmetSVG
              base={opponent.helmet_color} secondary={opponent.helmet_secondary}
              pattern={opponent.helmet_pattern} uid="opp-strip"
              width={svgW} height={40}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F9FAFB' }}>
                {opponent.team_name || opponent.display_name}
              </div>
              <div style={{ fontSize: 10, color: '#4B5563' }}>
                {recLabel(opponent.wins, opponent.losses)}
              </div>
            </div>
          </div>

          {/* Selection summary pills */}
          {(giveIds.size > 0 || getIds.size > 0) && (
            <div style={{
              display: 'flex', gap: 8, padding: '8px 16px',
              background: '#060912', borderBottom: '1px solid #0D1220',
              flexWrap: 'wrap',
            }}>
              {giveIds.size > 0 && (
                <span style={{ fontSize: 11, color: '#F87171', background: '#EF444418', border: '1px solid #EF444433', borderRadius: 20, padding: '2px 10px' }}>
                  −{giveIds.size} giving
                </span>
              )}
              {getIds.size > 0 && (
                <span style={{ fontSize: 11, color: '#34D399', background: '#34D39918', border: '1px solid #34D39933', borderRadius: 20, padding: '2px 10px' }}>
                  +{getIds.size} getting
                </span>
              )}
            </div>
          )}

          {rosterLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* Two-column roster grid */}
              <div style={{ display: 'flex', gap: 0, padding: '0' }}>

                {/* YOU GIVE */}
                <div style={{ flex: 1, borderRight: '1px solid #0D1220', padding: '12px 10px 12px 16px' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                    color: '#EF4444', marginBottom: 8, textTransform: 'uppercase',
                  }}>
                    You Give ({giveIds.size})
                  </div>
                  {myRoster.length === 0 ? (
                    <p style={{ fontSize: 11, color: '#1F2937', fontStyle: 'italic' }}>No players</p>
                  ) : (
                    myRoster.map(p => (
                      <PlayerCard
                        key={p.id} player={p} side="give"
                        selected={giveIds.has(p.id)}
                        onToggle={() => toggleGive(p.id)}
                      />
                    ))
                  )}
                </div>

                {/* YOU GET */}
                <div style={{ flex: 1, padding: '12px 16px 12px 10px' }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                    color: '#34D399', marginBottom: 8, textTransform: 'uppercase',
                  }}>
                    You Get ({getIds.size})
                  </div>
                  {theirRoster.length === 0 ? (
                    <p style={{ fontSize: 11, color: '#1F2937', fontStyle: 'italic' }}>No players</p>
                  ) : (
                    theirRoster.map(p => (
                      <PlayerCard
                        key={p.id} player={p} side="get"
                        selected={getIds.has(p.id)}
                        onToggle={() => toggleGet(p.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Message */}
              <div style={{ padding: '0 16px 16px' }}>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, 200))}
                  placeholder="Add a message... (optional)"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0D1220', border: '1px solid #1A2035',
                    color: '#D1D5DB', borderRadius: 8,
                    padding: '10px 12px', fontSize: 13, resize: 'none',
                    fontFamily: 'sans-serif', outline: 'none',
                  }}
                />
                <div style={{ fontSize: 10, color: '#374151', textAlign: 'right', marginTop: 2 }}>
                  {message.length}/200
                </div>
              </div>
            </>
          )}

          {/* Fixed bottom CTA */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            padding: '12px 16px 24px', backgroundColor: '#060912EE',
            borderTop: '1px solid #0D1220', backdropFilter: 'blur(8px)',
            maxWidth: 540, margin: '0 auto',
          }}>
            <button
              disabled={!canSend}
              onClick={() => setStep(3)}
              style={{
                width: '100%', padding: '14px', border: 'none', borderRadius: 12,
                fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
                cursor: canSend ? 'pointer' : 'not-allowed',
                backgroundColor: canSend ? GOLD : '#1A2035',
                color: canSend ? '#0A0E1A' : '#374151',
                transition: 'background-color 0.2s',
                fontFamily: 'var(--font-barlow, sans-serif)',
              }}
            >
              {deadline ? 'TRADE DEADLINE PASSED' : !canSend ? 'SELECT PLAYERS FROM BOTH SIDES' : 'REVIEW TRADE →'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3 — Confirm
  // ─────────────────────────────────────────────────────────────────────────────
  const svgW3 = Math.round(56 * (300 / 260))
  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', color: '#F9FAFB', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 100 }}>

        <StickyHeader title="Confirm Trade" onBack={() => setStep(2)} />

        <div style={{ padding: '20px 16px' }}>

          {/* Teams header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24,
          }}>
            {/* My team */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>Your Team</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, fontFamily: 'var(--font-barlow, sans-serif)', lineHeight: 1.1 }}>
                {recLabel(myRecord.wins, myRecord.losses)}
              </div>
            </div>

            <div style={{ fontSize: 20, color: '#1F2937', fontWeight: 900, padding: '0 8px' }}>⇄</div>

            {/* Opponent */}
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <HelmetSVG
                  base={opponent.helmet_color} secondary={opponent.helmet_secondary}
                  pattern={opponent.helmet_pattern} uid="opp-confirm"
                  width={svgW3} height={56}
                />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF' }}>
                {opponent.team_name || opponent.display_name}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#6B7280', fontFamily: 'var(--font-barlow, sans-serif)', lineHeight: 1.1 }}>
                {recLabel(opponent.wins, opponent.losses)}
              </div>
            </div>
          </div>

          {/* Trade details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <SummarySection label="YOU GIVE" color="#EF4444" players={givePlayers} />
            <div style={{ textAlign: 'center', fontSize: 18, color: '#1F2937' }}>↓</div>
            <SummarySection label="YOU GET"  color="#34D399" players={getPlayers} />
          </div>

          {/* Message preview */}
          {message.trim() && (
            <div style={{
              background: '#0D1220', border: '1px solid #141E35',
              borderRadius: 8, padding: '10px 12px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.1em', marginBottom: 4 }}>MESSAGE</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5 }}>{message}</div>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginBottom: 16 }}>
            Expires in 48 hours · {opponent.team_name || opponent.display_name} will be notified
          </div>

          <button
            disabled={sending}
            onClick={sendTrade}
            style={{
              width: '100%', padding: '15px', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 800, letterSpacing: '0.06em',
              cursor: sending ? 'not-allowed' : 'pointer',
              backgroundColor: sending ? '#1A2035' : GOLD,
              color: sending ? '#374151' : '#0A0E1A',
              fontFamily: 'var(--font-barlow, sans-serif)',
            }}
          >
            {sending ? 'Sending…' : 'CONFIRM & SEND TRADE'}
          </button>

          <button
            onClick={() => setStep(2)}
            style={{
              width: '100%', padding: '12px', marginTop: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4B5563', fontSize: 13,
            }}
          >
            ← Edit Offer
          </button>
        </div>
      </div>
    </main>
  )
}
