-- =============================================================================
-- Migration 001: Player database tables
-- Draft Prime — players, player_seasons, player_games, legend_career_games
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE 1: players
-- Master table for every draftable card across all tiers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  position                  TEXT NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'DST', 'K')),
  team                      TEXT,
  era                       TEXT,                      -- e.g. "1985-2004"
  tier                      TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'hero', 'legend')),
  overall_rating            INTEGER CHECK (overall_rating BETWEEN 60 AND 99),
  prime_seasons_count       INTEGER,                   -- 5/4/3/2/1 by tier
  ceiling                   DECIMAL,                   -- avg of 5 highest eligible games
  consistency               DECIMAL,                   -- % of games within 20% of season avg
  floor                     DECIMAL,                   -- avg of 5 lowest eligible games
  is_active                 BOOLEAN DEFAULT true,      -- false for retired players
  era_adjustment_multiplier JSONB,                     -- e.g. {"pass_yds":1.1,"pass_tds":1.0,"ints":1.0,"rec":1.05,"rec_yds":1.1}
  card_back_bio             TEXT,                      -- hero/legend card bio
  card_back_fun_fact        TEXT,                      -- "did you know" fact
  photo_url                 TEXT,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TABLE 2: player_seasons
-- One row per prime season per player.
-- Seasons are ranked 1=best, 2=second-best, etc. up to prime_seasons_count.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_seasons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  season_year  INTEGER NOT NULL,                       -- e.g. 1995, 2007
  games_played INTEGER,
  fppg         DECIMAL,                                -- fantasy points per game this season
  season_rank  INTEGER,                                -- 1 = best season, 2 = second best, etc.
  is_eligible  BOOLEAN DEFAULT true,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TABLE 3: player_games
-- Every individual game in a player's prime season pool.
-- Stat columns default to 0 so FPPG calculation never hits NULL arithmetic.
-- is_eligible = false if player appeared in < half the game (injury threshold).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  season_id             UUID NOT NULL REFERENCES public.player_seasons(id) ON DELETE CASCADE,
  game_date             DATE,
  opponent              TEXT,
  is_playoff            BOOLEAN DEFAULT false,
  week                  INTEGER,

  -- Passing
  pass_yards            INTEGER DEFAULT 0,
  pass_tds              INTEGER DEFAULT 0,
  interceptions         INTEGER DEFAULT 0,

  -- Rushing
  rush_yards            INTEGER DEFAULT 0,
  rush_tds              INTEGER DEFAULT 0,

  -- Receiving
  receptions            INTEGER DEFAULT 0,
  rec_yards             INTEGER DEFAULT 0,
  rec_tds               INTEGER DEFAULT 0,

  -- DST
  sacks                 DECIMAL DEFAULT 0,
  tfl                   INTEGER DEFAULT 0,
  dst_ints              INTEGER DEFAULT 0,
  fumble_recoveries     INTEGER DEFAULT 0,
  dst_tds               INTEGER DEFAULT 0,
  safeties              INTEGER DEFAULT 0,

  -- Kicker
  fg_under_40           INTEGER DEFAULT 0,
  fg_40_49              INTEGER DEFAULT 0,
  fg_50_plus            INTEGER DEFAULT 0,
  pat_made              INTEGER DEFAULT 0,

  -- Snap count (injury threshold check)
  snaps_played          INTEGER,
  total_snaps           INTEGER,

  -- Calculated scores
  raw_fantasy_points    DECIMAL,                       -- before era adjustments
  adjusted_fantasy_points DECIMAL,                     -- after era adjustments

  is_eligible           BOOLEAN DEFAULT true,          -- false if < half the game
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TABLE 4: legend_career_games
-- The 5 best individual games from across a Legend's entire career.
-- These get added to the Legend's pool on top of their prime season games.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legend_career_games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  game_date             DATE,
  opponent              TEXT,
  season_year           INTEGER,
  is_playoff            BOOLEAN DEFAULT false,
  week                  INTEGER,

  -- Passing
  pass_yards            INTEGER DEFAULT 0,
  pass_tds              INTEGER DEFAULT 0,
  interceptions         INTEGER DEFAULT 0,

  -- Rushing
  rush_yards            INTEGER DEFAULT 0,
  rush_tds              INTEGER DEFAULT 0,

  -- Receiving
  receptions            INTEGER DEFAULT 0,
  rec_yards             INTEGER DEFAULT 0,
  rec_tds               INTEGER DEFAULT 0,

  -- DST
  sacks                 DECIMAL DEFAULT 0,
  tfl                   INTEGER DEFAULT 0,
  dst_ints              INTEGER DEFAULT 0,
  fumble_recoveries     INTEGER DEFAULT 0,
  dst_tds               INTEGER DEFAULT 0,
  safeties              INTEGER DEFAULT 0,

  -- Kicker
  fg_under_40           INTEGER DEFAULT 0,
  fg_40_49              INTEGER DEFAULT 0,
  fg_50_plus            INTEGER DEFAULT 0,
  pat_made              INTEGER DEFAULT 0,

  adjusted_fantasy_points DECIMAL,
  career_game_rank      INTEGER CHECK (career_game_rank BETWEEN 1 AND 5),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- player_seasons
CREATE INDEX IF NOT EXISTS idx_player_seasons_player_id
  ON public.player_seasons(player_id);

-- player_games
CREATE INDEX IF NOT EXISTS idx_player_games_player_id
  ON public.player_games(player_id);

CREATE INDEX IF NOT EXISTS idx_player_games_season_id
  ON public.player_games(season_id);

-- legend_career_games
CREATE INDEX IF NOT EXISTS idx_legend_career_games_player_id
  ON public.legend_career_games(player_id);

-- players — common filter columns
CREATE INDEX IF NOT EXISTS idx_players_tier
  ON public.players(tier);

CREATE INDEX IF NOT EXISTS idx_players_position
  ON public.players(position);

CREATE INDEX IF NOT EXISTS idx_players_is_active
  ON public.players(is_active);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.players            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_seasons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_games       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legend_career_games ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- READ: any authenticated user can read all player data
-- ---------------------------------------------------------------------------
CREATE POLICY "Authenticated users can read players"
  ON public.players FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read player_seasons"
  ON public.player_seasons FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read player_games"
  ON public.player_games FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read legend_career_games"
  ON public.legend_career_games FOR SELECT
  TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- WRITE: blocked for all browser clients.
-- Player data is loaded via server-side scripts using the Supabase service
-- role key, which bypasses RLS entirely — no browser-facing write policy needed.
-- If you need admin UI writes in future, add a policy that checks
-- (auth.jwt() ->> 'role') = 'admin' after setting that claim on admin accounts.
-- ---------------------------------------------------------------------------
