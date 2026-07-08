/**
 * End-to-end scoring engine test for Draft Prime.
 *
 * Tests: selectWeeklyGames → generateSchedule → calculateMatchupScores
 *
 * Prerequisites:
 *   - Migration 008_scoring_tables.sql applied
 *   - Draft status = 'complete' for LEAGUE_ID
 *
 * Run: node scripts/test-scoring.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { selectWeeklyGames, calculateMatchupScores, revealWeeklyGames } from '../src/lib/scoring/gameSelector.js'
import { generateSchedule } from '../src/lib/scoring/scheduleGenerator.js'

// Credentials come from .env.local — never hardcode keys in scripts.
const __env = (await import('fs')).readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const __SUPABASE_URL     = __env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const __SERVICE_ROLE_KEY = __env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const __ANON_KEY         = __env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()


const SUPABASE_URL     = __SUPABASE_URL
const SERVICE_ROLE_KEY = __SERVICE_ROLE_KEY
const LEAGUE_ID        = 'a6e06087-1705-4658-b6a3-dee499a35f0a'
const WEEK             = 1

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const hr = (label) => console.log(`\n${'─'.repeat(56)}\n  ${label}\n${'─'.repeat(56)}`)

async function main() {
  hr('DRAFT PRIME — Scoring Engine End-to-End Test')

  // ── 0. Validate prerequisites ──────────────────────────────────────────────
  const { data: season } = await supabase
    .from('app_seasons').select('id, season_number, current_week')
    .eq('status', 'active').order('season_number', { ascending: false }).limit(1).maybeSingle()

  if (!season) {
    console.error('❌ No active season. Run migration 008 first.')
    process.exit(1)
  }
  console.log(`\n✅ Season #${season.season_number}  (id: ${season.id.slice(0,8)}…)  week: ${season.current_week}`)

  const { data: draft } = await supabase
    .from('drafts').select('id, status').eq('league_id', LEAGUE_ID)
    .eq('status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!draft) { console.error('❌ No completed draft.'); process.exit(1) }

  const { data: allPicks } = await supabase.from('draft_picks').select('player_id, team_user_id').eq('draft_id', draft.id)
  const teams = [...new Set((allPicks || []).map(p => p.team_user_id))]
  console.log(`✅ Draft complete — ${allPicks?.length} picks across ${teams.length} teams`)

  // ── 1. selectWeeklyGames ───────────────────────────────────────────────────
  hr(`PHASE 1: selectWeeklyGames  (week ${WEEK})`)

  let result
  try {
    result = await selectWeeklyGames(supabase, LEAGUE_ID, WEEK, season.id)
  } catch (err) {
    console.error('❌', err.message)
    process.exit(1)
  }

  if (result.skipped) {
    console.log(`⚠  Already scored: ${result.reason}`)
  } else {
    console.log(`\n✅ Inserted ${result.count} weekly_player_scores`)
    console.log(`   Teams processed : ${result.teamsProcessed}`)
    console.log(`   Players skipped : ${result.skippedPlayers} (no eligible game data)`)
  }

  // ── 2. Read back scores with player + game details ─────────────────────────
  const { data: scored, error: se } = await supabase
    .from('weekly_player_scores')
    .select(`
      user_id, is_starter, slot, score,
      players ( name, tier, position, overall_rating ),
      player_games ( season, week, opponent, is_playoff, half_ppr_adjusted )
    `)
    .eq('league_id', LEAGUE_ID)
    .eq('season_id', season.id)
    .eq('week', WEEK)
    .order('score', { ascending: false })

  if (se) {
    console.warn('⚠  Read-back failed:', se.message)
  } else {
    const totalRows = scored?.length ?? 0
    console.log(`\n📊 Total player score rows: ${totalRows}`)

    // Sample 3 starters with full details
    const sample = (scored ?? []).filter(r => r.is_starter).slice(0, 3)
    console.log('\n📋 Sample: 3 starter scores with historical game details')
    console.log(`   ${'SLOT'.padEnd(6)} ${'PLAYER'.padEnd(28)} ${'TIER'.padEnd(7)} ${'OVR'.padEnd(4)} ${'SEASON'.padEnd(7)} ${'WK'.padEnd(4)} ${'OPP'.padEnd(5)} ${'PLY'.padEnd(4)} SCORE`)
    console.log('   ' + '─'.repeat(80))
    for (const row of sample) {
      const p   = row.players
      const g   = row.player_games
      const ply = g?.is_playoff ? 'PO' : '--'
      console.log([
        '  ',
        (row.slot ?? '?').padEnd(6),
        (p?.name ?? 'Unknown').slice(0, 27).padEnd(28),
        (p?.tier ?? '?').padEnd(7),
        String(p?.overall_rating ?? '?').padEnd(4),
        String(g?.season ?? '?').padEnd(7),
        String(g?.week ?? '?').padEnd(4),
        (g?.opponent ?? '?').padEnd(5),
        ply.padEnd(4),
        row.score?.toFixed(2) ?? '0.00',
      ].join(' '))
    }

    // Team totals
    const totals = {}
    for (const row of (scored ?? [])) {
      if (!row.is_starter) continue
      totals[row.user_id] = (totals[row.user_id] ?? 0) + (row.score ?? 0)
    }
    console.log('\n🏆 Starter totals per team:')
    for (const [uid, pts] of Object.entries(totals)) {
      console.log(`   ${uid.slice(0, 8)}…  →  ${pts.toFixed(2)} pts`)
    }
  }

  // ── 3. generateSchedule ───────────────────────────────────────────────────
  hr('PHASE 2: generateSchedule')

  const members = teams.map(uid => ({ user_id: uid }))

  // Check if schedule already exists
  const { count: existingMatchups } = await supabase
    .from('weekly_matchups').select('*', { count: 'exact', head: true })
    .eq('league_id', LEAGUE_ID).eq('season_id', season.id)

  let schedule
  if (existingMatchups > 0) {
    console.log(`⚠  Schedule already exists (${existingMatchups} matchups) — skipping insert`)
    const { data: existing } = await supabase
      .from('weekly_matchups').select('week, home_team_user_id, away_team_user_id, home_score, away_score, status')
      .eq('league_id', LEAGUE_ID).eq('season_id', season.id).order('week').limit(6)
    schedule = existing
  } else {
    try {
      const rows = generateSchedule(members, season.id, LEAGUE_ID)
      console.log(`\n   Generated ${rows.length} matchup rows (${members.length} teams × 14 weeks / 2)`)

      const { error: schErr } = await supabase.from('weekly_matchups').insert(rows)
      if (schErr) throw new Error(schErr.message)
      console.log('✅ Schedule inserted')

      const { data: inserted } = await supabase
        .from('weekly_matchups').select('week, home_team_user_id, away_team_user_id, status')
        .eq('league_id', LEAGUE_ID).eq('season_id', season.id).order('week').limit(6)
      schedule = inserted
    } catch (err) {
      console.error('❌ generateSchedule failed:', err.message)
      schedule = []
    }
  }

  console.log('\n📅 First 3 weeks of schedule:')
  const seen = new Set()
  for (const m of (schedule ?? [])) {
    if (seen.size >= 3 && !seen.has(m.week)) break
    seen.add(m.week)
    const hw = m.home_team_user_id?.slice(0, 8) ?? '?'
    const aw = m.away_team_user_id?.slice(0, 8) ?? '?'
    const sc = m.home_score != null ? `  [${Number(m.home_score).toFixed(1)} – ${Number(m.away_score).toFixed(1)}]` : ''
    console.log(`   Week ${String(m.week).padEnd(3)}  ${hw}… vs ${aw}…${sc}  (${m.status ?? 'scheduled'})`)
  }

  // ── 4. calculateMatchupScores ─────────────────────────────────────────────
  hr('PHASE 3: calculateMatchupScores  (week 1)')

  // Only run if week 1 matchup not already complete
  const { data: wk1matchup } = await supabase
    .from('weekly_matchups').select('status, home_score, away_score, home_team_user_id, away_team_user_id')
    .eq('league_id', LEAGUE_ID).eq('season_id', season.id).eq('week', 1).limit(1)

  if (wk1matchup?.[0]?.status === 'complete') {
    const m = wk1matchup[0]
    console.log(`\n⚠  Week 1 already complete`)
    console.log(`   ${m.home_team_user_id.slice(0,8)}…  ${Number(m.home_score).toFixed(2)}  vs  ${Number(m.away_score).toFixed(2)}  …${m.away_team_user_id.slice(0,8)}`)
  } else if (!wk1matchup?.length) {
    console.log('\n⚠  No week 1 matchup found — schedule insert may have failed above')
  } else {
    try {
      const result = await calculateMatchupScores(supabase, LEAGUE_ID, WEEK)
      console.log(`\n✅ calculateMatchupScores complete — ${result.matchupsProcessed} matchup(s) processed`)
      for (const [uid, pts] of Object.entries(result.teamScores)) {
        console.log(`   ${uid.slice(0,8)}…  →  ${pts.toFixed(2)} pts (starters)`)
      }

      const { data: final } = await supabase
        .from('weekly_matchups').select('home_team_user_id, away_team_user_id, home_score, away_score, status')
        .eq('league_id', LEAGUE_ID).eq('season_id', season.id).eq('week', 1)

      console.log('\n📊 Final week 1 matchup result:')
      for (const m of (final ?? [])) {
        const h = m.home_team_user_id.slice(0, 8)
        const a = m.away_team_user_id.slice(0, 8)
        const winner = m.home_score > m.away_score ? `${h}… WINS` : `${a}… WINS`
        console.log(`   ${h}… ${Number(m.home_score).toFixed(2)}  vs  ${Number(m.away_score).toFixed(2)}  ${a}…   → ${winner}`)
      }

      // Standings
      const { data: standings } = await supabase
        .from('league_standings').select('user_id, wins, losses, points_for, points_against, current_streak')
        .eq('league_id', LEAGUE_ID).eq('season_id', season.id).order('wins', { ascending: false })

      console.log('\n🏅 League standings after week 1:')
      console.log(`   ${'TEAM'.padEnd(12)} ${'W'.padEnd(3)} ${'L'.padEnd(3)} ${'PF'.padEnd(8)} ${'PA'.padEnd(8)} STREAK`)
      for (const row of (standings ?? [])) {
        const streak = row.current_streak > 0 ? `W${row.current_streak}` : `L${Math.abs(row.current_streak)}`
        console.log(`   ${row.user_id.slice(0,8)}…   ${String(row.wins).padEnd(3)} ${String(row.losses).padEnd(3)} ${row.points_for.toFixed(2).padEnd(8)} ${row.points_against.toFixed(2).padEnd(8)} ${streak}`)
      }
    } catch (err) {
      console.error('❌ calculateMatchupScores failed:', err.message)
    }
  }

  console.log('\n✅ Test complete.\n')
}

main().catch(err => { console.error('\n❌ Fatal:', err.message, err.stack); process.exit(1) })
