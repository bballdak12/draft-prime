/**
 * Simulates pick 1 for the "unknown" team and advances the draft to pick 2
 * so we can test pack card rendering for Test FC (drafttest@example.com).
 * Run: node scripts/advance-draft.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://hihbgpkjrzffdzuiqzcp.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGJncGtqcnpmZmR6dWlxemNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjczNzEwNywiZXhwIjoyMDkyMzEzMTA3fQ.P_juXzfqA0JaHxatEE82rpmJ75Gy-yi82gYgoCKCrDI'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const LEAGUE_ID   = 'a6e06087-1705-4658-b6a3-dee499a35f0a'
const TEST_FC_UID = 'afc0dd69-8d28-4292-80d0-b99eb82e0356' // drafttest@example.com

async function main() {
  console.log('\n⏩  Advancing draft past pick 1…\n')

  // 1. Get the active draft
  const { data: draft, error: dErr } = await supabase
    .from('drafts').select('*')
    .eq('league_id', LEAGUE_ID)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()

  if (dErr || !draft) { console.error('❌ Draft not found:', dErr?.message); process.exit(1) }
  console.log(`Draft: ${draft.id}  status: ${draft.status}  pick: ${draft.current_pick_number}`)
  console.log(`Draft order: ${draft.draft_order?.join(', ')}`)

  if (draft.status !== 'active') {
    console.error(`❌ Draft is not active (status: ${draft.status}). Start the draft first.`)
    process.exit(1)
  }

  const draftOrder = draft.draft_order || []
  const totalTeams = draftOrder.length || 1
  const pick1UserId = draftOrder[0]

  if (!pick1UserId) { console.error('❌ draft_order is empty'); process.exit(1) }
  if (draft.current_pick_number !== 1) {
    console.log(`ℹ️  Pick is already at ${draft.current_pick_number} — nothing to do.`)
    process.exit(0)
  }

  // 2. Pick a random Captain-tier player (round 1) that hasn't been drafted
  const { data: existingPicks } = await supabase
    .from('draft_picks').select('player_id').eq('draft_id', draft.id)
  const draftedIds = new Set((existingPicks || []).map(p => p.player_id))

  const { data: captainPlayers, error: pErr } = await supabase
    .from('players').select('id, name, position, tier, overall_rating')
    .eq('is_active', true).in('tier', ['gold', 'hero', 'legend'])
  if (pErr || !captainPlayers?.length) { console.error('❌ No captain-tier players:', pErr?.message); process.exit(1) }

  const eligible = captainPlayers.filter(p => !draftedIds.has(p.id))
  if (!eligible.length) { console.error('❌ No eligible players'); process.exit(1) }
  const chosenPlayer = eligible[Math.floor(Math.random() * eligible.length)]
  console.log(`Auto-selecting: ${chosenPlayer.name} (${chosenPlayer.position} / ${chosenPlayer.tier} / OVR ${chosenPlayer.overall_rating})`)

  // 3. Insert pick 1
  const { error: pickErr } = await supabase.from('draft_picks').insert([{
    draft_id:      draft.id,
    pick_number:   1,
    round:         1,
    pick_in_round: 1,
    team_user_id:  pick1UserId,
    player_id:     chosenPlayer.id,
    is_auto_draft: true,
  }])
  if (pickErr) { console.error('❌ Insert pick failed:', pickErr.message); process.exit(1) }
  console.log('✅ Pick 1 inserted')

  // 4. Advance draft: pick 2 → Test FC's turn (snake round 1, pick 2 = last team in order)
  const nextDeadline = new Date(Date.now() + 62_000).toISOString()
  const nextTeamUid  = draftOrder[1] ?? draftOrder[0]  // pick 2 in a snake is index 1
  const { error: updErr } = await supabase.from('drafts').update({
    current_pick_number:   2,
    current_team_user_id:  nextTeamUid,
    pick_deadline:         nextDeadline,
  }).eq('id', draft.id)
  if (updErr) { console.error('❌ Draft update failed:', updErr.message); process.exit(1) }

  console.log(`✅ Draft advanced → pick 2, on the clock: ${nextTeamUid}`)
  console.log(`   Test FC UID: ${TEST_FC_UID}`)
  console.log(`   Is Test FC's turn: ${nextTeamUid === TEST_FC_UID}`)
  console.log('\n✅ Done — refresh the draft page in the browser.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
