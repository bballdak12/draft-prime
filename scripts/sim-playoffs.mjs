/**
 * End-to-end playoff simulation for Draft Prime.
 *
 * The real test league only has 2 teams, which cannot exercise a 6-seed
 * bracket. This script provisions a synthetic 12-team league — 12 auth users,
 * a completed 9-round draft, and fabricated final standings — then:
 *
 *   generatePlayoffBracket → runPlayoffWeek(15) → (16) → (17)
 *
 * and verifies a champion is crowned and the right badges are awarded.
 *
 * Prerequisites: migration 017_playoffs.sql applied.
 *
 * Run:  node scripts/sim-playoffs.mjs
 *       node scripts/sim-playoffs.mjs --reset   (tear the sim league down first)
 */
import { createClient } from '@supabase/supabase-js'
import { generatePlayoffBracket } from '../src/lib/playoffs/bracketGenerator.js'
import { runPlayoffWeek } from '../src/lib/playoffs/playoffScoring.js'

// Credentials come from .env.local — never hardcode keys in scripts.
const __env = (await import('fs')).readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const SUPABASE_URL     = __env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_ROLE_KEY = __env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const LEAGUE_NAME = 'Playoff Sim League'
const TEAM_COUNT  = 12
const RESET       = process.argv.includes('--reset')

// Fabricated final standings, best → worst. Seed 1 is 14-0 so season_sweep fires.
// Seeds 4 and 5 are tied on wins to exercise the points_for tiebreak.
const RECORDS = [
  { wins: 14, pf: 1680 }, { wins: 12, pf: 1590 }, { wins: 11, pf: 1544 },
  { wins: 10, pf: 1502 }, { wins: 10, pf: 1477 }, { wins:  8, pf: 1430 },
  { wins:  7, pf: 1388 }, { wins:  6, pf: 1350 }, { wins:  5, pf: 1301 },
  { wins:  4, pf: 1266 }, { wins:  3, pf: 1210 }, { wins:  1, pf: 1155 },
]

const TEAM_NAMES = [
  'Gridiron Ghosts', 'Prime Movers', 'Iron Ravens', 'Neon Blitz',
  'Steel Vipers', 'Crimson Cavalry', 'Dust Devils', 'Fog City Fury',
  'Midnight Maulers', 'Copper Colts', 'Salt Flats SC', 'Rust Belt Rovers',
]

const HELMETS = [
  ['#1B2A4A', '#F0B429', 'stripes'], ['#7A1F2B', '#E8E3D3', 'chevron'],
  ['#0F3D2E', '#C9A227', 'solid'],   ['#2B1B4A', '#39FF88', 'lightning'],
  ['#3A3A3A', '#7FDBFF', 'carbon'],  ['#5A0F1A', '#FFB703', 'fade'],
  ['#8A5A00', '#F2E8CF', 'solid'],   ['#123C69', '#EDC7B7', 'stripes'],
  ['#12121C', '#B388EB', 'chevron'], ['#7C4A02', '#FFE8A3', 'solid'],
  ['#0B5563', '#F5F5F5', 'fade'],    ['#4A2C0F', '#D96C06', 'carbon'],
]

const hr    = label => console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`)
const short = id => id.slice(0, 8)

// PostgREST truncates every select at 1000 rows without erroring; players and
// player_seasons are both well past that, so reads here have to page.
const PAGE = 1000
async function fetchAll(makeQuery, label) {
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
async function reset() {
  const { data: leagues } = await sb.from('leagues').select('id').eq('name', LEAGUE_NAME)
  for (const l of leagues ?? []) {
    // playoff_matchups.feeds_into_matchup_id is ON DELETE SET NULL, and the
    // league FK is ON DELETE CASCADE, so dropping the league clears everything.
    await sb.from('leagues').delete().eq('id', l.id)
    console.log(`  removed league ${short(l.id)}`)
  }

  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 })
  for (const u of users.filter(u => u.email?.startsWith('playoffsim'))) {
    await sb.from('user_badges').delete().eq('user_id', u.id)
    await sb.from('profiles').delete().eq('id', u.id)
    await sb.auth.admin.deleteUser(u.id)
  }
  console.log('  removed sim users + badges')
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------
async function ensureUsers() {
  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const byEmail = Object.fromEntries(users.map(u => [u.email, u]))
  const ids = []

  for (let i = 0; i < TEAM_COUNT; i++) {
    const email = `playoffsim${i + 1}@draftprime.test`
    let user = byEmail[email]

    if (!user) {
      const { data, error } = await sb.auth.admin.createUser({ email, password: 'SimTest123!', email_confirm: true })
      if (error) throw new Error(`createUser ${email}: ${error.message}`)
      user = data.user
    }

    const [base, secondary, pattern] = HELMETS[i]
    const { error: pErr } = await sb.from('profiles').upsert({
      id: user.id, email, display_name: `Sim ${i + 1}`, team_name: TEAM_NAMES[i],
      helmet_color: base, helmet_secondary: secondary, helmet_pattern: pattern,
    })
    if (pErr) throw new Error(`profile upsert ${email}: ${pErr.message}`)

    ids.push(user.id)
  }
  console.log(`  ${TEAM_COUNT} users + profiles ready`)
  return ids
}

async function ensureLeague(userIds) {
  const { data: existing } = await sb.from('leagues').select('id').eq('name', LEAGUE_NAME).maybeSingle()
  if (existing) return existing.id

  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { data: league, error } = await sb.from('leagues')
    .insert({ name: LEAGUE_NAME, invite_code: code, created_by: userIds[0],
              max_teams: TEAM_COUNT, scoring_type: 'half_ppr', status: 'setup' })
    .select('id').single()
  if (error) throw new Error(`league insert: ${error.message}`)

  const members = userIds.map((uid, i) => ({
    league_id: league.id, user_id: uid, is_commissioner: i === 0, is_bot: i !== 0,
  }))
  const { error: mErr } = await sb.from('league_members').insert(members)
  if (mErr) throw new Error(`league_members insert: ${mErr.message}`)

  console.log(`  league ${short(league.id)} created with ${TEAM_COUNT} members`)
  return league.id
}

/**
 * Players with at least one usable (non-injury) game inside a prime season,
 * grouped by position and sorted by overall rating.
 */
async function draftablePlayers() {
  const players = await fetchAll(
    () => sb.from('players').select('id, name, position, overall_rating, prime_seasons_count').order('id'),
    'players')
  const seasons = await fetchAll(
    () => sb.from('player_seasons').select('id, player_id, season_rank').eq('is_eligible', true).order('id'),
    'player_seasons')

  const pm    = Object.fromEntries(players.map(p => [p.id, p]))
  const prime = seasons.filter(s => pm[s.player_id] && s.season_rank <= (pm[s.player_id].prime_seasons_count ?? 1))

  // Only keep prime seasons that actually have playable games.
  const ids     = prime.map(s => s.id)
  const hasGame = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const g = await fetchAll(
      () => sb.from('player_games').select('player_season_id')
              .in('player_season_id', chunk).eq('injury_flag', false).order('id'),
      'player_games')
    for (const r of g) hasGame.add(r.player_season_id)
  }

  const usable = [...new Set(prime.filter(s => hasGame.has(s.id)).map(s => s.player_id))]
  const byPos  = {}
  for (const pid of usable) {
    const p = pm[pid]
    ;(byPos[p.position] ??= []).push(p)
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0))
  }
  return byPos
}

/**
 * Deal each team a full lineup: QB, RB×2, WR×3, TE, DST, K (9 starters).
 *
 * Only 6 players in the pool are TEs with prime-season data, so TEs are dealt
 * round-robin and shared across teams. draft_picks has no uniqueness constraint
 * on player_id, and the scoring engine's used-game exclusion keys on
 * player_id:game_id, so two teams sharing a TE simply draw different games.
 */
async function ensureDraft(leagueId, userIds) {
  const { data: existing } = await sb.from('drafts').select('id').eq('league_id', leagueId).maybeSingle()
  if (existing) return existing.id

  const pool = await draftablePlayers()
  const need = { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1, K: 1 }

  for (const [pos, per] of Object.entries(need)) {
    if (!pool[pos]?.length) throw new Error(`No draftable players at ${pos}`)
    const deficit = TEAM_COUNT * per - pool[pos].length
    if (deficit > 0) console.log(`  ⚠ ${pos}: ${pool[pos].length} available for ${TEAM_COUNT * per} slots — sharing ${deficit}`)
  }

  const { data: draft, error: dErr } = await sb.from('drafts')
    .insert({ league_id: leagueId, status: 'complete', draft_order: userIds,
              total_rounds: 9, current_pick_number: TEAM_COUNT * 9 })
    .select('id').single()
  if (dErr) throw new Error(`draft insert: ${dErr.message}`)

  const cursor = Object.fromEntries(Object.keys(need).map(p => [p, 0]))
  const picks  = []
  let   pickNo = 1

  for (let t = 0; t < TEAM_COUNT; t++) {
    let roundInTeam = 1
    for (const [pos, per] of Object.entries(need)) {
      for (let k = 0; k < per; k++) {
        const list   = pool[pos]
        const player = list[cursor[pos] % list.length]   // wraps → shared player
        cursor[pos]++
        picks.push({
          draft_id: draft.id, pick_number: pickNo, round: roundInTeam,
          pick_in_round: t + 1, team_user_id: userIds[t], player_id: player.id,
        })
        pickNo++
        roundInTeam++
      }
    }
  }

  const { error: pErr } = await sb.from('draft_picks').insert(picks)
  if (pErr) throw new Error(`draft_picks insert: ${pErr.message}`)

  console.log(`  draft ${short(draft.id)} complete — ${picks.length} picks`)
  return draft.id
}

async function seedStandings(leagueId, seasonId, userIds) {
  await sb.from('league_standings').delete().eq('league_id', leagueId).eq('season_id', seasonId)

  const rows = userIds.map((uid, i) => ({
    season_id: seasonId, league_id: leagueId, user_id: uid,
    wins: RECORDS[i].wins, losses: 14 - RECORDS[i].wins,
    points_for: RECORDS[i].pf, points_against: 1400,
    current_streak: 1, longest_streak: RECORDS[i].wins,
  }))

  const { error } = await sb.from('league_standings').insert(rows)
  if (error) throw new Error(`standings insert: ${error.message}`)
  console.log(`  standings seeded (seed 1 = ${RECORDS[0].wins}-0)`)
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
async function printBracket(leagueId, seasonId, names) {
  const { data: brackets } = await sb.from('playoff_brackets')
    .select('id, bracket_type, playoff_matchups(round, week, high_seed, low_seed, high_seed_user_id, low_seed_user_id, high_score, low_score, winner_user_id, status)')
    .eq('league_id', leagueId).eq('season_id', seasonId)

  for (const b of brackets ?? []) {
    console.log(`\n  ${b.bracket_type.toUpperCase()}`)
    const sorted = [...b.playoff_matchups].sort((a, z) => a.round - z.round || (a.high_seed ?? 0) - (z.high_seed ?? 0))
    for (const m of sorted) {
      const side = (uid, seed, score) =>
        uid ? `#${seed} ${names[uid].padEnd(18)} ${Number(score).toFixed(1).padStart(6)}` : '— tbd —'.padEnd(28)
      const flag = m.winner_user_id
        ? `→ ${names[m.winner_user_id]}${m.winner_user_id === m.low_seed_user_id ? '  💥 UPSET' : ''}`
        : `(${m.status})`
      console.log(`   R${m.round} wk${m.week}  ${side(m.high_seed_user_id, m.high_seed, m.high_score)}  vs  ${side(m.low_seed_user_id, m.low_seed, m.low_score)}  ${flag}`)
    }
  }
}

async function printBadges(userIds, names) {
  const { data: badges } = await sb.from('user_badges')
    .select('user_id, badge_id, level, count').in('user_id', userIds)

  const playoffBadges = ['playoff_hunter', 'season_sweep', 'bracket_buster', 'league_champion', 'runner_up', 'redemption_arc']
  const grouped = {}
  for (const b of badges ?? []) {
    if (!playoffBadges.includes(b.badge_id)) continue
    ;(grouped[b.badge_id] ??= []).push(`${names[b.user_id]} (${b.level}${b.count > 1 ? ` ×${b.count}` : ''})`)
  }

  for (const id of playoffBadges) {
    const holders = grouped[id] ?? []
    console.log(`   ${holders.length ? '✅' : '❌'} ${id.padEnd(16)} ${holders.join(', ') || '— none —'}`)
  }
  return grouped
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  hr('DRAFT PRIME — Playoff Simulation')

  if (RESET) { hr('RESET'); await reset() }

  const { data: season } = await sb.from('app_seasons')
    .select('id, current_week').eq('status', 'active')
    .order('season_number', { ascending: false }).limit(1).maybeSingle()
  if (!season) { console.error('❌ No active season'); process.exit(1) }

  const { error: probe } = await sb.from('playoff_brackets').select('id').limit(1)
  if (probe) {
    console.error(`\n❌ playoff tables missing — apply supabase/migrations/017_playoffs.sql first.\n   (${probe.message})`)
    process.exit(1)
  }

  hr('PROVISION')
  const userIds  = await ensureUsers()
  const leagueId = await ensureLeague(userIds)
  await ensureDraft(leagueId, userIds)
  await seedStandings(leagueId, season.id, userIds)

  const { data: profs } = await sb.from('profiles').select('id, team_name').in('id', userIds)
  const names = Object.fromEntries(profs.map(p => [p.id, p.team_name]))

  hr('PHASE 2: generatePlayoffBracket')
  const gen = await generatePlayoffBracket(sb, leagueId, season.id)
  if (gen.skipped) {
    console.log(`  ⚠ ${gen.reason}`)
  } else {
    for (const b of gen.brackets) console.log(`  ${b.bracketType.padEnd(13)} ${b.teams} teams, ${b.matchups} matchups`)
    console.log(`  playoff_hunter → ${gen.playoffTeams} teams`)
    console.log(`  season_sweep   → ${gen.sweepers.map(u => names[u]).join(', ') || 'none'}`)
  }
  await printBracket(leagueId, season.id, names)

  hr('PHASE 3: playoff weeks')
  let champion = null
  let totalSkipped = 0
  for (const week of [15, 16, 17]) {
    await sb.from('app_seasons').update({ current_week: week }).eq('id', season.id)
    const res = await runPlayoffWeek(sb, leagueId, week, season.id)
    totalSkipped += res.skippedPlayers
    const skipNote = res.skippedPlayers ? `  ⚠ ${res.skippedPlayers} players had no drawable game` : ''
    console.log(`\n  week ${week}: ${res.matchupsProcessed} matchups, ${res.teams.length} teams scored${skipNote}`)
    for (const r of res.results) {
      console.log(`    ${r.bracket.padEnd(13)} R${r.round}  ${r.highScore.toFixed(1)} – ${r.lowScore.toFixed(1)}  → ${names[r.winnerId]}${r.upset ? '  💥' : ''}`)
    }
    if (res.champion) champion = res.champion
  }

  hr('FINAL BRACKET')
  await printBracket(leagueId, season.id, names)

  hr('PHASE 4: badges')
  const grouped = await printBadges(userIds, names)

  hr('VERIFY')
  const checks = [
    ['champion crowned',       !!champion,                              champion ? names[champion] : 'none'],
    ['runner_up awarded',      !!grouped.runner_up,                     grouped.runner_up?.[0] ?? 'none'],
    ['playoff_hunter × 6',     grouped.playoff_hunter?.length === 6,    `${grouped.playoff_hunter?.length ?? 0} teams`],
    ['season_sweep (14-0)',    grouped.season_sweep?.length === 1,      grouped.season_sweep?.[0] ?? 'none'],
    ['redemption_arc awarded', !!grouped.redemption_arc,                grouped.redemption_arc?.[0] ?? 'none'],
    ['every starter scored',   totalSkipped === 0,                      `${totalSkipped} players skipped`],
  ]
  let failed = 0
  for (const [label, ok, detail] of checks) {
    if (!ok) failed++
    console.log(`   ${ok ? '✅' : '❌'} ${label.padEnd(24)} ${detail}`)
  }
  // bracket_buster only fires if a lower seed actually won — not guaranteed.
  console.log(`   ${grouped.bracket_buster ? '✅' : 'ℹ️ '} bracket_buster${' '.repeat(11)}${grouped.bracket_buster?.join(', ') ?? 'no upsets this run'}`)

  console.log(`\n  League: ${leagueId}`)
  console.log(`  Season current_week left at 17 — bracket page renders the final round.`)
  console.log(failed ? `\n❌ ${failed} check(s) failed\n` : `\n✅ All checks passed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch(err => { console.error('\n❌', err.message, '\n', err.stack); process.exit(1) })
