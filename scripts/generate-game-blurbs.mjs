/**
 * Generates AI game recaps for each rostered player's historical game and saves
 * them permanently to weekly_player_scores.game_blurb. Blurbs are written as if
 * recapping the real NFL game — never mentioning fantasy football — and are
 * never regenerated once set.
 *
 * Model: claude-sonnet-4-6 (thinking disabled, low effort — short creative task).
 * Reads ANTHROPIC_API_KEY + Supabase creds from .env.local (never hardcoded).
 *
 * Usage:
 *   node scripts/generate-game-blurbs.mjs                 # all leagues, all finalized weeks
 *   node scripts/generate-game-blurbs.mjs <leagueId>      # one league
 *   node scripts/generate-game-blurbs.mjs <leagueId> <week>
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const env   = readFileSync(join(__dir, '../.env.local'), 'utf8')
const need  = k => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'))
  if (!m) throw new Error(`${k} missing from .env.local`)
  return m[1].trim()
}

const SUPABASE_URL = need('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY')
const API_KEY      = need('ANTHROPIC_API_KEY')

const MODEL       = 'claude-sonnet-4-6'
const CONCURRENCY = 4
// Sonnet 4.6 pricing (USD per 1M tokens)
const PRICE_IN  = 3.0
const PRICE_OUT = 15.0

const sb        = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: API_KEY })

const [argLeague, argWeek] = process.argv.slice(2)

// ─── Stat line builders (human-readable, per position) ──────────────────────────
const n = v => v ?? 0
function statLine(g, position) {
  const pos = (position || '').toUpperCase()
  const parts = []

  if (pos === 'QB') {
    parts.push(`${n(g.pass_comp)}/${n(g.pass_att)} passing for ${n(g.pass_yds)} yards, ${n(g.pass_td)} TD, ${n(g.pass_int)} INT`)
    if (n(g.rush_yds) || n(g.rush_td)) parts.push(`${n(g.rush_att)} carries for ${n(g.rush_yds)} rushing yards and ${n(g.rush_td)} TD`)
  } else if (pos === 'RB') {
    parts.push(`${n(g.rush_att)} carries for ${n(g.rush_yds)} yards and ${n(g.rush_td)} rushing TD`)
    if (n(g.receptions) || n(g.rec_yds)) parts.push(`${n(g.receptions)} catches for ${n(g.rec_yds)} yards and ${n(g.rec_td)} receiving TD`)
  } else if (pos === 'WR' || pos === 'TE') {
    parts.push(`${n(g.receptions)} catches on ${n(g.targets)} targets for ${n(g.rec_yds)} yards and ${n(g.rec_td)} TD`)
    if (n(g.rush_yds)) parts.push(`${n(g.rush_att)} carries for ${n(g.rush_yds)} rushing yards and ${n(g.rush_td)} TD`)
  } else if (pos === 'K') {
    const fg = []
    if (n(g.fg_att_under40)) fg.push(`${n(g.fg_made_under40)}/${n(g.fg_att_under40)} under 40`)
    if (n(g.fg_att_40_49))   fg.push(`${n(g.fg_made_40_49)}/${n(g.fg_att_40_49)} from 40-49`)
    if (n(g.fg_att_50plus))  fg.push(`${n(g.fg_made_50plus)}/${n(g.fg_att_50plus)} from 50+`)
    parts.push(`field goals: ${fg.length ? fg.join(', ') : 'none attempted'}`)
    parts.push(`${n(g.pat_made)}/${n(g.pat_att)} extra points`)
  } else if (pos === 'DST') {
    const d = []
    if (n(g.dst_sacks))      d.push(`${n(g.dst_sacks)} sacks`)
    if (n(g.dst_int))        d.push(`${n(g.dst_int)} interceptions`)
    if (n(g.dst_fumble_rec)) d.push(`${n(g.dst_fumble_rec)} fumble recoveries`)
    if (n(g.dst_def_td))     d.push(`${n(g.dst_def_td)} defensive TD`)
    if (n(g.dst_safety))     d.push(`${n(g.dst_safety)} safeties`)
    if (g.dst_pts_allowed != null) d.push(`${g.dst_pts_allowed} points allowed`)
    parts.push(d.length ? d.join(', ') : 'a quiet outing')
  } else {
    parts.push('no stats recorded')
  }
  return parts.join('; ')
}

// ─── Prompt ─────────────────────────────────────────────────────────────────────
const SYSTEM =
  'You are a sports journalist writing brief game recaps. Write a 2-3 sentence recap ' +
  'of the given NFL performance as if recapping the real historical game. Do NOT mention ' +
  'fantasy football, fantasy points, rosters, or scoring. Write in a punchy, vivid ' +
  'sports-journalism style. Output only the recap — no preamble, no headline.'

function userPrompt(player, g) {
  const where = g.home_away === 'away' ? 'at' : g.home_away === 'home' ? 'vs' : 'vs'
  const playoff = g.is_playoff ? ' (playoffs)' : ''
  return [
    `Player: ${player.name}, ${player.position}${player.team ? `, ${player.team}` : ''}${player.era ? ` (${player.era} era)` : ''}`,
    `Game: ${g.season} Week ${g.week}${playoff} ${where} ${g.opponent ?? 'opponent'}`,
    `Stat line: ${statLine(g, player.position)}`,
  ].join('\n')
}

// ─── One blurb, with a single retry ─────────────────────────────────────────────
async function generateBlurb(player, game) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 320,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt(player, game) }],
      })
      if (msg.stop_reason === 'refusal') throw new Error('model refused')
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      if (!text) throw new Error('empty response')
      return { text, usage: msg.usage }
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  ⚠ skipped ${player.name} (${game.season} Wk ${game.week}): ${err.message}`)
        return null
      }
    }
  }
}

// ─── Batch a list with fixed concurrency ────────────────────────────────────────
async function runBatched(items, worker) {
  let i = 0
  const results = []
  async function next() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, next))
  return results
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // Which (league, season, week) combos are finalized?
  let mq = sb.from('weekly_matchups').select('league_id, season_id, week').eq('status', 'complete')
  if (argLeague) mq = mq.eq('league_id', argLeague)
  if (argWeek)   mq = mq.eq('week', Number(argWeek))
  const { data: completeMatchups, error: mErr } = await mq
  if (mErr) throw new Error(`Matchup lookup failed: ${mErr.message}`)

  const completeKeys = new Set((completeMatchups ?? []).map(m => `${m.league_id}:${m.season_id}:${m.week}`))
  if (completeKeys.size === 0) {
    console.log('No finalized weeks match the given filters. Nothing to do.')
    return
  }

  // Score rows lacking a blurb
  let sq = sb.from('weekly_player_scores')
    .select('id, league_id, season_id, week, player_id, game_id')
    .is('game_blurb', null)
    .not('game_id', 'is', null)
  if (argLeague) sq = sq.eq('league_id', argLeague)
  if (argWeek)   sq = sq.eq('week', Number(argWeek))
  const { data: allRows, error: sErr } = await sq
  if (sErr) throw new Error(`Score lookup failed: ${sErr.message}`)

  const rows = (allRows ?? []).filter(r => completeKeys.has(`${r.league_id}:${r.season_id}:${r.week}`))
  if (rows.length === 0) {
    console.log('All finalized-week scores already have blurbs. Nothing to do.')
    return
  }

  // Bulk-load the games and players these rows reference
  const gameIds   = [...new Set(rows.map(r => r.game_id))]
  const playerIds = [...new Set(rows.map(r => r.player_id))]
  const [{ data: games }, { data: players }] = await Promise.all([
    sb.from('player_games').select('*').in('id', gameIds),
    sb.from('players').select('id, name, position, team, era').in('id', playerIds),
  ])
  const gameMap   = Object.fromEntries((games ?? []).map(g => [g.id, g]))
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))

  console.log(`Generating ${rows.length} blurb(s) with ${MODEL} (concurrency ${CONCURRENCY})…\n`)

  let inTok = 0, outTok = 0, saved = 0, skipped = 0

  await runBatched(rows, async (row) => {
    const player = playerMap[row.player_id]
    const game   = gameMap[row.game_id]
    if (!player || !game) { skipped++; console.warn(`  ⚠ missing player/game for score ${row.id}`); return }

    const result = await generateBlurb(player, game)
    if (!result) { skipped++; return }

    inTok  += result.usage.input_tokens
    outTok += result.usage.output_tokens

    const { error: upErr } = await sb
      .from('weekly_player_scores')
      .update({ game_blurb: result.text })
      .eq('id', row.id)
      .is('game_blurb', null)   // never overwrite an existing blurb
    if (upErr) { skipped++; console.warn(`  ⚠ save failed for ${player.name}: ${upErr.message}`); return }

    saved++
    console.log(`  ✅ ${player.name} — ${game.season} Wk ${game.week} vs ${game.opponent}`)
  })

  const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT
  console.log(`\n─────────────────────────────`)
  console.log(`Saved: ${saved}   Skipped: ${skipped}`)
  console.log(`Tokens: ${inTok} in / ${outTok} out`)
  console.log(`Est. cost: $${cost.toFixed(4)} (Sonnet 4.6 @ $${PRICE_IN}/$${PRICE_OUT} per 1M)`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
