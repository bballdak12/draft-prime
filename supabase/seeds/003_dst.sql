-- supabase/seeds/003_dst.sql
-- 60 curated historical DST seasons
-- Legend (5): most dominant all-time | Hero (14): elite | Gold (41): the rest
-- Each row is a specific team-season card, not a generic team.

INSERT INTO players (
  name, position, team, era, tier, prime_seasons_count,
  is_active, era_adjustment_multiplier,
  card_back_bio, card_back_fun_fact, photo_url
) VALUES

-- ── LEGEND (5) ───────────────────────────────────────────────────────────────
('1985 Chicago Bears DST',        'DST', 'CHI', '1985', 'legend', 1, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1985 Chicago Bears DST. Update with official biography.',
 'Placeholder fun fact for 1985 Chicago Bears DST. Update with official fun fact.', NULL),

('2000 Baltimore Ravens DST',     'DST', 'BAL', '2000', 'legend', 1, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2000 Baltimore Ravens DST. Update with official biography.',
 'Placeholder fun fact for 2000 Baltimore Ravens DST. Update with official fun fact.', NULL),

('2002 Tampa Bay Buccaneers DST', 'DST', 'TB',  '2002', 'legend', 1, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2002 Tampa Bay Buccaneers DST. Update with official biography.',
 'Placeholder fun fact for 2002 Tampa Bay Buccaneers DST. Update with official fun fact.', NULL),

('2013 Seattle Seahawks DST',     'DST', 'SEA', '2013', 'legend', 1, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2013 Seattle Seahawks DST. Update with official biography.',
 'Placeholder fun fact for 2013 Seattle Seahawks DST. Update with official fun fact.', NULL),

('2015 Denver Broncos DST',       'DST', 'DEN', '2015', 'legend', 1, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2015 Denver Broncos DST. Update with official biography.',
 'Placeholder fun fact for 2015 Denver Broncos DST. Update with official fun fact.', NULL),

-- ── HERO (14) ────────────────────────────────────────────────────────────────
('1968 Baltimore Colts DST',      'DST', 'BAL', '1968', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1968 Baltimore Colts DST. Update with official biography.',
 'Placeholder fun fact for 1968 Baltimore Colts DST. Update with official fun fact.', NULL),

('1969 Minnesota Vikings DST',    'DST', 'MIN', '1969', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1969 Minnesota Vikings DST. Update with official biography.',
 'Placeholder fun fact for 1969 Minnesota Vikings DST. Update with official fun fact.', NULL),

('1972 Miami Dolphins DST',       'DST', 'MIA', '1972', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1972 Miami Dolphins DST. Update with official biography.',
 'Placeholder fun fact for 1972 Miami Dolphins DST. Update with official fun fact.', NULL),

('1974 Pittsburgh Steelers DST',  'DST', 'PIT', '1974', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1974 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 1974 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('1975 Pittsburgh Steelers DST',  'DST', 'PIT', '1975', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1975 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 1975 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('1976 Pittsburgh Steelers DST',  'DST', 'PIT', '1976', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1976 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 1976 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('1978 Pittsburgh Steelers DST',  'DST', 'PIT', '1978', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1978 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 1978 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('1986 New York Giants DST',      'DST', 'NYG', '1986', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1986 New York Giants DST. Update with official biography.',
 'Placeholder fun fact for 1986 New York Giants DST. Update with official fun fact.', NULL),

('1991 Philadelphia Eagles DST',  'DST', 'PHI', '1991', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1991 Philadelphia Eagles DST. Update with official biography.',
 'Placeholder fun fact for 1991 Philadelphia Eagles DST. Update with official fun fact.', NULL),

('2003 New England Patriots DST', 'DST', 'NE',  '2003', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2003 New England Patriots DST. Update with official biography.',
 'Placeholder fun fact for 2003 New England Patriots DST. Update with official fun fact.', NULL),

('2007 New England Patriots DST', 'DST', 'NE',  '2007', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2007 New England Patriots DST. Update with official biography.',
 'Placeholder fun fact for 2007 New England Patriots DST. Update with official fun fact.', NULL),

('2008 Pittsburgh Steelers DST',  'DST', 'PIT', '2008', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2008 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 2008 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('2014 Seattle Seahawks DST',     'DST', 'SEA', '2014', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2014 Seattle Seahawks DST. Update with official biography.',
 'Placeholder fun fact for 2014 Seattle Seahawks DST. Update with official fun fact.', NULL),

('2016 Denver Broncos DST',       'DST', 'DEN', '2016', 'hero',   2, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2016 Denver Broncos DST. Update with official biography.',
 'Placeholder fun fact for 2016 Denver Broncos DST. Update with official fun fact.', NULL),

-- ── GOLD (41) ────────────────────────────────────────────────────────────────
-- 1960s (6)
('1965 Green Bay Packers DST',    'DST', 'GB',  '1965', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1965 Green Bay Packers DST. Update with official biography.',
 'Placeholder fun fact for 1965 Green Bay Packers DST. Update with official fun fact.', NULL),

('1966 Green Bay Packers DST',    'DST', 'GB',  '1966', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1966 Green Bay Packers DST. Update with official biography.',
 'Placeholder fun fact for 1966 Green Bay Packers DST. Update with official fun fact.', NULL),

('1966 Kansas City Chiefs DST',   'DST', 'KC',  '1966', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1966 Kansas City Chiefs DST. Update with official biography.',
 'Placeholder fun fact for 1966 Kansas City Chiefs DST. Update with official fun fact.', NULL),

('1967 Oakland Raiders DST',      'DST', 'OAK', '1967', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1967 Oakland Raiders DST. Update with official biography.',
 'Placeholder fun fact for 1967 Oakland Raiders DST. Update with official fun fact.', NULL),

('1968 New York Jets DST',        'DST', 'NYJ', '1968', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1968 New York Jets DST. Update with official biography.',
 'Placeholder fun fact for 1968 New York Jets DST. Update with official fun fact.', NULL),

('1969 Kansas City Chiefs DST',   'DST', 'KC',  '1969', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1969 Kansas City Chiefs DST. Update with official biography.',
 'Placeholder fun fact for 1969 Kansas City Chiefs DST. Update with official fun fact.', NULL),

-- 1970s (5)
('1971 Dallas Cowboys DST',       'DST', 'DAL', '1971', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1971 Dallas Cowboys DST. Update with official biography.',
 'Placeholder fun fact for 1971 Dallas Cowboys DST. Update with official fun fact.', NULL),

('1973 Miami Dolphins DST',       'DST', 'MIA', '1973', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1973 Miami Dolphins DST. Update with official biography.',
 'Placeholder fun fact for 1973 Miami Dolphins DST. Update with official fun fact.', NULL),

('1976 Oakland Raiders DST',      'DST', 'OAK', '1976', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1976 Oakland Raiders DST. Update with official biography.',
 'Placeholder fun fact for 1976 Oakland Raiders DST. Update with official fun fact.', NULL),

('1977 Denver Broncos DST',       'DST', 'DEN', '1977', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1977 Denver Broncos DST. Update with official biography.',
 'Placeholder fun fact for 1977 Denver Broncos DST. Update with official fun fact.', NULL),

('1979 Los Angeles Rams DST',     'DST', 'LAR', '1979', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1979 Los Angeles Rams DST. Update with official biography.',
 'Placeholder fun fact for 1979 Los Angeles Rams DST. Update with official fun fact.', NULL),

-- 1980s (10)
('1980 Philadelphia Eagles DST',  'DST', 'PHI', '1980', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1980 Philadelphia Eagles DST. Update with official biography.',
 'Placeholder fun fact for 1980 Philadelphia Eagles DST. Update with official fun fact.', NULL),

('1981 San Francisco 49ers DST',  'DST', 'SF',  '1981', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1981 San Francisco 49ers DST. Update with official biography.',
 'Placeholder fun fact for 1981 San Francisco 49ers DST. Update with official fun fact.', NULL),

('1982 Washington Redskins DST',  'DST', 'WAS', '1982', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1982 Washington Redskins DST. Update with official biography.',
 'Placeholder fun fact for 1982 Washington Redskins DST. Update with official fun fact.', NULL),

('1983 Los Angeles Raiders DST',  'DST', 'OAK', '1983', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1983 Los Angeles Raiders DST. Update with official biography.',
 'Placeholder fun fact for 1983 Los Angeles Raiders DST. Update with official fun fact.', NULL),

('1984 San Francisco 49ers DST',  'DST', 'SF',  '1984', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1984 San Francisco 49ers DST. Update with official biography.',
 'Placeholder fun fact for 1984 San Francisco 49ers DST. Update with official fun fact.', NULL),

('1986 Chicago Bears DST',        'DST', 'CHI', '1986', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1986 Chicago Bears DST. Update with official biography.',
 'Placeholder fun fact for 1986 Chicago Bears DST. Update with official fun fact.', NULL),

('1987 San Francisco 49ers DST',  'DST', 'SF',  '1987', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1987 San Francisco 49ers DST. Update with official biography.',
 'Placeholder fun fact for 1987 San Francisco 49ers DST. Update with official fun fact.', NULL),

('1988 Minnesota Vikings DST',    'DST', 'MIN', '1988', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1988 Minnesota Vikings DST. Update with official biography.',
 'Placeholder fun fact for 1988 Minnesota Vikings DST. Update with official fun fact.', NULL),

('1989 Denver Broncos DST',       'DST', 'DEN', '1989', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1989 Denver Broncos DST. Update with official biography.',
 'Placeholder fun fact for 1989 Denver Broncos DST. Update with official fun fact.', NULL),

('1989 San Francisco 49ers DST',  'DST', 'SF',  '1989', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1989 San Francisco 49ers DST. Update with official biography.',
 'Placeholder fun fact for 1989 San Francisco 49ers DST. Update with official fun fact.', NULL),

-- 1990s (11)
('1990 New York Giants DST',      'DST', 'NYG', '1990', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1990 New York Giants DST. Update with official biography.',
 'Placeholder fun fact for 1990 New York Giants DST. Update with official fun fact.', NULL),

('1991 New Orleans Saints DST',   'DST', 'NO',  '1991', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1991 New Orleans Saints DST. Update with official biography.',
 'Placeholder fun fact for 1991 New Orleans Saints DST. Update with official fun fact.', NULL),

('1992 Buffalo Bills DST',        'DST', 'BUF', '1992', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1992 Buffalo Bills DST. Update with official biography.',
 'Placeholder fun fact for 1992 Buffalo Bills DST. Update with official fun fact.', NULL),

('1992 Dallas Cowboys DST',       'DST', 'DAL', '1992', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1992 Dallas Cowboys DST. Update with official biography.',
 'Placeholder fun fact for 1992 Dallas Cowboys DST. Update with official fun fact.', NULL),

('1993 Dallas Cowboys DST',       'DST', 'DAL', '1993', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1993 Dallas Cowboys DST. Update with official biography.',
 'Placeholder fun fact for 1993 Dallas Cowboys DST. Update with official fun fact.', NULL),

('1994 San Francisco 49ers DST',  'DST', 'SF',  '1994', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1994 San Francisco 49ers DST. Update with official biography.',
 'Placeholder fun fact for 1994 San Francisco 49ers DST. Update with official fun fact.', NULL),

('1995 Pittsburgh Steelers DST',  'DST', 'PIT', '1995', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1995 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 1995 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('1996 Green Bay Packers DST',    'DST', 'GB',  '1996', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1996 Green Bay Packers DST. Update with official biography.',
 'Placeholder fun fact for 1996 Green Bay Packers DST. Update with official fun fact.', NULL),

('1997 Pittsburgh Steelers DST',  'DST', 'PIT', '1997', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1997 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 1997 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('1998 Minnesota Vikings DST',    'DST', 'MIN', '1998', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1998 Minnesota Vikings DST. Update with official biography.',
 'Placeholder fun fact for 1998 Minnesota Vikings DST. Update with official fun fact.', NULL),

('1999 Jacksonville Jaguars DST', 'DST', 'JAX', '1999', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 1999 Jacksonville Jaguars DST. Update with official biography.',
 'Placeholder fun fact for 1999 Jacksonville Jaguars DST. Update with official fun fact.', NULL),

-- 2000s (5)
('2001 Chicago Bears DST',        'DST', 'CHI', '2001', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2001 Chicago Bears DST. Update with official biography.',
 'Placeholder fun fact for 2001 Chicago Bears DST. Update with official fun fact.', NULL),

('2004 Pittsburgh Steelers DST',  'DST', 'PIT', '2004', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2004 Pittsburgh Steelers DST. Update with official biography.',
 'Placeholder fun fact for 2004 Pittsburgh Steelers DST. Update with official fun fact.', NULL),

('2005 Chicago Bears DST',        'DST', 'CHI', '2005', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2005 Chicago Bears DST. Update with official biography.',
 'Placeholder fun fact for 2005 Chicago Bears DST. Update with official fun fact.', NULL),

('2006 Baltimore Ravens DST',     'DST', 'BAL', '2006', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2006 Baltimore Ravens DST. Update with official biography.',
 'Placeholder fun fact for 2006 Baltimore Ravens DST. Update with official fun fact.', NULL),

('2009 New York Jets DST',        'DST', 'NYJ', '2009', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2009 New York Jets DST. Update with official biography.',
 'Placeholder fun fact for 2009 New York Jets DST. Update with official fun fact.', NULL),

-- 2010s (4)
('2011 San Francisco 49ers DST',  'DST', 'SF',  '2011', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2011 San Francisco 49ers DST. Update with official biography.',
 'Placeholder fun fact for 2011 San Francisco 49ers DST. Update with official fun fact.', NULL),

('2012 Chicago Bears DST',        'DST', 'CHI', '2012', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2012 Chicago Bears DST. Update with official biography.',
 'Placeholder fun fact for 2012 Chicago Bears DST. Update with official fun fact.', NULL),

('2017 Jacksonville Jaguars DST', 'DST', 'JAX', '2017', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2017 Jacksonville Jaguars DST. Update with official biography.',
 'Placeholder fun fact for 2017 Jacksonville Jaguars DST. Update with official fun fact.', NULL),

('2018 Chicago Bears DST',        'DST', 'CHI', '2018', 'gold',   3, false,
 '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
 'Placeholder bio for 2018 Chicago Bears DST. Update with official biography.',
 'Placeholder fun fact for 2018 Chicago Bears DST. Update with official fun fact.', NULL);
