/**
 * Simulates the CURRENT on-clock pick for whoever is currently active
 * (if it's NOT Test FC), then advances to the next pick.
 * Run: node scripts/sim-pick.mjs
 */
import { createClient } from '@supabase/supabase-js'

// Credentials come from .env.local — never hardcode keys in scripts.
const __env = (await import('fs')).readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const __SUPABASE_URL     = __env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const __SERVICE_ROLE_KEY = __env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const __ANON_KEY         = __env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()


const SUPABASE_URL     = __SUPABASE_URL
const SERVICE_ROLE_KEY = __SERVICE_ROLE_KEY
const TEST_FC_UID      = 'afc0dd69-8d28-4292-80d0-b99eb82e0356'
const LEAGUE_ID        = 'a6e06087-1705-4658-b6a3-dee499a35f0a'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function main() {
  const { data: draft } = await supabase
    .from('drafts').select('*').eq('league_id', LEAGUE_ID)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!draft) { console.error('No draft found'); process.exit(1) }
  console.log(`Draft pick ${draft.current_pick_number}, on clock: ${draft.current_team_user_id}`)
  console.log(`Draft order: ${draft.draft_order?.join(', ')}`)

  if (draft.current_team_user_id === TEST_FC_UID) {
    console.log('✅ Already Test FC\'s turn — nothing to sim')
    process.exit(0)
  }

  const { data: picks } = await supabase.from('draft_picks').select('player_id').eq('draft_id', draft.id)
  const draftedIds = new Set((picks || []).map(p => p.player_id))

  // Pick a random eligible player
  const { data: players } = await supabase.from('players')
    .select('id, name, position, tier, overall_rating').eq('is_active', true)
  const eligible = (players || []).filter(p => !draftedIds.has(p.id))
  if (!eligible.length) { console.error('No eligible players'); process.exit(1) }
  const chosen = eligible[Math.floor(Math.random() * eligible.length)]
  console.log(`Auto-picking: ${chosen.name} (${chosen.position}/${chosen.tier}/OVR ${chosen.overall_rating})`)

  const draftOrder = draft.draft_order || []
  const totalTeams = draftOrder.length
  const pNum       = draft.current_pick_number
  const round      = Math.ceil(pNum / totalTeams)
  const posInRound = (pNum - 1) % totalTeams

  // Insert pick
  const { error: pickErr } = await supabase.from('draft_picks').insert([{
    draft_id: draft.id, pick_number: pNum, round,
    pick_in_round: posInRound + 1,
    team_user_id: draft.current_team_user_id, player_id: chosen.id, is_auto_draft: true,
  }])
  if (pickErr) { console.error('Insert failed:', pickErr.message); process.exit(1) }
  console.log('✅ Pick inserted')

  // Advance to next pick (snake draft)
  const nextPNum = pNum + 1
  const totalPicks = (draft.total_rounds || 10) * totalTeams
  if (nextPNum > totalPicks) { console.log('Draft complete!'); process.exit(0) }

  const nextRound      = Math.ceil(nextPNum / totalTeams)
  const nextPosInRound = (nextPNum - 1) % totalTeams
  const isOddRound     = nextRound % 2 === 1
  const nextTeamIdx    = isOddRound ? nextPosInRound : (totalTeams - 1 - nextPosInRound)
  const nextTeamUid    = draftOrder[nextTeamIdx]

  const { error: updErr } = await supabase.from('drafts').update({
    current_pick_number:  nextPNum,
    current_team_user_id: nextTeamUid,
    pick_deadline:        new Date(Date.now() + 62_000).toISOString(),
  }).eq('id', draft.id)
  if (updErr) { console.error('Update failed:', updErr.message); process.exit(1) }

  console.log(`✅ Advanced → pick ${nextPNum}, on clock: ${nextTeamUid}`)
  console.log(`   Is Test FC's turn: ${nextTeamUid === TEST_FC_UID}`)
}
main().catch(err => { console.error(err); process.exit(1) })
