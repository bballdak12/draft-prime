/**
 * Test script — verifies generatePack() end-to-end against the live DB.
 * Run: node scripts/test-pack-gen.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = 'https://hihbgpkjrzffdzuiqzcp.supabase.co'
const SERVICE_ROLE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGJncGtqcnpmZmR6dWlxemNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjczNzEwNywiZXhwIjoyMDkyMzEzMTA3fQ.P_juXzfqA0JaHxatEE82rpmJ75Gy-yi82gYgoCKCrDI'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Inline pack generator (mirrors src/lib/draft/packGenerator.js) ─────────────

const NORMAL_ODDS  = { bronze: 0.60, silver: 0.28, gold: 0.10, hero: 0.015, legend: 0.005 }
const CAPTAIN_ODDS = { gold: 0.70, hero: 0.20, legend: 0.10 }
const LEGEND_ODDS  = { gold: 0.40, hero: 0.30, legend: 0.30 }
const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1, K: 1 }

const ROUND_MAP = {
  1: { packOddsType: 'captain', positions: null,    tierOdds: CAPTAIN_ODDS },
  2: { packOddsType: 'normal',  positions: ['RB'],  tierOdds: NORMAL_ODDS  },
  3: { packOddsType: 'normal',  positions: ['RB'],  tierOdds: NORMAL_ODDS  },
  4: { packOddsType: 'normal',  positions: ['WR'],  tierOdds: NORMAL_ODDS  },
  5: { packOddsType: 'normal',  positions: ['WR'],  tierOdds: NORMAL_ODDS  },
  6: { packOddsType: 'legend',  positions: null,    tierOdds: LEGEND_ODDS  },
  7: { packOddsType: 'normal',  positions: ['TE'],  tierOdds: NORMAL_ODDS  },
  8: { packOddsType: 'normal',  positions: ['DST'], tierOdds: NORMAL_ODDS  },
  9: { packOddsType: 'normal',  positions: ['K'],   tierOdds: NORMAL_ODDS  },
}

function getDraftRoundInfo(round) {
  return ROUND_MAP[round] ?? { round, packOddsType: 'normal', positions: null, tierOdds: NORMAL_ODDS, smartFill: true }
}

function rollTier(tierOdds) {
  const r = Math.random(); let c = 0
  for (const [tier, prob] of Object.entries(tierOdds)) { c += prob; if (r < c) return tier }
  return Object.keys(tierOdds).at(-1)
}

function sample(arr) { return arr[Math.floor(Math.random() * arr.length)] }

async function resolveSmartFillPositions(draftId, teamUserId) {
  const { data: picks, error } = await supabase
    .from('draft_picks').select('players(position)')
    .eq('draft_id', draftId).eq('team_user_id', teamUserId)
  if (error) throw new Error(`resolveSmartFill: ${error.message}`)
  const hasCounts = {}
  for (const pick of picks || []) {
    const pos = pick.players?.position
    if (pos) hasCounts[pos] = (hasCounts[pos] || 0) + 1
  }
  const needed = []
  for (const [pos, target] of Object.entries(ROSTER_NEEDS)) {
    if ((hasCounts[pos] || 0) < target) needed.push(pos)
  }
  return needed.length > 0 ? needed : null
}

async function generatePack(draftId, teamUserId, round) {
  const roundInfo = getDraftRoundInfo(round)

  const { data: picksData, error: picksErr } = await supabase
    .from('draft_picks').select('player_id').eq('draft_id', draftId)
  if (picksErr) throw new Error(`draft_picks fetch: ${picksErr.message}`)
  const draftedIds = new Set((picksData || []).map(p => p.player_id))

  let positions = roundInfo.positions
  if (roundInfo.smartFill) {
    positions = await resolveSmartFillPositions(draftId, teamUserId)
  }

  let query = supabase.from('players')
    .select('id, name, position, tier, overall_rating').eq('is_active', true)
  if (positions?.length) query = query.in('position', positions)

  const { data: allPlayers, error: playersErr } = await query
  if (playersErr) throw new Error(`players fetch: ${playersErr.message}`)

  const pool = (allPlayers || []).filter(p => !draftedIds.has(p.id))
  const byTier = {}
  for (const p of pool) (byTier[p.tier] ||= []).push(p)

  const picked = []; const pickedIds = new Set()
  for (let slot = 0; slot < 5; slot++) {
    const tier     = rollTier(roundInfo.tierOdds)
    const tierPool = (byTier[tier] || []).filter(p => !pickedIds.has(p.id))
    const player   = tierPool.length ? sample(tierPool) : sample(pool.filter(p => !pickedIds.has(p.id)))
    if (!player) break
    picked.push(player); pickedIds.add(player.id)
  }

  if (picked.length < 5) throw new Error(`Not enough players (found ${picked.length}, pool=${pool.length})`)

  picked.sort((a, b) => (a.overall_rating ?? 0) - (b.overall_rating ?? 0))
  return { packOddsType: roundInfo.packOddsType, players: picked }
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏈 Draft Prime — Pack Generator Test\n')

  // 1. Find any draft in the DB
  const { data: drafts, error: draftErr } = await supabase
    .from('drafts').select('id, status, league_id, current_pick_number, draft_order, total_rounds')
    .order('created_at', { ascending: false }).limit(5)

  if (draftErr) { console.error('❌ Could not fetch drafts:', draftErr.message); process.exit(1) }
  if (!drafts?.length) { console.warn('⚠️  No draft rows found in DB. Create a draft first.'); process.exit(0) }

  console.log(`Found ${drafts.length} draft(s):`)
  drafts.forEach(d => console.log(`  ${d.id} — status: ${d.status}, pick: ${d.current_pick_number}`))

  const draft = drafts[0]
  console.log(`\nUsing draft: ${draft.id}`)

  // 2. Pick a team user — use first member in draft_order, or fallback to any league member
  let teamUserId = draft.draft_order?.[0]
  if (!teamUserId) {
    const { data: members } = await supabase
      .from('league_members').select('user_id').eq('league_id', draft.league_id).limit(1)
    teamUserId = members?.[0]?.user_id
  }

  if (!teamUserId) { console.warn('⚠️  No team user found for this draft.'); process.exit(0) }
  console.log(`Team user ID: ${teamUserId}`)

  // 3. Check player pool
  const { count: playerCount } = await supabase
    .from('players').select('id', { count: 'exact', head: true }).eq('is_active', true)
  console.log(`Active players in DB: ${playerCount}`)

  if (!playerCount || playerCount < 5) {
    console.error('❌ Fewer than 5 active players in DB — seed the players table first.')
    process.exit(1)
  }

  // 4. Test each meaningful round type
  const testRounds = [1, 2, 4, 6, 7, 8, 9, 10]
  let allPassed = true

  for (const round of testRounds) {
    const info = getDraftRoundInfo(round)
    process.stdout.write(`  Round ${String(round).padStart(2)} [${info.packOddsType.padEnd(7)}]  pos=${JSON.stringify(info.positions ?? (info.smartFill ? 'smartFill' : 'any'))}  → `)
    try {
      const pack = await generatePack(draft.id, teamUserId, round)
      const names = pack.players.map(p => `${p.name}(${p.position}/${p.tier}/${p.overall_rating})`)
      console.log(`✅  ${names.join(', ')}`)
      console.log(`                              card5 (best): ${pack.players[4].name} OVR ${pack.players[4].overall_rating} [${pack.players[4].tier}]`)
    } catch (err) {
      console.log(`❌  ${err.message}`)
      allPassed = false
    }
  }

  console.log(`\n${allPassed ? '✅ All rounds passed' : '❌ Some rounds failed — see above'}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
