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

// ─────────────────────────────────────────────────────────────────────────────
// Ranking methodology:
//   Estimated defensive FPPG = PA component + sack bonus + TO bonus + def TD bonus
//   PA component  : 10 pts for 0 PA → 4 pts for 7-13 PA/G → 1 pt for 14-20 → 0 for 21-27 → negative above
//   Sacks/game    : ~1 pt each
//   TOs/game      : ~2 pts each (INTs + fumble recoveries combined)
//   Def TDs/game  : ~6 pts each
//
//   Sources: Pro Football Reference historical records, known defensive stats
//
// Tier distribution (60 total):
//   Legend : 3  (ranks 1–3)
//   Hero   : 3  (ranks 4–6)
//   Gold   : 11 (ranks 7–17)
//   Silver : 33 (ranks 18–50)
//   Bronze : 10 (ranks 51–60)
//   prime_seasons_count = 1 for ALL DST cards
// ─────────────────────────────────────────────────────────────────────────────

const RANKINGS = [
  // rank | name                                | est FPPG | notes
  // ── LEGEND (3) ─────────────────────────────────────────────────────────────
  { rank:  1, name: '1985 Chicago Bears DST',        fppg: 18.2, tier: 'legend' },
  // 64 sacks (NFL record), 54 TOs, 11 def TDs, 198 PA / 16 gms = 12.4 PA/G
  { rank:  2, name: '2000 Baltimore Ravens DST',     fppg: 16.1, tier: 'legend' },
  // 165 PA / 16 = 10.3 PA/G; 49 TOs (NFL record at time), 35 sacks, Ray Lewis/Rod Woodson
  { rank:  3, name: '2002 Tampa Bay Buccaneers DST', fppg: 14.8, tier: 'legend' },
  // 196 PA / 16 = 12.3 PA/G; 49 sacks, 38 TOs, Derrick Brooks/Warren Sapp

  // ── HERO (3) ────────────────────────────────────────────────────────────────
  { rank:  4, name: '2013 Seattle Seahawks DST',     fppg: 13.6, tier: 'hero'   },
  // 231 PA / 16 = 14.4 PA/G; 39 TOs, Sherman/Thomas/Chancellor; Legion of Boom peak
  { rank:  5, name: '1976 Pittsburgh Steelers DST',  fppg: 13.3, tier: 'hero'   },
  // 138 PA / 14 = 9.9 PA/G; Steel Curtain peak; led NFL in scoring D
  { rank:  6, name: '1969 Minnesota Vikings DST',    fppg: 12.9, tier: 'hero'   },
  // 133 PA / 14 = 9.5 PA/G; Purple People Eaters; lowest PA/G of any team in this set

  // ── GOLD (11) ───────────────────────────────────────────────────────────────
  { rank:  7, name: '1968 Baltimore Colts DST',      fppg: 12.7, tier: 'gold'   },
  // 144 PA / 14 = 10.3 PA/G; Gino Marchetti era; dominant 13-1 regular season
  { rank:  8, name: '1977 Denver Broncos DST',       fppg: 12.5, tier: 'gold'   },
  // 148 PA / 14 = 10.6 PA/G; Orange Crush D; SB XII; Alzado/Tom Jackson/Bob Swenson
  { rank:  9, name: '1973 Miami Dolphins DST',       fppg: 12.2, tier: 'gold'   },
  // 150 PA / 14 = 10.7 PA/G; back-to-back SB champs; No-Name Defense still elite
  { rank: 10, name: '1975 Pittsburgh Steelers DST',  fppg: 12.0, tier: 'gold'   },
  // 162 PA / 14 = 11.6 PA/G; back-to-back SB champs; Steel Curtain
  { rank: 11, name: '1972 Miami Dolphins DST',       fppg: 11.8, tier: 'gold'   },
  // 171 PA / 14 = 12.2 PA/G; undefeated season; 26 TOs; No-Name Defense
  { rank: 12, name: '1978 Pittsburgh Steelers DST',  fppg: 11.6, tier: 'gold'   },
  // 195 PA / 16 = 12.2 PA/G; SB XIII champs; Steel Curtain final peak year
  { rank: 13, name: '1974 Pittsburgh Steelers DST',  fppg: 11.4, tier: 'gold'   },
  // 189 PA / 14 = 13.5 PA/G; first SB title; 32 sacks, high TOs
  { rank: 14, name: '1986 New York Giants DST',      fppg: 11.2, tier: 'gold'   },
  // 236 PA / 16 = 14.8 PA/G; LT had 20.5 sacks; led NFL with 59 sacks total; SB XXI
  { rank: 15, name: '2008 Pittsburgh Steelers DST',  fppg: 11.0, tier: 'gold'   },
  // 223 PA / 16 = 13.9 PA/G; 51 sacks, Polamalu/James Harrison (MVP); SB XLIII
  { rank: 16, name: '2003 New England Patriots DST', fppg: 10.8, tier: 'gold'   },
  // 238 PA / 16 = 14.9 PA/G; dominant in playoffs; SB XXXVIII; Ty Law led league
  { rank: 17, name: '2015 Denver Broncos DST',       fppg: 10.5, tier: 'gold'   },
  // 296 PA / 16 = 18.5 PA/G; 52 sacks (Von Miller/Ware), won SB 50; high sack bonus

  // ── SILVER (33) ─────────────────────────────────────────────────────────────
  { rank: 18, name: '2007 New England Patriots DST', fppg: 10.3, tier: 'silver' },
  // 274 PA / 16 = 17.1 PA/G; 16-0 season; Vrabel/Seymour/Asante Samuel TOs
  { rank: 19, name: '2014 Seattle Seahawks DST',     fppg: 10.1, tier: 'silver' },
  // 254 PA / 16 = 15.9 PA/G; still LOB; back-to-back SB
  { rank: 20, name: '1991 Philadelphia Eagles DST',  fppg:  9.9, tier: 'silver' },
  // Reggie White's last Eagle season; led NFL in sacks; Buddy Ryan defense
  { rank: 21, name: '2016 Denver Broncos DST',       fppg:  9.7, tier: 'silver' },
  // 289 PA / 16 = 18.1 PA/G; Von Miller still elite; Aqib Talib/Chris Harris
  { rank: 22, name: '1966 Green Bay Packers DST',    fppg:  9.5, tier: 'silver' },
  // Led NFL in scoring D; Willie Davis/Ray Nitschke; Super Bowl I champions
  { rank: 23, name: '2017 Jacksonville Jaguars DST', fppg:  9.4, tier: 'silver' },
  // 253 PA / 16 = 15.8 PA/G; NFL-leading 55 sacks; Jalen Ramsey/Calais Campbell
  { rank: 24, name: '1966 Kansas City Chiefs DST',   fppg:  9.3, tier: 'silver' },
  // Super Bowl I runners-up; AFL dominant defense; Buck Buchanan/Jerry Mays
  { rank: 25, name: '1988 Minnesota Vikings DST',    fppg:  9.2, tier: 'silver' },
  // Led NFL in sacks; Chris Doleman/Keith Millard anchored dominant front
  { rank: 26, name: '1971 Dallas Cowboys DST',       fppg:  9.0, tier: 'silver' },
  // Doomsday Defense; 185 PA / 14 = 13.2 PA/G; SB VI; 38 sacks; Lee Roy Jordan
  { rank: 27, name: '2005 Chicago Bears DST',        fppg:  8.9, tier: 'silver' },
  // 202 PA / 16 = 12.6 PA/G; led NFL in scoring D and TOs; Urlacher/Mike Brown era
  { rank: 28, name: '1984 San Francisco 49ers DST',  fppg:  8.8, tier: 'silver' },
  // SB XIX; Ronnie Lott/Jack Reynolds; led NFC in scoring D
  { rank: 29, name: '1986 Chicago Bears DST',        fppg:  8.7, tier: 'silver' },
  // Defending champs; Singletary still elite; 52 sacks; lost to WAS in playoffs
  { rank: 30, name: '1981 San Francisco 49ers DST',  fppg:  8.6, tier: 'silver' },
  // SB XVI; Ronnie Lott rookie; Dwaine Board/Lawrence Pillars pressure
  { rank: 31, name: '1996 Green Bay Packers DST',    fppg:  8.5, tier: 'silver' },
  // SB XXXI; Reggie White led NFL in sacks; LeRoy Butler/Craig Newsome
  { rank: 32, name: '1990 New York Giants DST',      fppg:  8.4, tier: 'silver' },
  // SB XXV; LT still great; Lawrence Taylor/Carl Banks; led NFL in sacks
  { rank: 33, name: '2011 San Francisco 49ers DST',  fppg:  8.3, tier: 'silver' },
  // Harbaugh year 1; Patrick Willis/Aldon Smith (11 sacks rookie); NFC West dominant
  { rank: 34, name: '1983 Los Angeles Raiders DST',  fppg:  8.2, tier: 'silver' },
  // SB XVIII; Lester Hayes/Howie Long/Ted Hendricks; dominant secondary
  { rank: 35, name: '1992 Dallas Cowboys DST',       fppg:  8.1, tier: 'silver' },
  // SB XXVII; Charles Haley led team in sacks; Everson Walls INT
  { rank: 36, name: '1967 Oakland Raiders DST',      fppg:  8.0, tier: 'silver' },
  // AFL Super Bowl II season; Ben Davidson/Ike Lassiter pass rush
  { rank: 37, name: '1994 San Francisco 49ers DST',  fppg:  7.9, tier: 'silver' },
  // SB XXIX; Deion Sanders acquisition; secondary dominant; 44 sacks
  { rank: 38, name: '2018 Chicago Bears DST',        fppg:  7.8, tier: 'silver' },
  // Khalil Mack trade (6 sacks, 2 def TDs in first 4 games); 50 team sacks; Roquan Smith
  { rank: 39, name: '1987 San Francisco 49ers DST',  fppg:  7.7, tier: 'silver' },
  // SB XXII season; Charles Haley/Michael Carter; Ronnie Lott still elite; strike year
  { rank: 40, name: '1989 San Francisco 49ers DST',  fppg:  7.6, tier: 'silver' },
  // SB XXIV; Ronnie Lott/Charles Haley; 38 sacks; strong secondary
  { rank: 41, name: '2004 Pittsburgh Steelers DST',  fppg:  7.5, tier: 'silver' },
  // 15-1 regular season; James Farrior/Ike Taylor; strong run defense
  { rank: 42, name: '1991 New Orleans Saints DST',   fppg:  7.4, tier: 'silver' },
  // Dome Patrol linebackers peak (Swilling, Mills, Jackson, Wilks); Pat Swilling 17 sacks
  { rank: 43, name: '1993 Dallas Cowboys DST',       fppg:  7.3, tier: 'silver' },
  // Back-to-back SB; Haley/Leon Lett; balanced defense
  { rank: 44, name: '1995 Pittsburgh Steelers DST',  fppg:  7.2, tier: 'silver' },
  // SB XXX; Kevin Greene 14 sacks; Greg Lloyd dominant; Carnell Lake
  { rank: 45, name: '1982 Washington Redskins DST',  fppg:  7.1, tier: 'silver' },
  // SB XVII; strike-shortened 9 games; 128 PA / 9 = 14.2 PA/G; Dexter Manley pass rush
  { rank: 46, name: '2012 Chicago Bears DST',        fppg:  7.0, tier: 'silver' },
  // Urlacher's last All-Pro; Julius Peppers/Lance Briggs; strong but injury-limited
  { rank: 47, name: '1997 Pittsburgh Steelers DST',  fppg:  6.9, tier: 'silver' },
  // AFC champs; Carnell Lake/Joel Steed; solid but not elite level
  { rank: 48, name: '1976 Oakland Raiders DST',      fppg:  6.8, tier: 'silver' },
  // SB XI; Jack Tatum/Willie Brown; solid Raiders D behind Steel Curtain in AFC
  { rank: 49, name: '2006 Baltimore Ravens DST',     fppg:  6.7, tier: 'silver' },
  // Ray Lewis/Ed Reed/Haloti Ngata; 259 PA / 16 = 16.2 PA/G; transition year
  { rank: 50, name: '2009 New York Jets DST',        fppg:  6.6, tier: 'silver' },
  // Rex Ryan year 1; Darrelle Revis (Revis Island); Calvin Pace/Shaun Ellis sacks

  // ── BRONZE (10) ─────────────────────────────────────────────────────────────
  { rank: 51, name: '2001 Chicago Bears DST',        fppg:  6.5, tier: 'bronze' },
  // Urlacher rookie; Mike Brown 5 INTs; 13-3 but defense less dominant vs. elite D
  { rank: 52, name: '1998 Minnesota Vikings DST',    fppg:  6.4, tier: 'bronze' },
  // Offense-first team (556 pts); Robert Smith/Randy Moss led; defense solid, not elite
  { rank: 53, name: '1965 Green Bay Packers DST',    fppg:  6.3, tier: 'bronze' },
  // Willie Davis/Ray Nitschke; pre-SB era; offense-first Lombardi squad
  { rank: 54, name: '1980 Philadelphia Eagles DST',  fppg:  6.2, tier: 'bronze' },
  // SB XV; Wilbert Montgomery/Harold Carmichael era; before Reggie White arrived (1984)
  { rank: 55, name: '1989 Denver Broncos DST',       fppg:  6.1, tier: 'bronze' },
  // SB XXIV season; Elway offense carried team; D allowed 226 PA / 16 = 14.1 PA/G
  { rank: 56, name: '1999 Jacksonville Jaguars DST', fppg:  6.0, tier: 'bronze' },
  // Good but not elite; Tony Brackens 12 sacks; declined from 1998 peak
  { rank: 57, name: '1979 Los Angeles Rams DST',     fppg:  5.9, tier: 'bronze' },
  // SB XIV season; Jack Youngblood played on broken leg; offense-first Rams
  { rank: 58, name: '1992 Buffalo Bills DST',        fppg:  5.8, tier: 'bronze' },
  // K-Gun offense team; no-huddle Bills; defense was average in SB era
  { rank: 59, name: '1968 New York Jets DST',        fppg:  5.7, tier: 'bronze' },
  // Namath/SB III; defense serviceable but not dominant unit
  { rank: 60, name: '1969 Kansas City Chiefs DST',   fppg:  5.6, tier: 'bronze' },
  // Super Bowl IV champions; Willie Lanier/Buck Buchanan; decent AFL defense
];

async function main() {
  const env      = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  console.log('Updating 60 DST tiers and setting prime_seasons_count = 1 …\n');

  let updated = 0, errors = 0;

  for (const entry of RANKINGS) {
    const { error } = await supabase
      .from('players')
      .update({ tier: entry.tier, prime_seasons_count: 1 })
      .eq('name', entry.name)
      .eq('position', 'DST');

    if (error) {
      console.error(`  ERROR updating ${entry.name}: ${error.message}`);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`Updated: ${updated}  Errors: ${errors}\n`);

  // ── Verification ────────────────────────────────────────────────────────────
  console.log('── Tier counts ──────────────────────────────────────────────');
  for (const tier of ['legend', 'hero', 'gold', 'silver', 'bronze']) {
    const { count } = await supabase.from('players')
      .select('*', { count: 'exact', head: true })
      .eq('position', 'DST').eq('tier', tier);
    if (count) console.log(`  DST ${tier}: ${count}`);
  }
  const { count: total } = await supabase.from('players')
    .select('*', { count: 'exact', head: true }).eq('position', 'DST');
  console.log(`  DST total: ${total}`);

  // ── Ranked list ─────────────────────────────────────────────────────────────
  console.log('\n── Full ranked list ─────────────────────────────────────────');
  console.log(' rank | tier   | est FPPG | name');
  console.log(' -----|--------|----------|------------------------------------');
  for (const e of RANKINGS) {
    console.log(
      ` ${String(e.rank).padStart(3)}  | ${e.tier.padEnd(6)} | ${String(e.fppg.toFixed(1)).padStart(7)}  | ${e.name}`
    );
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
