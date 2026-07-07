/**
 * Seeds sample league_activity events for the test league (one per event
 * type) so the feed has content to render. Service-role writes — run after
 * migration 014 has been applied.
 *
 * Run: node scripts/seed-activity-events.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env   = readFileSync(join(__dir, '../.env.local'), 'utf8')
const URL   = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const KEY   = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()

const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const hoursAgo = h => new Date(Date.now() - h * 3600_000).toISOString()

// ── Pick the test league (first league with a complete draft, else first) ────
const { data: leagues, error: lgErr } = await sb
  .from('leagues').select('id, name').order('created_at')
if (lgErr) throw new Error(`League lookup failed: ${lgErr.message}`)
if (!leagues?.length) throw new Error('No leagues found')

let league = leagues[0]
for (const lg of leagues) {
  const { data: d } = await sb
    .from('drafts').select('id').eq('league_id', lg.id).eq('status', 'complete').limit(1).maybeSingle()
  if (d) { league = lg; break }
}
console.log(`Seeding activity for league "${league.name}" (${league.id})`)

// ── Supporting data ──────────────────────────────────────────────────────────
const { data: season } = await sb
  .from('app_seasons').select('id, current_week')
  .eq('status', 'active')
  .order('season_number', { ascending: false }).limit(1).maybeSingle()

const { data: memberRows } = await sb
  .from('league_members').select('user_id, is_commissioner')
  .eq('league_id', league.id).order('joined_at')
const userIds = (memberRows ?? []).map(m => m.user_id)
if (userIds.length < 2) throw new Error('Need at least 2 league members to seed')

const { data: profiles } = await sb
  .from('profiles').select('id, team_name, display_name').in('id', userIds)
const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
const teamName = uid => pMap[uid]?.team_name || pMap[uid]?.display_name || 'Unknown'

const [userA, userB] = userIds

// A few real player names for realistic payloads
const { data: somePlayers } = await sb
  .from('players').select('name, tier, overall_rating')
  .in('tier', ['gold', 'hero'])
  .order('overall_rating', { ascending: false })
  .limit(4)
const [p1, p2, p3, p4] = somePlayers ?? []

// ── Events (one per type, staggered timestamps) ──────────────────────────────
const events = [
  {
    league_id: league.id, season_id: null, user_id: userB,
    event_type: 'member_joined',
    payload: { team_name: teamName(userB) },
    created_at: hoursAgo(96),
  },
  {
    league_id: league.id, season_id: season?.id ?? null, user_id: null,
    event_type: 'draft_complete',
    payload: {},
    created_at: hoursAgo(72),
  },
  {
    league_id: league.id, season_id: season?.id ?? null, user_id: null,
    event_type: 'matchup_final',
    payload: {
      week: season?.current_week ?? 1,
      home_name: teamName(userA), away_name: teamName(userB),
      home_score: 52.3, away_score: 18.0,
      winner_name: teamName(userA),
    },
    created_at: hoursAgo(48),
  },
  {
    league_id: league.id, season_id: season?.id ?? null, user_id: userA,
    event_type: 'trade_accepted',
    payload: {
      proposer_name: teamName(userA), receiver_name: teamName(userB),
      gave: [p3?.name ?? 'Malik Nabers'], got: [p4?.name ?? 'Justin Herbert'],
    },
    created_at: hoursAgo(20),
  },
  {
    league_id: league.id, season_id: season?.id ?? null, user_id: userA,
    event_type: 'pack_opened',
    payload: {
      player_name: p1?.name ?? 'Russell Wilson',
      tier: p1?.tier ?? 'gold',
      ovr: p1?.overall_rating ?? 89,
      dropped_player_name: p2?.name,
    },
    created_at: hoursAgo(2),
  },
]

const { error: insErr } = await sb.from('league_activity').insert(events)
if (insErr) throw new Error(`Insert failed: ${insErr.message}`)

console.log(`✅ Seeded ${events.length} activity events:`)
for (const e of events) console.log(`   ${e.event_type.padEnd(15)} ${JSON.stringify(e.payload).slice(0, 90)}`)
