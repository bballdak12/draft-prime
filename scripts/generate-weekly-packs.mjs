/**
 * Weekly Pack Generator — Draft Prime
 *
 * Generates one pack per team per active league for the current season week.
 * In production: run every Monday 9AM ET via cron.
 * In test mode (--test): packs are available immediately.
 *
 * Run:
 *   node scripts/generate-weekly-packs.mjs           (production timing)
 *   node scripts/generate-weekly-packs.mjs --test    (available now)
 */

import { createClient } from '@supabase/supabase-js'
import { generatePack }  from '../src/lib/draft/packGenerator.js'

// ── Supabase client (service role bypasses RLS) ───────────────────────────────
const SUPABASE_URL     = 'https://hihbgpkjrzffdzuiqzcp.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGJncGtqcnpmZmR6dWlxemNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjczNzEwNywiZXhwIjoyMDkyMzEzMTA3fQ.P_juXzfqA0JaHxatEE82rpmJ75Gy-yi82gYgoCKCrDI'
const LEAGUE_ID        = 'a6e06087-1705-4658-b6a3-dee499a35f0a'

const TEST_MODE = process.argv.includes('--test')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const hr = label => console.log(`\n${'─'.repeat(62)}\n  ${label}\n${'─'.repeat(62)}`)

// ── Date helpers ──────────────────────────────────────────────────────────────
// Returns the next Monday at 9AM EDT (UTC-4) as a Date.
function nextMonday9amET() {
  const now = new Date()
  const day = now.getUTCDay()                      // 0=Sun … 6=Sat
  const daysUntil = day === 0 ? 1 : (8 - day) % 7 || 7
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + daysUntil)
  monday.setUTCHours(13, 0, 0, 0)                  // 9AM EDT = 13:00 UTC
  return monday
}

// Returns the Sunday after a given Monday at 10:30AM EDT.
function expiryFromMonday(monday) {
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  sunday.setUTCHours(14, 30, 0, 0)                 // 10:30AM EDT = 14:30 UTC
  return sunday
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  hr('DRAFT PRIME — Weekly Pack Generator')
  console.log(`  Mode : ${TEST_MODE ? 'TEST  (packs available immediately)' : 'PRODUCTION'}`)

  // 1. Active season
  const { data: season, error: seasonErr } = await supabase
    .from('app_seasons')
    .select('id, season_number, current_week')
    .eq('status', 'active')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (seasonErr || !season) throw new Error(`No active season: ${seasonErr?.message}`)
  console.log(`  Season ${season.season_number}  ·  Week ${season.current_week}`)

  // 2. Target leagues (hardcoded for now; extend to .neq('status','pending') in prod)
  const { data: leagues, error: lgErr } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('id', LEAGUE_ID)

  if (lgErr || !leagues?.length) throw new Error(`League load failed: ${lgErr?.message}`)
  console.log(`  Leagues: ${leagues.map(l => l.name).join(', ')}`)

  // Pack timing
  const availableFrom = TEST_MODE
    ? new Date().toISOString()
    : nextMonday9amET().toISOString()
  const expiresAt = TEST_MODE
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : expiryFromMonday(new Date(availableFrom)).toISOString()

  console.log(`  Available: ${availableFrom.slice(0, 16)} UTC`)
  console.log(`  Expires  : ${expiresAt.slice(0, 16)} UTC`)

  let totalPacks = 0

  for (const league of leagues) {
    console.log(`\n  ── League: ${league.name} (${league.id.slice(0, 8)}…) ──`)

    // 3. Members
    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)

    if (!members?.length) { console.log('    ⚠  No members — skipping'); continue }

    // 4. Last week's results → determine pack odds per team
    const prevWeek  = season.current_week - 1
    const winnerIds = new Set()
    const loserIds  = new Set()

    if (prevWeek >= 1) {
      const { data: matchups } = await supabase
        .from('weekly_matchups')
        .select('home_team_user_id, away_team_user_id, home_score, away_score')
        .eq('league_id', league.id)
        .eq('season_id', season.id)
        .eq('week', prevWeek)
        .eq('status', 'complete')

      for (const m of (matchups ?? [])) {
        if ((m.home_score ?? 0) > (m.away_score ?? 0)) {
          winnerIds.add(m.home_team_user_id)
          loserIds.add(m.away_team_user_id)
        } else if ((m.away_score ?? 0) > (m.home_score ?? 0)) {
          winnerIds.add(m.away_team_user_id)
          loserIds.add(m.home_team_user_id)
        }
      }

      console.log(`    Week ${prevWeek} results: ${winnerIds.size} winners, ${loserIds.size} losers`)
    }

    // 5. Current roster per user (exclude from pack pool to avoid duplicates)
    const { data: draft } = await supabase
      .from('drafts')
      .select('id')
      .eq('league_id', league.id)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const rosterByUser = {}
    if (draft) {
      const { data: picks } = await supabase
        .from('draft_picks')
        .select('player_id, team_user_id')
        .eq('draft_id', draft.id)
        .is('dropped_at', null)

      for (const p of (picks ?? [])) {
        if (!rosterByUser[p.team_user_id]) rosterByUser[p.team_user_id] = []
        rosterByUser[p.team_user_id].push(p.player_id)
      }
    }

    // 6. Generate one pack per member
    for (const { user_id: userId } of members) {
      // Skip if this week's pack already exists
      const { data: existing } = await supabase
        .from('weekly_packs')
        .select('id')
        .eq('league_id', league.id)
        .eq('season_id', season.id)
        .eq('user_id', userId)
        .eq('week', season.current_week)
        .maybeSingle()

      if (existing) {
        console.log(`    ⏭  ${userId.slice(0, 8)}…  already has week ${season.current_week} pack`)
        continue
      }

      const oddsType = winnerIds.has(userId) ? 'win'
                     : loserIds.has(userId)  ? 'loss'
                     : 'normal'

      const excludeIds = rosterByUser[userId] ?? []
      const cards      = await generatePack(supabase, oddsType, excludeIds)

      if (!cards.length) {
        console.error(`    ✗  ${userId.slice(0, 8)}…  no cards generated`)
        continue
      }

      const { error: insertErr } = await supabase
        .from('weekly_packs')
        .insert({
          league_id:      league.id,
          season_id:      season.id,
          user_id:        userId,
          week:           season.current_week,
          pack_type:      oddsType,
          odds_type:      oddsType,
          cards,
          status:         'pending',
          available_from: availableFrom,
          expires_at:     expiresAt,
        })

      if (insertErr) {
        console.error(`    ✗  ${userId.slice(0, 8)}…  insert failed: ${insertErr.message}`)
        continue
      }

      const best = cards[cards.length - 1]
      console.log(
        `    ✓  ${userId.slice(0, 8)}…  ${oddsType.toUpperCase()} pack` +
        `  ·  ${cards.length} cards` +
        `  ·  best: ${best?.name} (${best?.tier?.toUpperCase()} ${best?.overall_rating} OVR)`
      )
      totalPacks++
    }
  }

  hr(`Done — ${totalPacks} pack${totalPacks !== 1 ? 's' : ''} generated`)
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message)
  process.exit(1)
})
