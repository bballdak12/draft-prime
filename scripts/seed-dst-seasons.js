'use strict';

// Seeds one player_seasons row per DST card using the estimated fppg values
// from rank_dst.js. DST cards have prime_seasons_count = 1 and represent a
// single historical season, so one row per player is correct.

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

// Estimated fppg per DST card — sourced from rank_dst.js RANKINGS
const RANKINGS = [
  { name: '1985 Chicago Bears DST',        fppg: 18.2 },
  { name: '2000 Baltimore Ravens DST',     fppg: 16.1 },
  { name: '2002 Tampa Bay Buccaneers DST', fppg: 14.8 },
  { name: '2013 Seattle Seahawks DST',     fppg: 13.6 },
  { name: '1976 Pittsburgh Steelers DST',  fppg: 13.3 },
  { name: '1969 Minnesota Vikings DST',    fppg: 12.9 },
  { name: '1968 Baltimore Colts DST',      fppg: 12.7 },
  { name: '1977 Denver Broncos DST',       fppg: 12.5 },
  { name: '1973 Miami Dolphins DST',       fppg: 12.2 },
  { name: '1975 Pittsburgh Steelers DST',  fppg: 12.0 },
  { name: '1972 Miami Dolphins DST',       fppg: 11.8 },
  { name: '1978 Pittsburgh Steelers DST',  fppg: 11.6 },
  { name: '1974 Pittsburgh Steelers DST',  fppg: 11.4 },
  { name: '1986 New York Giants DST',      fppg: 11.2 },
  { name: '2008 Pittsburgh Steelers DST',  fppg: 11.0 },
  { name: '2003 New England Patriots DST', fppg: 10.8 },
  { name: '2015 Denver Broncos DST',       fppg: 10.5 },
  { name: '2007 New England Patriots DST', fppg: 10.3 },
  { name: '2014 Seattle Seahawks DST',     fppg: 10.1 },
  { name: '1991 Philadelphia Eagles DST',  fppg:  9.9 },
  { name: '2016 Denver Broncos DST',       fppg:  9.7 },
  { name: '1966 Green Bay Packers DST',    fppg:  9.5 },
  { name: '2017 Jacksonville Jaguars DST', fppg:  9.4 },
  { name: '1966 Kansas City Chiefs DST',   fppg:  9.3 },
  { name: '1988 Minnesota Vikings DST',    fppg:  9.2 },
  { name: '1971 Dallas Cowboys DST',       fppg:  9.0 },
  { name: '2005 Chicago Bears DST',        fppg:  8.9 },
  { name: '1984 San Francisco 49ers DST',  fppg:  8.8 },
  { name: '1986 Chicago Bears DST',        fppg:  8.7 },
  { name: '1981 San Francisco 49ers DST',  fppg:  8.6 },
  { name: '1996 Green Bay Packers DST',    fppg:  8.5 },
  { name: '1990 New York Giants DST',      fppg:  8.4 },
  { name: '2011 San Francisco 49ers DST',  fppg:  8.3 },
  { name: '1983 Los Angeles Raiders DST',  fppg:  8.2 },
  { name: '1992 Dallas Cowboys DST',       fppg:  8.1 },
  { name: '1967 Oakland Raiders DST',      fppg:  8.0 },
  { name: '1994 San Francisco 49ers DST',  fppg:  7.9 },
  { name: '2018 Chicago Bears DST',        fppg:  7.8 },
  { name: '1987 San Francisco 49ers DST',  fppg:  7.7 },
  { name: '1989 San Francisco 49ers DST',  fppg:  7.6 },
  { name: '2004 Pittsburgh Steelers DST',  fppg:  7.5 },
  { name: '1991 New Orleans Saints DST',   fppg:  7.4 },
  { name: '1993 Dallas Cowboys DST',       fppg:  7.3 },
  { name: '1995 Pittsburgh Steelers DST',  fppg:  7.2 },
  { name: '1982 Washington Redskins DST',  fppg:  7.1 },
  { name: '2012 Chicago Bears DST',        fppg:  7.0 },
  { name: '1997 Pittsburgh Steelers DST',  fppg:  6.9 },
  { name: '1976 Oakland Raiders DST',      fppg:  6.8 },
  { name: '2006 Baltimore Ravens DST',     fppg:  6.7 },
  { name: '2009 New York Jets DST',        fppg:  6.6 },
  { name: '2001 Chicago Bears DST',        fppg:  6.5 },
  { name: '1998 Minnesota Vikings DST',    fppg:  6.4 },
  { name: '1965 Green Bay Packers DST',    fppg:  6.3 },
  { name: '1980 Philadelphia Eagles DST',  fppg:  6.2 },
  { name: '1989 Denver Broncos DST',       fppg:  6.1 },
  { name: '1999 Jacksonville Jaguars DST', fppg:  6.0 },
  { name: '1979 Los Angeles Rams DST',     fppg:  5.9 },
  { name: '1992 Buffalo Bills DST',        fppg:  5.8 },
  { name: '1968 New York Jets DST',        fppg:  5.7 },
  { name: '1969 Kansas City Chiefs DST',   fppg:  5.6 },
];

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: players, error: pErr } = await supabase
    .from('players').select('id, name, era').eq('position', 'DST');
  if (pErr) throw new Error(`players fetch: ${pErr.message}`);
  console.log(`DST players found: ${players.length}`);

  const nameToPlayer = Object.fromEntries(players.map(p => [p.name, p]));
  const fppgMap      = Object.fromEntries(RANKINGS.map(r => [r.name, r.fppg]));

  const rows = [];
  const missing = [];

  for (const p of players) {
    const fppg       = fppgMap[p.name];
    const seasonYear = parseInt(p.era);
    if (!fppg)       { missing.push(`  no fppg: ${p.name}`);       continue; }
    if (!seasonYear) { missing.push(`  no era year: ${p.name}`);   continue; }
    rows.push({ player_id: p.id, season_year: seasonYear, games_played: 16, fppg, is_eligible: true });
  }

  if (missing.length) {
    console.warn('Skipped:');
    missing.forEach(m => console.warn(m));
  }

  console.log(`Inserting ${rows.length} player_seasons rows …`);
  const { error: insErr } = await supabase.from('player_seasons').insert(rows);
  if (insErr) throw new Error(`insert: ${insErr.message}`);
  console.log(`✓ Done — ${rows.length} DST season rows inserted`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
