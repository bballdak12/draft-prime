'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#0A0E1A'
const GOLD   = '#F0B429'
const CARD   = '#0D1220'
const BORDER = '#1A2035'
const RED    = '#EF4444'
const F      = 'var(--font-barlow), "Barlow Condensed", sans-serif'

const MAX_ANNOUNCEMENT = 280

function fmtStamp(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ─── Small building blocks ────────────────────────────────────────────────────
function Card({ title, danger = false, children }) {
  return (
    <section style={{
      backgroundColor: CARD,
      border: `1px solid ${danger ? `${RED}66` : BORDER}`,
      borderRadius: 14, padding: '16px 16px 18px', marginBottom: 16,
    }}>
      <h2 style={{
        margin: '0 0 12px', fontSize: 12, fontWeight: 800,
        letterSpacing: '0.12em', fontFamily: F,
        color: danger ? RED : '#4B5563',
      }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function ActionButton({ label, onClick, disabled, busy, tone = 'gold', full = true }) {
  const colors = {
    gold:  { bg: GOLD, fg: BG },
    dark:  { bg: '#1A2035', fg: '#D1D5DB' },
    red:   { bg: RED, fg: '#fff' },
  }[tone]
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        width: full ? '100%' : 'auto', padding: full ? '12px 0' : '8px 14px',
        borderRadius: 10, border: 'none',
        backgroundColor: disabled ? '#141E35' : colors.bg,
        color: disabled ? '#374151' : colors.fg,
        fontWeight: 800, fontSize: 13, fontFamily: F, letterSpacing: '0.06em',
        cursor: disabled || busy ? 'default' : 'pointer',
      }}
    >
      {busy ? 'WORKING…' : label.toUpperCase()}
    </button>
  )
}

// Type-to-confirm modal: confirm button enables only when input === keyword
function ConfirmModal({ title, body, keyword, confirmLabel, tone = 'red', onConfirm, onClose, busy }) {
  const [typed, setTyped] = useState('')
  const armed = typed === keyword
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, backgroundColor: '#0A0E1Acc',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: CARD, border: `1px solid ${RED}66`, borderTop: `3px solid ${RED}`,
          borderRadius: 14, padding: '20px 22px', maxWidth: 380, width: '100%',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: '#F9FAFB', fontFamily: F }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9CA3AF', lineHeight: 1.5 }}>{body}</p>
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#4B5563' }}>
          Type <span style={{ color: RED, fontWeight: 800, fontFamily: F, letterSpacing: '0.08em' }}>{keyword}</span> to confirm
        </p>
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
            backgroundColor: '#060912', border: `1px solid ${armed ? RED : BORDER}`,
            color: '#F9FAFB', fontSize: 14, outline: 'none', marginBottom: 14,
            fontFamily: F, letterSpacing: '0.1em',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, background: 'none',
              border: `1px solid ${BORDER}`, color: '#9CA3AF', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <div style={{ flex: 1 }}>
            <ActionButton label={confirmLabel} tone={tone} disabled={!armed} busy={busy} onClick={onConfirm} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CommissionerPage() {
  const { id } = useParams()
  const router = useRouter()

  const [loading,   setLoading]   = useState(true)
  const [league,    setLeague]    = useState(null)
  const [members,   setMembers]   = useState([])
  const [draft,     setDraft]     = useState(null)
  const [season,    setSeason]    = useState(null)
  const [trades,    setTrades]    = useState([])
  const [userId,    setUserId]    = useState(null)

  const [draftText,   setDraftText]   = useState('')      // announcement textarea
  const [busy,        setBusy]        = useState(null)    // which action is running
  const [notice,      setNotice]      = useState(null)    // { text, error }
  const [showReset,   setShowReset]   = useState(false)
  const [removeTarget, setRemoveTarget] = useState('')    // user_id from dropdown
  const [showRemove,  setShowRemove]  = useState(false)

  const flash = (text, error = false) => {
    setNotice({ text, error })
    setTimeout(() => setNotice(null), 4000)
  }

  // ── Load everything ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: lg } = await supabase.from('leagues').select('*').eq('id', id).single()
    if (!lg) { router.replace(`/leagues/${id}`); return }
    setLeague(lg)

    const { data: memberRows } = await supabase
      .from('league_members')
      .select('user_id, is_commissioner, is_bot, joined_at')
      .eq('league_id', id)
      .order('joined_at')

    const me = (memberRows ?? []).find(m => m.user_id === user.id)
    if (!me?.is_commissioner) { router.replace(`/leagues/${id}`); return }

    const userIds = (memberRows ?? []).map(m => m.user_id)
    const { data: profiles } = await supabase
      .from('profiles').select('id, team_name, display_name').in('id', userIds)
    const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    setMembers((memberRows ?? []).map(m => ({
      ...m,
      name: pMap[m.user_id]?.team_name || pMap[m.user_id]?.display_name || 'Unknown',
    })))

    const { data: draftRow } = await supabase
      .from('drafts').select('id, status')
      .eq('league_id', id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    setDraft(draftRow ?? null)

    const { data: seasonRow } = await supabase
      .from('app_seasons').select('id, current_week, season_number')
      .eq('status', 'active')
      .order('season_number', { ascending: false }).limit(1).maybeSingle()
    setSeason(seasonRow ?? null)

    // Pending trades with names on both sides
    const { data: tradeRows } = await supabase
      .from('trades')
      .select('id, proposer_user_id, receiver_user_id, proposer_players, receiver_players, expires_at')
      .eq('league_id', id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())

    let enriched = []
    if (tradeRows?.length) {
      const playerIds = [...new Set(tradeRows.flatMap(t => [...t.proposer_players, ...t.receiver_players]))]
      const { data: players } = playerIds.length
        ? await supabase.from('players').select('id, name').in('id', playerIds)
        : { data: [] }
      const playerName = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))
      const nameOf = uid => pMap[uid]?.team_name || pMap[uid]?.display_name || 'Unknown'
      enriched = tradeRows.map(t => ({
        id: t.id,
        proposer: nameOf(t.proposer_user_id),
        receiver: nameOf(t.receiver_user_id),
        gives:    t.proposer_players.map(pid => playerName[pid]).filter(Boolean),
        gets:     t.receiver_players.map(pid => playerName[pid]).filter(Boolean),
      }))
    }
    setTrades(enriched)

    setLoading(false)
  }, [id])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  // ── API helper ──────────────────────────────────────────────────────────────
  const callApi = useCallback(async (path, body, busyKey) => {
    setBusy(busyKey)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/commissioner/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ leagueId: id, ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
      return json
    } catch (e) {
      flash(e.message, true)
      return null
    } finally {
      setBusy(null)
    }
  }, [id])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const postAnnouncement = async () => {
    const result = await callApi('announce', { message: draftText }, 'announce')
    if (result) {
      flash(draftText.trim() ? 'Announcement posted' : 'Announcement cleared')
      setDraftText('')
      load()
    }
  }

  const clearAnnouncement = async () => {
    const result = await callApi('announce', { message: '' }, 'clear')
    if (result) { flash('Announcement cleared'); load() }
  }

  const toggleBot = async (member) => {
    const result = await callApi('set-bot', { userId: member.user_id, isBot: !member.is_bot }, `bot-${member.user_id}`)
    if (result) {
      setMembers(ms => ms.map(m => m.user_id === member.user_id ? { ...m, is_bot: result.isBot } : m))
    }
  }

  const cancelTrade = async (tradeId) => {
    const result = await callApi('force-cancel-trade', { tradeId }, `trade-${tradeId}`)
    if (result) { flash('Trade cancelled'); setTrades(ts => ts.filter(t => t.id !== tradeId)) }
  }

  const resetWeek = async () => {
    const result = await callApi('reset-week', { confirm: 'RESET' }, 'reset')
    if (result) { flash(`Week ${result.week} reset — standings rebuilt`); setShowReset(false); load() }
  }

  const extendPacks = async () => {
    const result = await callApi('extend-pack-deadline', {}, 'extend')
    if (result) flash(result.extended ? `Extended ${result.extended} pack(s) by 24h` : 'No pending packs to extend')
  }

  const toggleLock = async () => {
    const result = await callApi('lineup-lock', {}, 'lock')
    if (result) {
      flash(result.locked ? 'Lineups locked' : 'Lineups unlocked')
      setLeague(lg => ({ ...lg, manual_lineup_lock: result.locked }))
    }
  }

  const removeTeam = async () => {
    const result = await callApi('remove-team', { userId: removeTarget }, 'remove')
    if (result) {
      flash('Team removed')
      setShowRemove(false)
      setRemoveTarget('')
      load()
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #1A2035', borderTopColor: GOLD, animation: 'spin 0.8s linear infinite' }} />
    </main>
  )

  const draftComplete  = draft?.status === 'complete'
  const draftRunning   = ['helmet_race', 'active'].includes(draft?.status)
  const locked         = !!league?.manual_lineup_lock
  const removable      = members.filter(m => m.user_id !== userId)
  const removeName     = members.find(m => m.user_id === removeTarget)?.name

  return (
    <main style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {showReset && (
        <ConfirmModal
          title={`Reset Week ${season?.current_week ?? '—'}?`}
          body="This wipes every team's player scores for the current week, resets its matchups to scheduled, and rebuilds the standings from the remaining completed weeks. This cannot be undone."
          keyword="RESET"
          confirmLabel="Reset Week"
          onConfirm={resetWeek}
          onClose={() => setShowReset(false)}
          busy={busy === 'reset'}
        />
      )}
      {showRemove && removeName && (
        <ConfirmModal
          title={`Remove ${removeName}?`}
          body={`${removeName} will be removed from the league. Their drafted players stay in the player pool records but they lose access to the league.`}
          keyword="REMOVE"
          confirmLabel="Remove Team"
          onConfirm={removeTeam}
          onClose={() => setShowRemove(false)}
          busy={busy === 'remove'}
        />
      )}

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 56px' }}>

        {/* Header */}
        <button
          onClick={() => router.push(`/leagues/${id}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5563', fontSize: 13, padding: 0, marginBottom: 14 }}
        >
          ← {league?.name}
        </button>
        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#F9FAFB', fontFamily: F }}>
          Commissioner Tools
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#4B5563', letterSpacing: '0.08em', fontFamily: F, fontWeight: 600 }}>
          {season ? `WEEK ${season.current_week} · SEASON ${season.season_number}` : ''}
        </p>

        {/* Action feedback */}
        {notice && (
          <div style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13,
            backgroundColor: notice.error ? `${RED}1A` : `${GOLD}1A`,
            border: `1px solid ${notice.error ? RED : GOLD}55`,
            color: notice.error ? '#FCA5A5' : GOLD,
          }}>
            {notice.text}
          </div>
        )}

        {/* 1 — Announcement */}
        <Card title="LEAGUE ANNOUNCEMENT">
          {league?.announcement && (
            <div style={{
              marginBottom: 12, padding: '10px 12px', borderRadius: 10,
              backgroundColor: `${GOLD}12`, border: `1px solid ${GOLD}44`,
            }}>
              <p style={{ margin: 0, fontSize: 13, color: '#F9FAFB', lineHeight: 1.5 }}>{league.announcement}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 10, color: '#6B7280' }}>Posted {fmtStamp(league.announcement_updated_at)}</span>
                <button
                  onClick={clearAnnouncement}
                  disabled={busy === 'clear'}
                  style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {busy === 'clear' ? 'Clearing…' : 'Clear'}
                </button>
              </div>
            </div>
          )}
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value.slice(0, MAX_ANNOUNCEMENT))}
            placeholder="Message to the league…"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
              backgroundColor: '#060912', border: `1px solid ${BORDER}`, color: '#F9FAFB',
              fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 10px' }}>
            <span style={{ fontSize: 10, color: draftText.length >= MAX_ANNOUNCEMENT ? RED : '#374151' }}>
              {draftText.length}/{MAX_ANNOUNCEMENT}
            </span>
          </div>
          <ActionButton
            label="Post Announcement"
            onClick={postAnnouncement}
            disabled={!draftText.trim()}
            busy={busy === 'announce'}
          />
        </Card>

        {/* 2 — Draft controls (hidden once complete) */}
        {!draftComplete && (
          <Card title="DRAFT CONTROLS">
            <ActionButton
              label={draftRunning ? 'Draft In Progress — Open Draft Room' : 'Start Draft Now'}
              onClick={() => router.push(`/leagues/${id}/draft`)}
            />
            <p style={{ margin: '14px 0 8px', fontSize: 10, color: '#4B5563', letterSpacing: '0.1em', fontFamily: F, fontWeight: 700 }}>
              BOT TEAMS (auto-pick in draft)
            </p>
            {members.map(m => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${BG}` }}>
                <span style={{ fontSize: 13, color: '#D1D5DB', fontFamily: F, fontWeight: 700 }}>
                  {m.name}{m.user_id === userId && <span style={{ color: '#374151', fontWeight: 400 }}> · You</span>}
                </span>
                {m.user_id === userId ? (
                  <span style={{ fontSize: 10, color: '#374151' }}>—</span>
                ) : (
                  <button
                    onClick={() => toggleBot(m)}
                    disabled={busy === `bot-${m.user_id}`}
                    style={{
                      padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                      fontFamily: F, letterSpacing: '0.08em', cursor: 'pointer',
                      backgroundColor: m.is_bot ? GOLD : '#141E35',
                      color: m.is_bot ? BG : '#6B7280',
                      border: 'none',
                    }}
                  >
                    {m.is_bot ? 'BOT ON' : 'BOT OFF'}
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}

        {/* 3 — Trade controls */}
        <Card title="TRADE CONTROLS">
          {trades.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: '#374151' }}>No pending trades.</p>
          ) : (
            trades.map(t => (
              <div key={t.id} style={{
                padding: '10px 12px', marginBottom: 8, borderRadius: 10,
                backgroundColor: '#060912', border: `1px solid ${BORDER}`,
              }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#F9FAFB', fontFamily: F, fontWeight: 700 }}>
                  {t.proposer} ⇄ {t.receiver}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>
                  {t.proposer} sends <span style={{ color: '#D1D5DB' }}>{t.gives.join(', ') || '—'}</span> for{' '}
                  <span style={{ color: '#D1D5DB' }}>{t.gets.join(', ') || '—'}</span>
                </p>
                <ActionButton
                  label="Force Cancel"
                  tone="red"
                  full={false}
                  onClick={() => cancelTrade(t.id)}
                  busy={busy === `trade-${t.id}`}
                />
              </div>
            ))
          )}
        </Card>

        {/* 4 — Week controls */}
        <Card title="WEEK CONTROLS">
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9CA3AF' }}>
            Current week: <span style={{ color: GOLD, fontWeight: 800, fontFamily: F }}>Week {season?.current_week ?? '—'}</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionButton
              label="Extend Pack Deadline +24h"
              tone="dark"
              onClick={extendPacks}
              busy={busy === 'extend'}
            />
            <ActionButton
              label="Reset Current Week"
              tone="red"
              onClick={() => setShowReset(true)}
            />
          </div>
        </Card>

        {/* 5 — Lineup lock */}
        <Card title="LINEUP LOCK">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, fontFamily: F, color: locked ? RED : '#34D399' }}>
                {locked ? '🔒 LINEUPS LOCKED' : '🔓 LINEUPS OPEN'}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#4B5563' }}>
                {locked ? 'Managers cannot change rosters' : 'Managers can change rosters freely'}
              </p>
            </div>
            <ActionButton
              label={locked ? 'Unlock' : 'Lock'}
              tone={locked ? 'dark' : 'gold'}
              full={false}
              onClick={toggleLock}
              busy={busy === 'lock'}
            />
          </div>
        </Card>

        {/* 6 — Danger zone */}
        <Card title="DANGER ZONE" danger>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#9CA3AF' }}>Remove a team from the league</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={removeTarget}
              onChange={e => setRemoveTarget(e.target.value)}
              disabled={draftRunning}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                backgroundColor: '#060912', border: `1px solid ${BORDER}`,
                color: removeTarget ? '#F9FAFB' : '#4B5563', fontSize: 13, outline: 'none',
              }}
            >
              <option value="">Select a team…</option>
              {removable.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
            <ActionButton
              label="Remove"
              tone="red"
              full={false}
              disabled={!removeTarget || draftRunning}
              onClick={() => setShowRemove(true)}
            />
          </div>
          {draftRunning && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: RED }}>
              Teams cannot be removed while the draft is running.
            </p>
          )}
        </Card>
      </div>
    </main>
  )
}
