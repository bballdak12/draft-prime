'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
  );
}

const NO_ADJ = {
  pass_yds: 1.0, pass_tds: 1.0, ints: 1.0,
  rush_yds: 1.0, rush_tds: 1.0,
  rec: 1.0, rec_yds: 1.0, rec_tds: 1.0,
};

// Legend (5)
const LEGEND = [
  { name: '1985 Chicago Bears DST',        team: 'CHI', era: '1985' },
  { name: '2000 Baltimore Ravens DST',     team: 'BAL', era: '2000' },
  { name: '2002 Tampa Bay Buccaneers DST', team: 'TB',  era: '2002' },
  { name: '2013 Seattle Seahawks DST',     team: 'SEA', era: '2013' },
  { name: '2015 Denver Broncos DST',       team: 'DEN', era: '2015' },
];

// Hero (14)
const HERO = [
  { name: '1968 Baltimore Colts DST',      team: 'BAL', era: '1968' },
  { name: '1969 Minnesota Vikings DST',    team: 'MIN', era: '1969' },
  { name: '1972 Miami Dolphins DST',       team: 'MIA', era: '1972' },
  { name: '1974 Pittsburgh Steelers DST',  team: 'PIT', era: '1974' },
  { name: '1975 Pittsburgh Steelers DST',  team: 'PIT', era: '1975' },
  { name: '1976 Pittsburgh Steelers DST',  team: 'PIT', era: '1976' },
  { name: '1978 Pittsburgh Steelers DST',  team: 'PIT', era: '1978' },
  { name: '1986 New York Giants DST',      team: 'NYG', era: '1986' },
  { name: '1991 Philadelphia Eagles DST',  team: 'PHI', era: '1991' },
  { name: '2003 New England Patriots DST', team: 'NE',  era: '2003' },
  { name: '2007 New England Patriots DST', team: 'NE',  era: '2007' },
  { name: '2008 Pittsburgh Steelers DST',  team: 'PIT', era: '2008' },
  { name: '2014 Seattle Seahawks DST',     team: 'SEA', era: '2014' },
  { name: '2016 Denver Broncos DST',       team: 'DEN', era: '2016' },
];

// Gold (41)
const GOLD = [
  // 1960s
  { name: '1965 Green Bay Packers DST',    team: 'GB',  era: '1965' },
  { name: '1966 Green Bay Packers DST',    team: 'GB',  era: '1966' },
  { name: '1966 Kansas City Chiefs DST',   team: 'KC',  era: '1966' },
  { name: '1967 Oakland Raiders DST',      team: 'OAK', era: '1967' },
  { name: '1968 New York Jets DST',        team: 'NYJ', era: '1968' },
  { name: '1969 Kansas City Chiefs DST',   team: 'KC',  era: '1969' },
  // 1970s
  { name: '1971 Dallas Cowboys DST',       team: 'DAL', era: '1971' },
  { name: '1973 Miami Dolphins DST',       team: 'MIA', era: '1973' },
  { name: '1976 Oakland Raiders DST',      team: 'OAK', era: '1976' },
  { name: '1977 Denver Broncos DST',       team: 'DEN', era: '1977' },
  { name: '1979 Los Angeles Rams DST',     team: 'LAR', era: '1979' },
  // 1980s
  { name: '1980 Philadelphia Eagles DST',  team: 'PHI', era: '1980' },
  { name: '1981 San Francisco 49ers DST',  team: 'SF',  era: '1981' },
  { name: '1982 Washington Redskins DST',  team: 'WAS', era: '1982' },
  { name: '1983 Los Angeles Raiders DST',  team: 'OAK', era: '1983' },
  { name: '1984 San Francisco 49ers DST',  team: 'SF',  era: '1984' },
  { name: '1986 Chicago Bears DST',        team: 'CHI', era: '1986' },
  { name: '1987 San Francisco 49ers DST',  team: 'SF',  era: '1987' },
  { name: '1988 Minnesota Vikings DST',    team: 'MIN', era: '1988' },
  { name: '1989 Denver Broncos DST',       team: 'DEN', era: '1989' },
  { name: '1989 San Francisco 49ers DST',  team: 'SF',  era: '1989' },
  // 1990s
  { name: '1990 New York Giants DST',      team: 'NYG', era: '1990' },
  { name: '1991 New Orleans Saints DST',   team: 'NO',  era: '1991' },
  { name: '1992 Buffalo Bills DST',        team: 'BUF', era: '1992' },
  { name: '1992 Dallas Cowboys DST',       team: 'DAL', era: '1992' },
  { name: '1993 Dallas Cowboys DST',       team: 'DAL', era: '1993' },
  { name: '1994 San Francisco 49ers DST',  team: 'SF',  era: '1994' },
  { name: '1995 Pittsburgh Steelers DST',  team: 'PIT', era: '1995' },
  { name: '1996 Green Bay Packers DST',    team: 'GB',  era: '1996' },
  { name: '1997 Pittsburgh Steelers DST',  team: 'PIT', era: '1997' },
  { name: '1998 Minnesota Vikings DST',    team: 'MIN', era: '1998' },
  { name: '1999 Jacksonville Jaguars DST', team: 'JAX', era: '1999' },
  // 2000s
  { name: '2001 Chicago Bears DST',        team: 'CHI', era: '2001' },
  { name: '2004 Pittsburgh Steelers DST',  team: 'PIT', era: '2004' },
  { name: '2005 Chicago Bears DST',        team: 'CHI', era: '2005' },
  { name: '2006 Baltimore Ravens DST',     team: 'BAL', era: '2006' },
  { name: '2009 New York Jets DST',        team: 'NYJ', era: '2009' },
  // 2010s
  { name: '2011 San Francisco 49ers DST',  team: 'SF',  era: '2011' },
  { name: '2012 Chicago Bears DST',        team: 'CHI', era: '2012' },
  { name: '2017 Jacksonville Jaguars DST', team: 'JAX', era: '2017' },
  { name: '2018 Chicago Bears DST',        team: 'CHI', era: '2018' },
];

function buildRows(entries, tier, primeSeasonsCount) {
  return entries.map(e => ({
    name:                      e.name,
    position:                  'DST',
    team:                      e.team,
    era:                       e.era,
    tier,
    prime_seasons_count:       primeSeasonsCount,
    is_active:                 false,
    era_adjustment_multiplier: NO_ADJ,
    card_back_bio:             `Placeholder bio for ${e.name}. Update with official biography.`,
    card_back_fun_fact:        `Placeholder fun fact for ${e.name}. Update with official fun fact.`,
    photo_url:                 null,
  }));
}

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const rows = [
    ...buildRows(LEGEND, 'legend', 1),
    ...buildRows(HERO,   'hero',   2),
    ...buildRows(GOLD,   'gold',   3),
  ];

  console.log(`Inserting ${rows.length} DST rows …`);

  const { data, error } = await supabase.from('players').insert(rows).select('id, name, tier');
  if (error) throw new Error(`Insert failed: ${error.message}`);
  console.log(`Inserted: ${data.length}`);

  console.log('\n── Verification ────────────────────────────────────────────');
  for (const tier of ['legend', 'hero', 'gold', 'silver', 'bronze']) {
    const { count } = await supabase.from('players')
      .select('*', { count: 'exact', head: true })
      .eq('position', 'DST').eq('tier', tier);
    if (count) console.log(`  DST ${tier}: ${count}`);
  }
  const { count: total } = await supabase.from('players')
    .select('*', { count: 'exact', head: true }).eq('position', 'DST');
  console.log(`  DST total: ${total}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
