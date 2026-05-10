-- =============================================================================
-- Migration 008: Weekly scoring engine tables
-- Draft Prime — app_seasons, weekly_matchups, weekly_player_scores,
--               league_standings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE 1: app_seasons
-- One row per in-game season.  Season 1 = first draft cohort.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_seasons (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number   INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'complete', 'offseason')),
  current_week    INTEGER NOT NULL DEFAULT 1,
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_seasons_number
  ON public.app_seasons (season_number);

-- ---------------------------------------------------------------------------
-- TABLE 2: weekly_matchups
-- One row per matchup per week per league.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_matchups (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id            UUID        NOT NULL REFERENCES public.app_seasons(id) ON DELETE CASCADE,
  league_id            UUID        NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  week                 INTEGER     NOT NULL,
  home_team_user_id    UUID        NOT NULL,
  away_team_user_id    UUID        NOT NULL,
  home_score           NUMERIC(6,2) NOT NULL DEFAULT 0,
  away_score           NUMERIC(6,2) NOT NULL DEFAULT 0,
  status               TEXT        NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'scoring', 'complete')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_matchups_league_week
  ON public.weekly_matchups (league_id, week);

CREATE INDEX IF NOT EXISTS idx_weekly_matchups_season_league
  ON public.weekly_matchups (season_id, league_id);

-- Prevent duplicate matchups for the same pairing in the same week
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_matchups_unique
  ON public.weekly_matchups (league_id, season_id, week, home_team_user_id, away_team_user_id);

-- ---------------------------------------------------------------------------
-- TABLE 3: weekly_player_scores
-- One row per player per team per week.  game_revealed flips to true when
-- the week's scoring is "unlocked" for display.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_player_scores (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id         UUID        NOT NULL REFERENCES public.app_seasons(id)    ON DELETE CASCADE,
  league_id         UUID        NOT NULL REFERENCES public.leagues(id)         ON DELETE CASCADE,
  week              INTEGER     NOT NULL,
  user_id           UUID        NOT NULL,
  player_id         UUID        NOT NULL REFERENCES public.players(id),
  player_season_id  UUID        NOT NULL REFERENCES public.player_seasons(id),
  game_id           UUID        NOT NULL REFERENCES public.player_games(id),
  score             NUMERIC(6,2),
  is_starter        BOOLEAN     NOT NULL DEFAULT false,
  slot              TEXT,
  game_revealed     BOOLEAN     NOT NULL DEFAULT false,
  game_blurb        TEXT,                          -- AI-generated post-scoring blurb
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: which scores exist for a given league/week/team?
CREATE INDEX IF NOT EXISTS idx_wps_league_week_user
  ON public.weekly_player_scores (league_id, season_id, week, user_id);

-- Used-game exclusion lookup: which games has this player already played?
CREATE INDEX IF NOT EXISTS idx_wps_player_season
  ON public.weekly_player_scores (player_id, season_id);

-- Prevent the same player being scored twice for the same team in the same week
CREATE UNIQUE INDEX IF NOT EXISTS idx_wps_unique
  ON public.weekly_player_scores (league_id, season_id, week, user_id, player_id);

-- ---------------------------------------------------------------------------
-- TABLE 4: league_standings
-- Running win/loss totals for each team in each season.
-- Upserted after every week completes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.league_standings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        UUID        NOT NULL REFERENCES public.app_seasons(id) ON DELETE CASCADE,
  league_id        UUID        NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  user_id          UUID        NOT NULL,
  wins             INTEGER     NOT NULL DEFAULT 0,
  losses           INTEGER     NOT NULL DEFAULT 0,
  points_for       NUMERIC(8,2) NOT NULL DEFAULT 0,
  points_against   NUMERIC(8,2) NOT NULL DEFAULT 0,
  current_streak   INTEGER     NOT NULL DEFAULT 0,   -- positive = win streak, negative = lose streak
  longest_streak   INTEGER     NOT NULL DEFAULT 0,   -- longest win streak this season
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_league_standings_unique
  ON public.league_standings (season_id, league_id, user_id);

CREATE INDEX IF NOT EXISTS idx_league_standings_league
  ON public.league_standings (league_id, season_id);

-- ---------------------------------------------------------------------------
-- RLS: authenticated users can read scoring data for their leagues.
-- Server-side scripts use the service role and bypass RLS entirely.
-- ---------------------------------------------------------------------------
ALTER TABLE public.app_seasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_matchups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_player_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings      ENABLE ROW LEVEL SECURITY;

-- app_seasons: anyone authenticated can read
CREATE POLICY "authenticated can read seasons"
  ON public.app_seasons FOR SELECT
  TO authenticated USING (true);

-- weekly_matchups: league members can read their league's matchups
CREATE POLICY "league members can read matchups"
  ON public.weekly_matchups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = weekly_matchups.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- weekly_player_scores: league members can read scores for their league
CREATE POLICY "league members can read scores"
  ON public.weekly_player_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = weekly_player_scores.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- league_standings: league members can read standings
CREATE POLICY "league members can read standings"
  ON public.league_standings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = league_standings.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Seed: Season 1
-- ---------------------------------------------------------------------------
INSERT INTO public.app_seasons (season_number, status, current_week, start_date, end_date)
VALUES (1, 'active', 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '17 weeks')
ON CONFLICT (season_number) DO NOTHING;
