'use strict';

// Seeds player_seasons rows for every hero/legend skill-position player
// that currently has zero player_seasons records.
//
// One row is inserted per year in the player's era range (e.g. '1991-2010'
// → seasons 1991 through 2010 inclusive).  All rows start with is_eligible=false
// and fppg=null.  calculate-card-stats.js will rank seasons by actual game data
// and mark the top N as eligible.
//
// Usage: node scripts/seed-hero-legend-seasons.js

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const BATCH_SIZE = 500;

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

// Parse era strings like '1991-2010', '1991–2010', '1998–2015'
// Returns { start, end } or null if unparseable.
function parseEra(era) {
  if (!era) return null;
  // Normalise em-dash, en-dash, minus sign → ASCII hyphen
  const s = era.replace(/[–—−]/g, '-').trim();
  const parts = s.split('-').map(p => parseInt(p.trim(), 10)).filter(Boolean);
  if (parts.length === 2 && parts[0] >= 1900 && parts[1] >= parts[0]) {
    return { start: parts[0], end: parts[1] };
  }
  if (parts.length === 1 && parts[0] >= 1900) {
    return { start: parts[0], end: parts[0] };
  }
  return null;
}

async function fetchAll(supabase, table, select, eqFilters = []) {
  const PAGE = 1000;
  let from = 0;
  const all = [];
  while (true) {
    let q = supabase.from(table).select(select).order('id').range(from, from + PAGE - 1);
    for (const [col, val] of eqFilters) q = q.eq(col, val);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Find hero/legend non-DST players with no existing seasons ─────────────
  console.log('[1/3] Querying players …');

  const allHeroLegend = await fetchAll(supabase, 'players',
    'id, name, position, tier, era, prime_seasons_count',
    []);
  const targets = allHeroLegend.filter(p =>
    ['hero', 'legend'].includes(p.tier) && p.position !== 'DST'
  );
  console.log(`  Hero/legend non-DST players: ${targets.length}`);

  // Get all player_ids that already have at least one season row
  const existingSeasons = await fetchAll(supabase, 'player_seasons', 'player_id');
  const hasSeasons = new Set(existingSeasons.map(s => s.player_id));

  const needsSeasons = targets.filter(p => !hasSeasons.has(p.id));
  console.log(`  Players with NO player_seasons: ${needsSeasons.length}`);

  if (!needsSeasons.length) {
    console.log('  Nothing to seed. All hero/legend players already have season rows.');
    return;
  }

  // ── 2. Build season rows ─────────────────────────────────────────────────────
  console.log('\n[2/3] Building season rows …');

  const rows   = [];
  const skipped = [];

  for (const p of needsSeasons) {
    const range = parseEra(p.era);
    if (!range) {
      skipped.push(`  SKIP (bad era "${p.era}"): ${p.name}`);
      continue;
    }
    for (let year = range.start; year <= range.end; year++) {
      rows.push({
        player_id:   p.id,
        season_year: year,
        is_eligible: false,   // calculate-card-stats.js will set this
        fppg:        null,    // will be computed from game data
        season_rank: null,
        games_played: null,
      });
    }
  }

  if (skipped.length) {
    console.log('  Skipped players (unparseable era):');
    skipped.forEach(s => console.log(s));
  }

  console.log(`  Season rows to insert: ${rows.length}`);
  console.log(`  Players covered      : ${needsSeasons.length - skipped.length}`);

  // Preview
  const preview = needsSeasons.slice(0, 5);
  console.log('\n  Preview (first 5 players):');
  for (const p of preview) {
    const r = parseEra(p.era);
    const count = r ? r.end - r.start + 1 : 0;
    console.log(`    ${p.name.padEnd(30)} [${p.tier.padEnd(6)}] era=${p.era}  → ${count} season rows`);
  }

  // ── 3. Insert in batches ─────────────────────────────────────────────────────
  console.log('\n[3/3] Inserting …');
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('player_seasons').insert(rows.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`Insert failed at offset ${i}: ${error.message}`);
    inserted += Math.min(BATCH_SIZE, rows.length - i);
    process.stdout.write(`\r  ${inserted} / ${rows.length} rows inserted`);
  }

  console.log(`\n\n✓ Done.`);
  console.log(`  Players seeded : ${needsSeasons.length - skipped.length}`);
  console.log(`  Season rows    : ${inserted}`);
  console.log(`  Skipped        : ${skipped.length}`);
  console.log('\nNext step: node scripts/import-nflverse-games.js --heroes-legends');
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
