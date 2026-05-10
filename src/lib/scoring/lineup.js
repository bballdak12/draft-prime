'use strict'

/**
 * Shared lineup builder — identical logic used by My Team page + scoring engine.
 *
 * Given an array of player objects (must have .id, .position, .overall_rating),
 * returns { starters: [{ slot, player }], bench: [player] }.
 *
 * Starters are filled greedily by highest OVR:
 *   QB × 1 | RB × 2 | WR × 2 | TE × 1 | FLEX (RB/WR/TE) × 1 | DST × 1 | K × 1
 * Remaining players go to bench (max 6 shown, all returned here).
 */
export function buildLineup(players) {
  const sorted = [...players].sort(
    (a, b) => (b.overall_rating || 0) - (a.overall_rating || 0)
  )
  const used = new Set()

  function take(pos) {
    const p = sorted.find(p => p.position === pos && !used.has(p.id))
    if (p) used.add(p.id)
    return p ?? null
  }

  function takeMulti(positions) {
    const p = sorted.find(p => positions.includes(p.position) && !used.has(p.id))
    if (p) used.add(p.id)
    return p ?? null
  }

  const starters = [
    { slot: 'QB',   player: take('QB') },
    { slot: 'RB',   player: take('RB') },
    { slot: 'RB',   player: take('RB') },
    { slot: 'WR',   player: take('WR') },
    { slot: 'WR',   player: take('WR') },
    { slot: 'TE',   player: take('TE') },
    { slot: 'FLEX', player: takeMulti(['RB', 'WR', 'TE']) },
    { slot: 'DST',  player: take('DST') },
    { slot: 'K',    player: take('K') },
  ]

  const bench = sorted.filter(p => !used.has(p.id))

  return { starters, bench }
}

/**
 * Build a flat slot map: { [player_id]: { isStarter, slot } }
 * Useful for quickly tagging each pick with its lineup role.
 */
export function buildSlotMap(players) {
  const { starters, bench } = buildLineup(players)
  const map = {}
  for (const { slot, player } of starters) {
    if (player) map[player.id] = { isStarter: true, slot }
  }
  for (const p of bench) {
    map[p.id] = { isStarter: false, slot: p.position }
  }
  return map
}
