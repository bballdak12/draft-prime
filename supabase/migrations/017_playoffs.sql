-- =============================================================================
-- Migration 017: Playoff brackets
-- Draft Prime — playoff_brackets, playoff_matchups
--
-- Weeks 15-17 are playoff weeks (regular season is weeks 1-14, see 008).
-- Seeds 1-6 play the championship bracket; seeds 7-12 the consolation bracket.
-- Both are 6-team single elimination: seeds 1 & 2 receive a first-round bye.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE 1: playoff_brackets
-- One row per bracket per league per season (at most 2: championship + consolation).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playoff_brackets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID        NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  season_id    UUID        NOT NULL REFERENCES public.app_seasons(id) ON DELETE CASCADE,
  bracket_type TEXT        NOT NULL CHECK (bracket_type IN ('championship', 'consolation')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A league gets at most one bracket of each type per season. Also the conflict
-- target that makes bracket generation safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS idx_playoff_brackets_unique
  ON public.playoff_brackets (league_id, season_id, bracket_type);

-- ---------------------------------------------------------------------------
-- TABLE 2: playoff_matchups
-- One row per bracket slot. Round 1 = week 15, round 2 = semis (week 16),
-- round 3 = final (week 17).
--
-- high_seed_user_id / low_seed_user_id are NULLABLE: a round-2 or round-3 slot
-- has no occupant until the matchup feeding it completes. "high seed" means the
-- numerically lower (better) seed — seed 1 is the highest seed.
--
-- feeds_into_matchup_id + feeds_into_slot say where this matchup's winner goes.
-- feeds_into_slot is not in the original spec but is required for determinism:
-- without it, advancing a winner into a matchup with two empty slots is
-- ambiguous. Slots are normalized by seed once both sides are known.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playoff_matchups (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_id            UUID         NOT NULL REFERENCES public.playoff_brackets(id) ON DELETE CASCADE,
  league_id             UUID         NOT NULL REFERENCES public.leagues(id)          ON DELETE CASCADE,
  season_id             UUID         NOT NULL REFERENCES public.app_seasons(id)      ON DELETE CASCADE,
  week                  INTEGER      NOT NULL CHECK (week IN (15, 16, 17)),
  round                 INTEGER      NOT NULL CHECK (round IN (1, 2, 3)),
  high_seed_user_id     UUID,
  low_seed_user_id      UUID,
  high_seed             INTEGER,
  low_seed              INTEGER,
  high_score            NUMERIC(6,2) NOT NULL DEFAULT 0,
  low_score             NUMERIC(6,2) NOT NULL DEFAULT 0,
  winner_user_id        UUID,
  status                TEXT         NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'scoring', 'complete')),
  feeds_into_matchup_id UUID         REFERENCES public.playoff_matchups(id) ON DELETE SET NULL,
  feeds_into_slot       TEXT         CHECK (feeds_into_slot IN ('high', 'low')),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Page load: every matchup in a league's bracket, ordered by round.
CREATE INDEX IF NOT EXISTS idx_playoff_matchups_bracket
  ON public.playoff_matchups (bracket_id, round);

-- Scoring engine: "which playoff matchups are live this week?"
CREATE INDEX IF NOT EXISTS idx_playoff_matchups_league_week
  ON public.playoff_matchups (league_id, season_id, week);

-- Advancement: resolve the feeder chain without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_playoff_matchups_feeds_into
  ON public.playoff_matchups (feeds_into_matchup_id)
  WHERE feeds_into_matchup_id IS NOT NULL;

-- Exactly one final per bracket. Rounds 1-2 can hold several matchups, so they
-- are not constrained here; generation is guarded by the unique index on
-- playoff_brackets, which prevents a bracket (and its matchups) being built twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_playoff_matchups_one_final
  ON public.playoff_matchups (bracket_id)
  WHERE round = 3;

-- ---------------------------------------------------------------------------
-- RLS: league members read their own league's brackets.
-- Writes happen only through the service role (bracket generation + scoring),
-- so no INSERT/UPDATE policies are defined.
-- ---------------------------------------------------------------------------
ALTER TABLE public.playoff_brackets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playoff_matchups  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "league members can read brackets"
  ON public.playoff_brackets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = playoff_brackets.league_id
        AND lm.user_id   = auth.uid()
    )
  );

CREATE POLICY "league members can read playoff matchups"
  ON public.playoff_matchups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = playoff_matchups.league_id
        AND lm.user_id   = auth.uid()
    )
  );
