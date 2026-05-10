'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { HelmetSVG } from '../../../../lib/helmet/HelmetSVG'

// ─── Palette ──────────────────────────────────────────────────────────────────
const COLORS = [
  { name: 'Midnight Black',    hex: '#0D0D0D' },
  { name: 'Arctic White',      hex: '#F5F5F5' },
  { name: 'Navy Blue',         hex: '#1B2A4A' },
  { name: 'Royal Blue',        hex: '#1A56DB' },
  { name: 'Electric Blue',     hex: '#00A8FF' },
  { name: 'Forest Green',      hex: '#1A4731' },
  { name: 'Kelly Green',       hex: '#16A34A' },
  { name: 'Lime Green',        hex: '#84CC16' },
  { name: 'Burgundy',          hex: '#7B1F2E' },
  { name: 'Crimson Red',       hex: '#DC2626' },
  { name: 'Burnt Orange',      hex: '#C2410C' },
  { name: 'Championship Gold', hex: '#F0B429' },
  { name: 'Sunshine Yellow',   hex: '#FBBF24' },
  { name: 'Deep Purple',       hex: '#5B21B6' },
  { name: 'Lavender',          hex: '#8B5CF6' },
  { name: 'Hot Pink',          hex: '#EC4899' },
  { name: 'Teal',              hex: '#0D9488' },
  { name: 'Steel Gray',        hex: '#6B7280' },
  { name: 'Silver',            hex: '#CBD5E1' },
  { name: 'Bronze',            hex: '#92400E' },
]

// ─── Patterns ─────────────────────────────────────────────────────────────────
const PATTERNS = [
  { id: 'solid',     name: 'Solid' },
  { id: 'stripes',   name: 'Stripes' },
  { id: 'chevron',   name: 'Chevron' },
  { id: 'lightning', name: 'Lightning' },
  { id: 'fade',      name: 'Fade' },
  { id: 'carbon',    name: 'Carbon Fiber' },
  { id: 'flames',    name: 'Flames' },
  { id: 'camo',      name: 'Camo' },
  { id: 'split',     name: 'Split' },
  { id: 'diamond',   name: 'Diamond' },
  { id: 'geometric', name: 'Geometric' },
  { id: 'sweep',     name: 'Gradient Sweep' },
]

const GOLD = '#F0B429'
const BG   = '#0A0E1A'

// ─── Mini helmet for pattern picker row ───────────────────────────────────────
function MiniHelmet({ patternId, patternName, base, secondary, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 5, background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px 2px', flexShrink: 0,
      }}
    >
      <div style={{
        borderRadius: 10, padding: 3,
        border: `2px solid ${selected ? GOLD : 'transparent'}`,
        boxShadow: selected ? `0 0 10px ${GOLD}55` : 'none',
        background: '#0D1220', lineHeight: 0,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        <HelmetSVG
          base={base}
          secondary={secondary}
          pattern={patternId}
          uid={`mini-${patternId}`}
          width={95}
          height={82}
        />
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
        color: selected ? GOLD : '#6B7280',
        textTransform: 'uppercase', textAlign: 'center',
        maxWidth: 88, lineHeight: 1.2,
      }}>
        {patternName}
      </span>
    </button>
  )
}

// ─── Color swatch ─────────────────────────────────────────────────────────────
function Swatch({ color, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      title={color.name}
      style={{
        width: 34, height: 34, borderRadius: '50%',
        backgroundColor: color.hex, padding: 0,
        border: `3px solid ${selected ? GOLD : 'transparent'}`,
        outline: selected ? `2px solid ${GOLD}` : '2px solid transparent',
        outlineOffset: 1,
        cursor: 'pointer',
        boxShadow: color.hex === '#F5F5F5'
          ? 'inset 0 0 0 1px rgba(0,0,0,0.18)'
          : color.hex === '#0D0D0D'
          ? 'inset 0 0 0 1px rgba(255,255,255,0.08)'
          : 'none',
        transition: 'transform 0.1s, outline-color 0.15s',
        flexShrink: 0,
      }}
    />
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      color: '#6B7280', textTransform: 'uppercase', margin: '0 0 10px',
    }}>
      {children}
    </p>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HelmetPage() {
  const { id: leagueId } = useParams()
  const router = useRouter()

  const [base,        setBase]        = useState('#1B2A4A')
  const [secondary,   setSecondary]   = useState('#F0B429')
  const [pattern,     setPattern]     = useState('solid')
  const [teamName,    setTeamName]    = useState('')
  const [leagueName,  setLeagueName]  = useState('')
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [conflict,    setConflict]    = useState(false)
  const [otherHelmets, setOtherHelmets] = useState([])

  // ── Load profile + other members' helmets ──────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: league }, { data: profile }, { data: members }] = await Promise.all([
        supabase.from('leagues').select('name').eq('id', leagueId).single(),
        supabase
          .from('profiles')
          .select('team_name, helmet_color, helmet_secondary, helmet_pattern')
          .eq('id', user.id)
          .single(),
        supabase
          .from('league_members')
          .select('user_id')
          .eq('league_id', leagueId)
          .neq('user_id', user.id),
      ])

      if (league)   setLeagueName(league.name)
      if (profile) {
        if (profile.helmet_color)     setBase(profile.helmet_color)
        if (profile.helmet_secondary) setSecondary(profile.helmet_secondary)
        if (profile.helmet_pattern)   setPattern(profile.helmet_pattern)
        if (profile.team_name)        setTeamName(profile.team_name ?? '')
      }

      if (members?.length) {
        const uids = members.map(m => m.user_id)
        const { data: others } = await supabase
          .from('profiles')
          .select('helmet_color, helmet_secondary, helmet_pattern')
          .in('id', uids)
        setOtherHelmets(others ?? [])
      }

      setLoading(false)
    }
    load()
  }, [leagueId])

  // ── Conflict detection ─────────────────────────────────────────────────────
  useEffect(() => {
    setConflict(
      otherHelmets.some(h =>
        h.helmet_color     === base &&
        h.helmet_secondary === secondary &&
        h.helmet_pattern   === pattern
      )
    )
  }, [base, secondary, pattern, otherHelmets])

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (conflict || saving) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      team_name:        teamName,
      helmet_color:     base,
      helmet_secondary: secondary,
      helmet_pattern:   pattern,
    }).eq('id', user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  if (loading) {
    return (
      <main style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6B7280', fontFamily: 'system-ui,sans-serif' }}>Loading…</p>
      </main>
    )
  }

  const btnBg    = conflict ? '#374151' : saved ? '#16A34A' : GOLD
  const btnColor = conflict ? '#9CA3AF' : '#0A0E1A'
  const btnLabel = saving   ? 'Saving…' : saved  ? '✓ Saved!' : 'Save Changes'

  return (
    <main style={{
      background: BG, minHeight: '100vh',
      color: '#F9FAFB', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 60px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <button
            onClick={() => router.push(`/leagues/${leagueId}`)}
            style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 14, padding: 0 }}
          >
            ← {leagueName || 'League'}
          </button>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#4B5563', textTransform: 'uppercase' }}>
            Helmet Builder
          </span>
        </div>

        {/* ── Main helmet preview ── */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 4px' }}>
          <HelmetSVG
            base={base}
            secondary={secondary}
            pattern={pattern}
            uid="main"
            width={300}
            height={260}
          />
        </div>

        {/* ── Team name ── */}
        <div style={{ marginBottom: 18 }}>
          <input
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="Team name"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0D1220', border: '1px solid #1A2035',
              color: '#F9FAFB', borderRadius: 10,
              padding: '10px 14px', fontSize: 15, fontWeight: 600,
              outline: 'none', textAlign: 'center',
            }}
          />
        </div>

        {/* ── Conflict warning ── */}
        {conflict && (
          <div style={{
            background: '#7F1D1D22', border: '1px solid #DC262655',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
            color: '#FCA5A5', fontSize: 13, textAlign: 'center',
          }}>
            ⚠️ Another team has this helmet — choose a different combination
          </div>
        )}

        {/* ── Pattern selector ── */}
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Pattern</SectionLabel>
          <div style={{
            display: 'flex', gap: 8,
            overflowX: 'auto', paddingBottom: 6,
            scrollbarWidth: 'none',
          }}>
            {PATTERNS.map(p => (
              <MiniHelmet
                key={p.id}
                patternId={p.id}
                patternName={p.name}
                base={base}
                secondary={secondary}
                selected={pattern === p.id}
                onClick={() => setPattern(p.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Color pickers (side by side) ── */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>

          {/* Base color */}
          <div style={{ flex: 1 }}>
            <SectionLabel>Base Color</SectionLabel>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8, justifyItems: 'center',
            }}>
              {COLORS.map(c => (
                <Swatch
                  key={`b-${c.hex}`}
                  color={c}
                  selected={base === c.hex}
                  onClick={() => setBase(c.hex)}
                />
              ))}
            </div>
          </div>

          {/* Secondary color */}
          <div style={{ flex: 1 }}>
            <SectionLabel>Secondary Color</SectionLabel>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8, justifyItems: 'center',
            }}>
              {COLORS.map(c => (
                <Swatch
                  key={`s-${c.hex}`}
                  color={c}
                  selected={secondary === c.hex}
                  onClick={() => setSecondary(c.hex)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Save button ── */}
        <button
          onClick={handleSave}
          disabled={conflict || saving}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: 12,
            fontSize: 15, fontWeight: 700, letterSpacing: '0.05em',
            cursor: conflict || saving ? 'not-allowed' : 'pointer',
            backgroundColor: btnBg, color: btnColor,
            transition: 'background-color 0.2s',
          }}
        >
          {btnLabel}
        </button>

      </div>
    </main>
  )
}
