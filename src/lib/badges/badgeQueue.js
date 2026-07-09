'use client'

/**
 * Client-side badge popup queue. Earned badges are stashed in localStorage so
 * they survive navigation (a pack open, then a route change), and the popup
 * host drains them one at a time. A "hold" flag lets a page (e.g. live Sunday
 * scoring) defer popups until it releases them.
 */

const QUEUE_KEY = 'dp-badge-queue'
const HOLD_KEY  = 'dp-badge-hold'
const EVT       = 'dp-badge-change'

function read() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function write(list) {
  if (typeof window === 'undefined') return
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(EVT))
}

/**
 * Push the newly-earned / leveled-up badges from an award API response.
 * Each award: { badge:{id,name,icon}, level, newlyEarned, leveledUp }.
 */
export function enqueueBadges(awards) {
  if (typeof window === 'undefined' || !Array.isArray(awards)) return
  const items = awards
    .filter(a => a && a.badge && (a.newlyEarned || a.leveledUp))
    .map(a => ({
      key:        `${a.badge.id}-${a.level}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      id:         a.badge.id,
      name:       a.badge.name,
      icon:       a.badge.icon,
      level:      a.level,
      leveledUp:  !!a.leveledUp,
    }))
  if (items.length) write([...read(), ...items])
}

/** Host: current queue. */
export function peekQueue() { return read() }

/** Host: remove one item by key after it's dismissed. */
export function dequeueBadge(key) { write(read().filter(i => i.key !== key)) }

/** Subscribe to queue/hold changes. Returns an unsubscribe fn. */
export function onBadgeChange(handler) {
  if (typeof window === 'undefined') return () => {}
  const wrapped = () => handler()
  window.addEventListener(EVT, wrapped)
  window.addEventListener('storage', wrapped)   // cross-tab
  return () => {
    window.removeEventListener(EVT, wrapped)
    window.removeEventListener('storage', wrapped)
  }
}

/** Defer popups (e.g. during live scoring). */
export function holdBadges() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(HOLD_KEY, '1')
  window.dispatchEvent(new Event(EVT))
}

/** Resume popups; queued badges show immediately. */
export function releaseBadges() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(HOLD_KEY)
  window.dispatchEvent(new Event(EVT))
}

export function isHeld() {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(HOLD_KEY) === '1'
}

/**
 * Fire a client-validated award request and enqueue any resulting popups.
 * Best-effort — never throws into the calling flow.
 * @param supabase browser client (for the session token)
 */
export async function requestBadgeAward(supabase, body) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const res = await fetch('/api/badges/award', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) return
    const json = await res.json()
    enqueueBadges(json.awards)
  } catch (err) {
    console.warn('[badges] award request failed:', err.message)
  }
}
