'use client'

import { useEffect, useState, useCallback } from 'react'
import { peekQueue, dequeueBadge, onBadgeChange, isHeld } from './badgeQueue'

const GOLD = '#F0B429'
const BG   = '#0A0E1A'
const TIER_COLOR = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#F0B429', earned: '#34D399' }

const CSS = `
@keyframes dpBadgeIn {
  0%   { opacity: 0; transform: scale(0.6) translateY(20px); }
  60%  { opacity: 1; transform: scale(1.06) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes dpBadgeIcon {
  0%   { transform: scale(0) rotate(-25deg); opacity: 0; }
  55%  { transform: scale(1.25) rotate(8deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes dpGoldBurst {
  0%   { opacity: 0; transform: scale(0.5); }
  40%  { opacity: 0.85; transform: scale(1.25); }
  100% { opacity: 0; transform: scale(1.7); }
}
@keyframes dpBadgeGlow {
  0%,100% { box-shadow: 0 0 30px var(--dp-glow); }
  50%     { box-shadow: 0 0 52px var(--dp-glow); }
}
`

export default function BadgePopupHost() {
  const [current, setCurrent] = useState(null)

  // Pull the next badge if idle and not held
  const pump = useCallback(() => {
    setCurrent(cur => {
      if (cur) return cur
      if (isHeld()) return null
      return peekQueue()[0] ?? null
    })
  }, [])

  useEffect(() => {
    const t = setTimeout(pump, 0)
    const off = onBadgeChange(pump)
    return () => { clearTimeout(t); off() }
  }, [pump])

  const dismiss = useCallback(() => {
    if (current) dequeueBadge(current.key)
    setCurrent(null)
    // let storage settle, then pull the next
    setTimeout(pump, 60)
  }, [current, pump])

  if (!current) return null

  const color   = TIER_COLOR[current.level] ?? GOLD
  const isGold  = current.level === 'gold'
  const heading = current.leveledUp ? 'LEVELED UP' : 'BADGE EARNED'

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: '#060912cc', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        fontFamily: 'var(--font-barlow), system-ui, sans-serif',
      }}
    >
      <style>{CSS}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          backgroundColor: '#0D1220', border: `1px solid ${color}66`, borderTop: `3px solid ${color}`,
          borderRadius: 20, padding: '30px 28px 24px', maxWidth: 320, width: '100%', textAlign: 'center',
          animation: 'dpBadgeIn 0.5s cubic-bezier(0.2,0.9,0.3,1.2) forwards',
          ['--dp-glow']: `${color}44`,
        }}
      >
        {/* Gold burst behind the icon */}
        {isGold && (
          <div style={{
            position: 'absolute', top: 54, left: '50%', width: 160, height: 160,
            transform: 'translate(-50%, -50%)', borderRadius: '50%',
            background: `radial-gradient(circle, ${GOLD}cc 0%, transparent 68%)`,
            animation: 'dpGoldBurst 1s ease-out forwards', pointerEvents: 'none',
          }} />
        )}

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color, marginBottom: 14 }}>
          {heading}
        </div>

        <div style={{
          fontSize: 64, lineHeight: 1, marginBottom: 14, position: 'relative',
          filter: `drop-shadow(0 0 18px ${color}aa)`,
          animation: 'dpBadgeIcon 0.6s cubic-bezier(0.2,0.9,0.3,1.4) 0.1s both',
        }}>
          {current.icon}
        </div>

        <div style={{ fontSize: 24, fontWeight: 800, color: '#F9FAFB', letterSpacing: '0.01em', marginBottom: 4 }}>
          {current.name}
        </div>
        <div style={{
          display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color,
          background: `${color}1A`, border: `1px solid ${color}55`, borderRadius: 4, padding: '2px 8px', marginBottom: 20,
        }}>
          {(current.level === 'earned' ? 'Earned' : current.level).toUpperCase()}
        </div>

        <button
          onClick={dismiss}
          style={{
            display: 'block', width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
            backgroundColor: color, color: BG, fontWeight: 800, fontSize: 14, letterSpacing: '0.08em',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          NICE
        </button>
      </div>
    </div>
  )
}
