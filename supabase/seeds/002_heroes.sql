-- =============================================================================
-- Seed 002: Hero tier players (43 total)
-- Draft Prime — insert all Hero cards into the players table
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
  prime_seasons_count,
  is_active,
  era_adjustment_multiplier,
  card_back_bio,
  card_back_fun_fact,
  photo_url
) VALUES

-- ===========================================================================
-- QUARTERBACKS (10)
-- ===========================================================================

-- Steve McNair | TEN | 1995-2007 | era start 1995 ≥ 1978 → no QB adjustment
(
  'Steve McNair', 'QB', 'TEN', '1995-2007', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Steve McNair. Update with official biography.',
  'Placeholder fun fact for Steve McNair. Update with official fun fact.',
  NULL
),

-- Daunte Culpepper | MIN | 1999-2009 | era start 1999 ≥ 1978 → no QB adjustment
(
  'Daunte Culpepper', 'QB', 'MIN', '1999-2009', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Daunte Culpepper. Update with official biography.',
  'Placeholder fun fact for Daunte Culpepper. Update with official fun fact.',
  NULL
),

-- Rich Gannon | OAK | 1987-2004 | era start 1987 ≥ 1978 → no QB adjustment
(
  'Rich Gannon', 'QB', 'OAK', '1987-2004', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Rich Gannon. Update with official biography.',
  'Placeholder fun fact for Rich Gannon. Update with official fun fact.',
  NULL
),

-- Donovan McNabb | PHI | 1999-2011 | era start 1999 ≥ 1978 → no QB adjustment
(
  'Donovan McNabb', 'QB', 'PHI', '1999-2011', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Donovan McNabb. Update with official biography.',
  'Placeholder fun fact for Donovan McNabb. Update with official fun fact.',
  NULL
),

-- Kurt Warner | STL | 1998-2009 | era start 1998 ≥ 1978 → no QB adjustment
(
  'Kurt Warner', 'QB', 'STL', '1998-2009', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Kurt Warner. Update with official biography.',
  'Placeholder fun fact for Kurt Warner. Update with official fun fact.',
  NULL
),

-- Boomer Esiason | CIN | 1984-1997 | era start 1984 ≥ 1978 → no QB adjustment
(
  'Boomer Esiason', 'QB', 'CIN', '1984-1997', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Boomer Esiason. Update with official biography.',
  'Placeholder fun fact for Boomer Esiason. Update with official fun fact.',
  NULL
),

-- Roger Staubach | DAL | 1969-1979 | era start 1969 < 1978 → QB adjustment
(
  'Roger Staubach', 'QB', 'DAL', '1969-1979', 'hero', 2, false,
  '{"pass_yds":1.15,"pass_tds":1.10,"ints":0.90,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Roger Staubach. Update with official biography.',
  'Placeholder fun fact for Roger Staubach. Update with official fun fact.',
  NULL
),

-- Trent Green | KC | 1993-2008 | era start 1993 ≥ 1978 → no QB adjustment
(
  'Trent Green', 'QB', 'KC', '1993-2008', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Trent Green. Update with official biography.',
  'Placeholder fun fact for Trent Green. Update with official fun fact.',
  NULL
),

-- Cam Newton | CAR | 2011-2021 | era start 2011 ≥ 1978 → no QB adjustment
(
  'Cam Newton', 'QB', 'CAR', '2011-2021', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Cam Newton. Update with official biography.',
  'Placeholder fun fact for Cam Newton. Update with official fun fact.',
  NULL
),

-- Ben Roethlisberger | PIT | 2004-2021 | era start 2004 ≥ 1978 → no QB adjustment
(
  'Ben Roethlisberger', 'QB', 'PIT', '2004-2021', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Ben Roethlisberger. Update with official biography.',
  'Placeholder fun fact for Ben Roethlisberger. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- RUNNING BACKS (14)
-- ===========================================================================

-- Priest Holmes | KC | 1997-2007 | era start 1997 ≥ 1990 → no RB adjustment
(
  'Priest Holmes', 'RB', 'KC', '1997-2007', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Priest Holmes. Update with official biography.',
  'Placeholder fun fact for Priest Holmes. Update with official fun fact.',
  NULL
),

-- Clinton Portis | WAS | 2002-2010 | era start 2002 ≥ 1990 → no RB adjustment
(
  'Clinton Portis', 'RB', 'WAS', '2002-2010', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Clinton Portis. Update with official biography.',
  'Placeholder fun fact for Clinton Portis. Update with official fun fact.',
  NULL
),

-- Shaun Alexander | SEA | 2000-2008 | era start 2000 ≥ 1990 → no RB adjustment
(
  'Shaun Alexander', 'RB', 'SEA', '2000-2008', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Shaun Alexander. Update with official biography.',
  'Placeholder fun fact for Shaun Alexander. Update with official fun fact.',
  NULL
),

-- Edgerrin James | IND | 1999-2009 | era start 1999 ≥ 1990 → no RB adjustment
(
  'Edgerrin James', 'RB', 'IND', '1999-2009', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Edgerrin James. Update with official biography.',
  'Placeholder fun fact for Edgerrin James. Update with official fun fact.',
  NULL
),

-- Jamal Lewis | BAL | 2000-2009 | era start 2000 ≥ 1990 → no RB adjustment
(
  'Jamal Lewis', 'RB', 'BAL', '2000-2009', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Jamal Lewis. Update with official biography.',
  'Placeholder fun fact for Jamal Lewis. Update with official fun fact.',
  NULL
),

-- Ricky Williams | MIA | 1999-2011 | era start 1999 ≥ 1990 → no RB adjustment
(
  'Ricky Williams', 'RB', 'MIA', '1999-2011', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Ricky Williams. Update with official biography.',
  'Placeholder fun fact for Ricky Williams. Update with official fun fact.',
  NULL
),

-- Warrick Dunn | ATL | 1997-2008 | era start 1997 ≥ 1990 → no RB adjustment
(
  'Warrick Dunn', 'RB', 'ATL', '1997-2008', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Warrick Dunn. Update with official biography.',
  'Placeholder fun fact for Warrick Dunn. Update with official fun fact.',
  NULL
),

-- Corey Dillon | CIN | 1997-2006 | era start 1997 ≥ 1990 → no RB adjustment
(
  'Corey Dillon', 'RB', 'CIN', '1997-2006', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Corey Dillon. Update with official biography.',
  'Placeholder fun fact for Corey Dillon. Update with official fun fact.',
  NULL
),

-- Gale Sayers | CHI | 1965-1971 | era start 1965 < 1990 → RB adjustment rec×1.30
(
  'Gale Sayers', 'RB', 'CHI', '1965-1971', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Gale Sayers. Update with official biography.',
  'Placeholder fun fact for Gale Sayers. Update with official fun fact.',
  NULL
),

-- Todd Gurley | LAR | 2015-2020 | era start 2015 ≥ 1990 → no RB adjustment
(
  'Todd Gurley', 'RB', 'LAR', '2015-2020', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Todd Gurley. Update with official biography.',
  'Placeholder fun fact for Todd Gurley. Update with official fun fact.',
  NULL
),

-- Chris Johnson | TEN | 2008-2016 | era start 2008 ≥ 1990 → no RB adjustment
(
  'Chris Johnson', 'RB', 'TEN', '2008-2016', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Chris Johnson. Update with official biography.',
  'Placeholder fun fact for Chris Johnson. Update with official fun fact.',
  NULL
),

-- Frank Gore | SF | 2005-2021 | era start 2005 ≥ 1990 → no RB adjustment
(
  'Frank Gore', 'RB', 'SF', '2005-2021', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Frank Gore. Update with official biography.',
  'Placeholder fun fact for Frank Gore. Update with official fun fact.',
  NULL
),

-- Jerome Bettis | PIT | 1993-2005 | era start 1993 ≥ 1990 → no RB adjustment
(
  'Jerome Bettis', 'RB', 'PIT', '1993-2005', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Jerome Bettis. Update with official biography.',
  'Placeholder fun fact for Jerome Bettis. Update with official fun fact.',
  NULL
),

-- Thurman Thomas | BUF | 1988-2001 | era start 1988 < 1990 → RB adjustment rec×1.30
(
  'Thurman Thomas', 'RB', 'BUF', '1988-2001', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.30,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Thurman Thomas. Update with official biography.',
  'Placeholder fun fact for Thurman Thomas. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- WIDE RECEIVERS (11)
-- ===========================================================================

-- Torry Holt | STL | 1999-2009 | era start 1999 ≥ 1990 → no WR adjustment
(
  'Torry Holt', 'WR', 'STL', '1999-2009', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Torry Holt. Update with official biography.',
  'Placeholder fun fact for Torry Holt. Update with official fun fact.',
  NULL
),

-- Isaac Bruce | STL | 1994-2009 | era start 1994 ≥ 1990 → no WR adjustment
(
  'Isaac Bruce', 'WR', 'STL', '1994-2009', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Isaac Bruce. Update with official biography.',
  'Placeholder fun fact for Isaac Bruce. Update with official fun fact.',
  NULL
),

-- Anquan Boldin | ARI | 2003-2017 | era start 2003 ≥ 1990 → no WR adjustment
(
  'Anquan Boldin', 'WR', 'ARI', '2003-2017', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Anquan Boldin. Update with official biography.',
  'Placeholder fun fact for Anquan Boldin. Update with official fun fact.',
  NULL
),

-- Hines Ward | PIT | 1998-2011 | era start 1998 ≥ 1990 → no WR adjustment
(
  'Hines Ward', 'WR', 'PIT', '1998-2011', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Hines Ward. Update with official biography.',
  'Placeholder fun fact for Hines Ward. Update with official fun fact.',
  NULL
),

-- Chad Johnson | CIN | 2001-2011 | era start 2001 ≥ 1990 → no WR adjustment
(
  'Chad Johnson', 'WR', 'CIN', '2001-2011', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Chad Johnson. Update with official biography.',
  'Placeholder fun fact for Chad Johnson. Update with official fun fact.',
  NULL
),

-- Steve Smith Sr. | CAR | 2001-2016 | era start 2001 ≥ 1990 → no WR adjustment
(
  'Steve Smith Sr.', 'WR', 'CAR', '2001-2016', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Steve Smith Sr. Update with official biography.',
  'Placeholder fun fact for Steve Smith Sr. Update with official fun fact.',
  NULL
),

-- Keyshawn Johnson | NYJ | 1996-2006 | era start 1996 ≥ 1990 → no WR adjustment
(
  'Keyshawn Johnson', 'WR', 'NYJ', '1996-2006', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Keyshawn Johnson. Update with official biography.',
  'Placeholder fun fact for Keyshawn Johnson. Update with official fun fact.',
  NULL
),

-- Donald Driver | GB | 1999-2012 | era start 1999 ≥ 1990 → no WR adjustment
(
  'Donald Driver', 'WR', 'GB', '1999-2012', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Donald Driver. Update with official biography.',
  'Placeholder fun fact for Donald Driver. Update with official fun fact.',
  NULL
),

-- Reggie Wayne | IND | 2001-2014 | era start 2001 ≥ 1990 → no WR adjustment
(
  'Reggie Wayne', 'WR', 'IND', '2001-2014', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Reggie Wayne. Update with official biography.',
  'Placeholder fun fact for Reggie Wayne. Update with official fun fact.',
  NULL
),

-- Dez Bryant | DAL | 2010-2017 | era start 2010 ≥ 1990 → no WR adjustment
(
  'Dez Bryant', 'WR', 'DAL', '2010-2017', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Dez Bryant. Update with official biography.',
  'Placeholder fun fact for Dez Bryant. Update with official fun fact.',
  NULL
),

-- Julio Jones | ATL | 2011-2022 | era start 2011 ≥ 1990 → no WR adjustment
(
  'Julio Jones', 'WR', 'ATL', '2011-2022', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Julio Jones. Update with official biography.',
  'Placeholder fun fact for Julio Jones. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- TIGHT ENDS (6)
-- ===========================================================================

-- Antonio Gates | SD | 2003-2018 | era start 2003 ≥ 1980 → no TE adjustment
(
  'Antonio Gates', 'TE', 'SD', '2003-2018', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Antonio Gates. Update with official biography.',
  'Placeholder fun fact for Antonio Gates. Update with official fun fact.',
  NULL
),

-- Jason Witten | DAL | 2003-2020 | era start 2003 ≥ 1980 → no TE adjustment
(
  'Jason Witten', 'TE', 'DAL', '2003-2020', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Jason Witten. Update with official biography.',
  'Placeholder fun fact for Jason Witten. Update with official fun fact.',
  NULL
),

-- Jeremy Shockey | NYG | 2002-2011 | era start 2002 ≥ 1980 → no TE adjustment
(
  'Jeremy Shockey', 'TE', 'NYG', '2002-2011', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Jeremy Shockey. Update with official biography.',
  'Placeholder fun fact for Jeremy Shockey. Update with official fun fact.',
  NULL
),

-- Jimmy Graham | NO | 2010-2019 | era start 2010 ≥ 1980 → no TE adjustment
(
  'Jimmy Graham', 'TE', 'NO', '2010-2019', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Jimmy Graham. Update with official biography.',
  'Placeholder fun fact for Jimmy Graham. Update with official fun fact.',
  NULL
),

-- Todd Christensen | RAI | 1979-1988 | era start 1979 < 1980 → TE adjustment rec×1.35, rec_yds×1.25
(
  'Todd Christensen', 'TE', 'RAI', '1979-1988', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.35,"rec_yds":1.25,"rec_tds":1.0}',
  'Placeholder bio for Todd Christensen. Update with official biography.',
  'Placeholder fun fact for Todd Christensen. Update with official fun fact.',
  NULL
),

-- Dallas Clark | IND | 2003-2012 | era start 2003 ≥ 1980 → no TE adjustment
(
  'Dallas Clark', 'TE', 'IND', '2003-2012', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Dallas Clark. Update with official biography.',
  'Placeholder fun fact for Dallas Clark. Update with official fun fact.',
  NULL
),

-- ===========================================================================
-- KICKERS (2)
-- ===========================================================================

-- Gary Anderson | MIN | 1982-2004 | no adjustment for K
(
  'Gary Anderson', 'K', 'MIN', '1982-2004', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for Gary Anderson. Update with official biography.',
  'Placeholder fun fact for Gary Anderson. Update with official fun fact.',
  NULL
),

-- David Akers | PHI | 1999-2013 | no adjustment for K
(
  'David Akers', 'K', 'PHI', '1999-2013', 'hero', 2, false,
  '{"pass_yds":1.0,"pass_tds":1.0,"ints":1.0,"rush_yds":1.0,"rush_tds":1.0,"rec":1.0,"rec_yds":1.0,"rec_tds":1.0}',
  'Placeholder bio for David Akers. Update with official biography.',
  'Placeholder fun fact for David Akers. Update with official fun fact.',
  NULL
);
