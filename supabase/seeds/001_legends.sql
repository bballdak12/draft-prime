-- =============================================================================
-- Seed 001: Legend tier players (40 total)
-- Draft Prime — insert all Legend cards into the players table
--
-- Era adjustment rules applied below:
--   QB  era start < 1978 : pass_yds×1.15, pass_tds×1.10, ints×0.90
--   RB  era start < 1990 : rec×1.30
--   WR  era start < 1990 : rec×1.25, rec_yds×1.20
--   TE  era start < 1980 : rec×1.35, rec_yds×1.25
--   All others            : all multipliers 1.0
-- =============================================================================

INSERT INTO public.players (
  name,
  position,
  team,
  era,
  tier,
  overall_rating,
  prime_seasons_count,
  is_active,
  era_adjustment_multiplier,
  card_back_bio,
  card_back_fun_fact,
  photo_url
) VALUES

-- ===========================================================================
-- QUARTERBACKS (12)
-- ===========================================================================

-- Joe Montana | SF | 1979-1994 | era start 1979 ≥ 1978 → no QB adjustment
(
  'Joe Montana', 'QB', 'SF', '1979-1994', 'legend', 99, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Joe Montana. Update with official biography.',
  'Placeholder fun fact for Joe Montana. Update with official fun fact.',
  NULL
),

-- Johnny Unitas | BAL | 1956-1973 | era start 1956 < 1978 → QB adjustment
(
  'Johnny Unitas', 'QB', 'BAL', '1956-1973', 'legend', 93, 1, false,
  '{"pass_yds":1.15,"pass_tds":1.10,"ints":0.90,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Johnny Unitas. Update with official biography.',
  'Placeholder fun fact for Johnny Unitas. Update with official fun fact.',
  NULL
),

-- Dan Marino | MIA | 1983-1999 | era start 1983 ≥ 1978 → no QB adjustment
(
  'Dan Marino', 'QB', 'MIA', '1983-1999', 'legend', 97, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Dan Marino. Update with official biography.',
  'Placeholder fun fact for Dan Marino. Update with official fun fact.',
  NULL
),

-- John Elway | DEN | 1983-1998 | era start 1983 ≥ 1978 → no QB adjustment
(
  'John Elway', 'QB', 'DEN', '1983-1998', 'legend', 95, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for John Elway. Update with official biography.',
  'Placeholder fun fact for John Elway. Update with official fun fact.',
  NULL
),

-- Brett Favre | GB | 1991-2010 | no QB adjustment
(
  'Brett Favre', 'QB', 'GB', '1991-2010', 'legend', 95, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Brett Favre. Update with official biography.',
  'Placeholder fun fact for Brett Favre. Update with official fun fact.',
  NULL
),

-- Steve Young | SF | 1984-1999 | no QB adjustment
(
  'Steve Young', 'QB', 'SF', '1984-1999', 'legend', 95, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Steve Young. Update with official biography.',
  'Placeholder fun fact for Steve Young. Update with official fun fact.',
  NULL
),

-- Terry Bradshaw | PIT | 1970-1983 | era start 1970 < 1978 → QB adjustment
(
  'Terry Bradshaw', 'QB', 'PIT', '1970-1983', 'legend', 89, 1, false,
  '{"pass_yds":1.15,"pass_tds":1.10,"ints":0.90,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Terry Bradshaw. Update with official biography.',
  'Placeholder fun fact for Terry Bradshaw. Update with official fun fact.',
  NULL
),

-- Tom Brady | NE | 2000-2022 | no QB adjustment
(
  'Tom Brady', 'QB', 'NE', '2000-2022', 'legend', 99, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Tom Brady. Update with official biography.',
  'Placeholder fun fact for Tom Brady. Update with official fun fact.',
  NULL
),

-- Peyton Manning | IND | 1998-2015 | no QB adjustment
(
  'Peyton Manning', 'QB', 'IND', '1998-2015', 'legend', 98, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Peyton Manning. Update with official biography.',
  'Placeholder fun fact for Peyton Manning. Update with official fun fact.',
  NULL
),

-- Drew Brees | NO | 2001-2020 | no QB adjustment
(
  'Drew Brees', 'QB', 'NO', '2001-2020', 'legend', 94, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Drew Brees. Update with official biography.',
  'Placeholder fun fact for Drew Brees. Update with official fun fact.',
  NULL
),

-- Warren Moon | HOU | 1984-2000 (NFL) | era start 1984 ≥ 1978 → no QB adjustment
(
  'Warren Moon', 'QB', 'HOU', '1984-2000', 'legend', 90, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Warren Moon. Update with official biography.',
  'Placeholder fun fact for Warren Moon. Update with official fun fact.',
  NULL
),

-- Michael Vick | ATL | 2001-2015 | no QB adjustment
(
  'Michael Vick', 'QB', 'ATL', '2001-2015', 'legend', 87, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Michael Vick. Update with official biography.',
  'Placeholder fun fact for Michael Vick. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- RUNNING BACKS (12)
-- ===========================================================================

-- Walter Payton | CHI | 1975-1987 | era start 1975 < 1990 → RB adjustment rec×1.30
(
  'Walter Payton', 'RB', 'CHI', '1975-1987', 'legend', 98, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Walter Payton. Update with official biography.',
  'Placeholder fun fact for Walter Payton. Update with official fun fact.',
  NULL
),

-- Barry Sanders | DET | 1989-1998 | era start 1989 < 1990 → RB adjustment rec×1.30
(
  'Barry Sanders', 'RB', 'DET', '1989-1998', 'legend', 99, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Barry Sanders. Update with official biography.',
  'Placeholder fun fact for Barry Sanders. Update with official fun fact.',
  NULL
),

-- Emmitt Smith | DAL | 1990-2004 | era start 1990 ≥ 1990 → no RB adjustment
(
  'Emmitt Smith', 'RB', 'DAL', '1990-2004', 'legend', 94, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Emmitt Smith. Update with official biography.',
  'Placeholder fun fact for Emmitt Smith. Update with official fun fact.',
  NULL
),

-- Eric Dickerson | LAR | 1983-1993 | era start 1983 < 1990 → RB adjustment rec×1.30
(
  'Eric Dickerson', 'RB', 'LAR', '1983-1993', 'legend', 93, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Eric Dickerson. Update with official biography.',
  'Placeholder fun fact for Eric Dickerson. Update with official fun fact.',
  NULL
),

-- Jim Brown | CLE | 1957-1965 | era start 1957 < 1990 → RB adjustment rec×1.30
(
  'Jim Brown', 'RB', 'CLE', '1957-1965', 'legend', 99, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Jim Brown. Update with official biography.',
  'Placeholder fun fact for Jim Brown. Update with official fun fact.',
  NULL
),

-- LaDainian Tomlinson | SD | 2001-2011 | no RB adjustment
(
  'LaDainian Tomlinson', 'RB', 'SD', '2001-2011', 'legend', 97, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for LaDainian Tomlinson. Update with official biography.',
  'Placeholder fun fact for LaDainian Tomlinson. Update with official fun fact.',
  NULL
),

-- Marshall Faulk | STL | 1994-2005 | no RB adjustment
(
  'Marshall Faulk', 'RB', 'STL', '1994-2005', 'legend', 96, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Marshall Faulk. Update with official biography.',
  'Placeholder fun fact for Marshall Faulk. Update with official fun fact.',
  NULL
),

-- Earl Campbell | HOU | 1978-1985 | era start 1978 < 1990 → RB adjustment rec×1.30
(
  'Earl Campbell', 'RB', 'HOU', '1978-1985', 'legend', 91, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Earl Campbell. Update with official biography.',
  'Placeholder fun fact for Earl Campbell. Update with official fun fact.',
  NULL
),

-- O.J. Simpson | BUF | 1969-1979 | era start 1969 < 1990 → RB adjustment rec×1.30
(
  'O.J. Simpson', 'RB', 'BUF', '1969-1979', 'legend', 91, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for O.J. Simpson. Update with official biography.',
  'Placeholder fun fact for O.J. Simpson. Update with official fun fact.',
  NULL
),

-- Tony Dorsett | DAL | 1977-1988 | era start 1977 < 1990 → RB adjustment rec×1.30
(
  'Tony Dorsett', 'RB', 'DAL', '1977-1988', 'legend', 89, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Tony Dorsett. Update with official biography.',
  'Placeholder fun fact for Tony Dorsett. Update with official fun fact.',
  NULL
),

-- Adrian Peterson | MIN | 2007-2021 | no RB adjustment
(
  'Adrian Peterson', 'RB', 'MIN', '2007-2021', 'legend', 95, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Adrian Peterson. Update with official biography.',
  'Placeholder fun fact for Adrian Peterson. Update with official fun fact.',
  NULL
),

-- Marshawn Lynch | SEA | 2006-2019 | no RB adjustment
(
  'Marshawn Lynch', 'RB', 'SEA', '2006-2019', 'legend', 88, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Marshawn Lynch. Update with official biography.',
  'Placeholder fun fact for Marshawn Lynch. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- WIDE RECEIVERS (11)
-- ===========================================================================

-- Jerry Rice | SF | 1985-2004 | era start 1985 < 1990 → WR adjustment rec×1.25, rec_yds×1.20
(
  'Jerry Rice', 'WR', 'SF', '1985-2004', 'legend', 99, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.25,"rec_yds":1.20,"rec_tds":1.0}',
  'Placeholder bio for Jerry Rice. Update with official biography.',
  'Placeholder fun fact for Jerry Rice. Update with official fun fact.',
  NULL
),

-- Randy Moss | MIN | 1998-2012 | no WR adjustment
(
  'Randy Moss', 'WR', 'MIN', '1998-2012', 'legend', 97, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Randy Moss. Update with official biography.',
  'Placeholder fun fact for Randy Moss. Update with official fun fact.',
  NULL
),

-- Terrell Owens | SF | 1996-2010 | no WR adjustment
(
  'Terrell Owens', 'WR', 'SF', '1996-2010', 'legend', 95, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Terrell Owens. Update with official biography.',
  'Placeholder fun fact for Terrell Owens. Update with official fun fact.',
  NULL
),

-- Cris Carter | MIN | 1987-2002 | era start 1987 < 1990 → WR adjustment rec×1.25, rec_yds×1.20
(
  'Cris Carter', 'WR', 'MIN', '1987-2002', 'legend', 91, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.25,"rec_yds":1.20,"rec_tds":1.0}',
  'Placeholder bio for Cris Carter. Update with official biography.',
  'Placeholder fun fact for Cris Carter. Update with official fun fact.',
  NULL
),

-- Michael Irvin | DAL | 1988-1999 | era start 1988 < 1990 → WR adjustment rec×1.25, rec_yds×1.20
(
  'Michael Irvin', 'WR', 'DAL', '1988-1999', 'legend', 93, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.25,"rec_yds":1.20,"rec_tds":1.0}',
  'Placeholder bio for Michael Irvin. Update with official biography.',
  'Placeholder fun fact for Michael Irvin. Update with official fun fact.',
  NULL
),

-- Marvin Harrison | IND | 1996-2008 | no WR adjustment
(
  'Marvin Harrison', 'WR', 'IND', '1996-2008', 'legend', 93, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Marvin Harrison. Update with official biography.',
  'Placeholder fun fact for Marvin Harrison. Update with official fun fact.',
  NULL
),

-- Steve Largent | SEA | 1976-1989 | era start 1976 < 1990 → WR adjustment rec×1.25, rec_yds×1.20
(
  'Steve Largent', 'WR', 'SEA', '1976-1989', 'legend', 88, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.25,"rec_yds":1.20,"rec_tds":1.0}',
  'Placeholder bio for Steve Largent. Update with official biography.',
  'Placeholder fun fact for Steve Largent. Update with official fun fact.',
  NULL
),

-- Lynn Swann | PIT | 1974-1982 | era start 1974 < 1990 → WR adjustment rec×1.25, rec_yds×1.20
(
  'Lynn Swann', 'WR', 'PIT', '1974-1982', 'legend', 85, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.25,"rec_yds":1.20,"rec_tds":1.0}',
  'Placeholder bio for Lynn Swann. Update with official biography.',
  'Placeholder fun fact for Lynn Swann. Update with official fun fact.',
  NULL
),

-- Calvin Johnson | DET | 2007-2015 | no WR adjustment
(
  'Calvin Johnson', 'WR', 'DET', '2007-2015', 'legend', 96, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Calvin Johnson. Update with official biography.',
  'Placeholder fun fact for Calvin Johnson. Update with official fun fact.',
  NULL
),

-- Larry Fitzgerald | ARI | 2004-2020 | no WR adjustment
(
  'Larry Fitzgerald', 'WR', 'ARI', '2004-2020', 'legend', 91, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Larry Fitzgerald. Update with official biography.',
  'Placeholder fun fact for Larry Fitzgerald. Update with official fun fact.',
  NULL
),

-- Antonio Brown | PIT | 2010-2021 | no WR adjustment
(
  'Antonio Brown', 'WR', 'PIT', '2010-2021', 'legend', 94, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Antonio Brown. Update with official biography.',
  'Placeholder fun fact for Antonio Brown. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- TIGHT ENDS (4)
-- ===========================================================================

-- Tony Gonzalez | KC | 1997-2013 | era start 1997 ≥ 1980 → no TE adjustment
(
  'Tony Gonzalez', 'TE', 'KC', '1997-2013', 'legend', 96, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Tony Gonzalez. Update with official biography.',
  'Placeholder fun fact for Tony Gonzalez. Update with official fun fact.',
  NULL
),

-- Shannon Sharpe | DEN | 1990-2003 | era start 1990 ≥ 1980 → no TE adjustment
(
  'Shannon Sharpe', 'TE', 'DEN', '1990-2003', 'legend', 91, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Shannon Sharpe. Update with official biography.',
  'Placeholder fun fact for Shannon Sharpe. Update with official fun fact.',
  NULL
),

-- Mike Ditka | CHI | 1961-1972 | era start 1961 < 1980 → TE adjustment rec×1.35, rec_yds×1.25
(
  'Mike Ditka', 'TE', 'CHI', '1961-1972', 'legend', 86, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.35,"rec_yds":1.25,"rec_tds":1.0}',
  'Placeholder bio for Mike Ditka. Update with official biography.',
  'Placeholder fun fact for Mike Ditka. Update with official fun fact.',
  NULL
),

-- Rob Gronkowski | NE | 2010-2021 | no TE adjustment
(
  'Rob Gronkowski', 'TE', 'NE', '2010-2021', 'legend', 97, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Rob Gronkowski. Update with official biography.',
  'Placeholder fun fact for Rob Gronkowski. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- KICKER (1)
-- ===========================================================================

-- Justin Tucker | BAL | 2012-2023 | no adjustment for K
(
  'Justin Tucker', 'K', 'BAL', '2012-2023', 'legend', 95, 1, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Justin Tucker. Update with official biography.',
  'Placeholder fun fact for Justin Tucker. Update with official fun fact.',
  NULL
);
