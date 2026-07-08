/**
 * Simulates ALL remaining picks to drive the draft to completion.
 * Skips any pick that belongs to TEST_FC_UID (the human tester) and
 * instead auto-picks for them too — so the whole draft finishes.
 * Run: node scripts/sim-to-complete.mjs
 */
import { createClient } from '@supabase/supabase-js'

// Credentials come from .env.local — never hardcode keys in scripts.
const __env = (await import('fs')).readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const __SUPABASE_URL     = __env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const __SERVICE_ROLE_KEY = __env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const __ANON_KEY         = __env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()


const SUPABASE_URL     = __SUPABASE_URL
const SERVICE_ROLE_KEY = __SERVICE_ROLE_KEY
const LEAGUE_ID        = 'a6e06087-1705-4658-b6a3-dee499a35f0a'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function main() {
  const { data: draft } = await supabase
    .from('drafts').select('*').eq('league_id', LEAGUE_ID)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!draft) { console.error('No draft found'); process.exit(1) }
  if (draft.status === 'complete') { console.log('Draft already complete'); process.exit(0) }

  const draftOrder  = draft.draft_order || []
  const totalTeams  = draftOrder.length
  const totalPicks  = (draft.total_rounds || 10) * totalTeams
  console.log(`Draft ${draft.id}  status:${draft.status}  pick:${draft.current_pick_number}/${totalPicks}`)

  // Load all players once
  const { data: allPlayers } = await supabase.from('players')
    .select('id, name, position, tier, overall_rating').eq('is_active', true)

  let pickNum = draft.current_pick_number

  while (pickNum <= totalPicks) {
    // Refresh drafted IDs
    const { data: picks } = await supabase.from('draft_picks').select('player_id').eq('draft_id', draft.id)
    const draftedIds = new Set((picks || []).map(p => p.player_id))

    const eligible = (allPlayers || []).filter(p => !draftedIds.has(p.id))
    if (!eligible.length) { console.error('No eligible players left'); break }

    const chosen = eligible[Math.floor(Math.random() * eligible.length)]

    const round      = Math.ceil(pickNum / totalTeams)
    const posInRound = (pickNum - 1) % totalTeams
    const isOddRound = round % 2 === 1
    const teamIdx    = isOddRound ? posInRound : (totalTeams - 1 - posInRound)
    const teamUid    = draftOrder[teamIdx]

    console.log(`Pick ${pickNum}  round ${round}  team ${teamUid.slice(0,8)}  → ${chosen.name} (${chosen.position}/${chosen.tier})`)

    const { error: pickErr } = await supabase.from('draft_picks').insert([{
      draft_id:      draft.id,
      pick_number:   pickNum,
      round,
      pick_in_round: posInRound + 1,
      team_user_id:  teamUid,
      player_id:     chosen.id,
      is_auto_draft: true,
    }])
    if (pickErr) {
      // Might already exist (e.g. pick 6 was made by the user mid-session)
      if (pickErr.message.includes('duplicate') || pickErr.code === '23505') {
        console.log(`  ↳ already exists, skipping`)
      } else {
        console.error(`  ❌ Insert failed: ${pickErr.message}`)
      }
    }

    pickNum++
  }

  // Mark draft complete
  const { error: doneErr } = await supabase.from('drafts').update({
    status: 'complete',
    current_pick_number: totalPicks + 1,
    current_team_user_id: null,
  }).eq('id', draft.id)
  if (doneErr) console.error('Failed to mark complete:', doneErr.message)
  else console.log('\n✅ Draft marked complete!')
}

main().catch(err => { console.error(err); process.exit(1) })
