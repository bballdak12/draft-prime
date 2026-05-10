'use strict'

// =============================================================================
// packGenerator.js — shared pack generation for Draft Prime
//
// Used by:
//   1. Draft room  (live draft picks)          → generatePack(sb, {round,draftId,teamUserId})
//   2. Weekly packs (Monday roster packs)      → generatePack(sb, 'normal'|'win'|'loss', [ids])
//   3. generate-weekly-packs.mjs script        → same as (2)
// =============================================================================

// ─── Tier order (worst → best) ─────────────────────────────────────────────
const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, hero: 3, legend: 4 }

// ─── Draft-round tier weights  ('captain' and 'legend' are draft-only types) ─
const DRAFT_TIER_WEIGHTS = {
  normal:  { bronze: 55, silver: 30, gold: 12,  hero: 2.5, legend: 0.5 },
  captain: { bronze: 25, silver: 32, gold: 28,  hero: 12,  legend: 3   },
  legend:  { bronze: 8,  silver: 20, gold: 35,  hero: 25,  legend: 12  },
}

// ─── Weekly-pack tier weights  ('win', 'loss', 'normal') ─────────────────────
const WEEKLY_TIER_WEIGHTS = {
  normal: { bronze: 60,   silver: 28, gold: 10,  hero: 1.5, legend: 0.5 },
  win:    { bronze: 45,   silver: 35, gold: 15,  hero: 4,   legend: 1   },
  loss:   { bronze: 65,   silver: 28, gold: 6,   hero: 1,   legend: 0   },
}

// ─── Round → draft pack odds type ────────────────────────────────────────────
// Round 1 → 'legend' odds (best pack of the draft)
// Rounds 2 & 6 → 'captain' odds (boosted mid-draft)
// All others → 'normal'
export function getDraftRoundInfo(round) {
  if (round === 1)               return { packOddsType: 'legend'  }
  if (round === 2 || round === 6) return { packOddsType: 'captain' }
  return                                 { packOddsType: 'normal'  }
}

// ─── Internal: weighted random tier draw ─────────────────────────────────────
function drawTier(weights) {
  const entries = Object.entries(weights)
  const total   = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [tier, w] of entries) {
    r -= w
    if (r <= 0) return tier
  }
  return 'bronze'
}

// ─── Internal: fetch player pools grouped by tier ────────────────────────────
async function fetchPools(supabase) {
  const tierList = ['bronze', 'silver', 'gold', 'hero', 'legend']
  const pools = {}
  await Promise.all(
    tierList.map(async tier => {
      const { data } = await supabase
        .from('players')
        .select('id, name, position, tier, overall_rating, ceiling, consistency, floor, team, era')
        .eq('tier', tier)
        .eq('is_active', true)
      pools[tier] = data ?? []
    })
  )
  return pools
}

// ─── Internal: draw N cards from pools ───────────────────────────────────────
function drawCards(pools, weights, excludeSet, count = 5) {
  const tierList = ['bronze', 'silver', 'gold', 'hero', 'legend']
  const pickedIds = new Set()
  const cards = []

  for (let i = 0; i < count; i++) {
    let tier = drawTier(weights)
    let pool = (pools[tier] ?? []).filter(p => !excludeSet.has(p.id) && !pickedIds.has(p.id))

    // Fallback: scan tiers ascending until a non-empty pool is found
    if (!pool.length) {
      for (const t of tierList) {
        pool = (pools[t] ?? []).filter(p => !excludeSet.has(p.id) && !pickedIds.has(p.id))
        if (pool.length) { tier = t; break }
      }
    }

    if (!pool.length) continue

    const player = pool[Math.floor(Math.random() * pool.length)]
    pickedIds.add(player.id)
    cards.push(player)
  }

  // Sort worst → best so index 4 is always the suspense reveal card
  cards.sort((a, b) => {
    const ta = TIER_ORDER[a.tier] ?? 0
    const tb = TIER_ORDER[b.tier] ?? 0
    return ta !== tb ? ta - tb : (a.overall_rating ?? 0) - (b.overall_rating ?? 0)
  })

  return cards
}

// =============================================================================
// generatePack — unified entry point, detects call signature automatically
//
//   Draft mode   → generatePack(supabase, { round, draftId, teamUserId })
//                  Returns: { packOddsType, players, playerIds }
//
//   Weekly mode  → generatePack(supabase, 'normal'|'win'|'loss', excludeIds?)
//                  Returns: player[] (5 full player objects, best at index 4)
// =============================================================================
export async function generatePack(supabase, oddsTypeOrOptions = 'normal', excludeIds = []) {
  const isDraftMode = typeof oddsTypeOrOptions === 'object' && oddsTypeOrOptions !== null

  if (isDraftMode) {
    // ── Draft room mode ──────────────────────────────────────────────────────
    const { round = 1, draftId } = oddsTypeOrOptions
    const { packOddsType } = getDraftRoundInfo(round)

    // Exclude all players already picked in this draft
    let draftExcludeIds = []
    if (draftId) {
      const { data: picks } = await supabase
        .from('draft_picks')
        .select('player_id')
        .eq('draft_id', draftId)
      draftExcludeIds = (picks ?? []).map(p => p.player_id)
    }

    const pools   = await fetchPools(supabase)
    const weights = DRAFT_TIER_WEIGHTS[packOddsType] ?? DRAFT_TIER_WEIGHTS.normal
    const players = drawCards(pools, weights, new Set(draftExcludeIds))

    return {
      packOddsType,
      players,
      playerIds: players.map(p => p.id),
    }
  }

  // ── Weekly pack mode ─────────────────────────────────────────────────────
  const oddsType = typeof oddsTypeOrOptions === 'string' ? oddsTypeOrOptions : 'normal'
  const pools    = await fetchPools(supabase)
  const weights  = WEEKLY_TIER_WEIGHTS[oddsType] ?? WEEKLY_TIER_WEIGHTS.normal

  return drawCards(pools, weights, new Set(excludeIds))
}
