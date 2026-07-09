-- =============================================================================
-- Migration 016: Profile badges
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: badges  (static catalog of every possible badge)
-- tier_levels: count thresholds for leveling, e.g. {"bronze":1,"silver":2,"gold":5}
--              NULL for single-level badges (earned once).
-- ---------------------------------------------------------------------------
CREATE TABLE public.badges (
  id          TEXT    NOT NULL PRIMARY KEY,     -- e.g. 'league_champion'
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL,
  tier_levels JSONB,                            -- NULL = single-level
  icon        TEXT    NOT NULL,                 -- emoji
  is_cosmetic BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 100
);

-- ---------------------------------------------------------------------------
-- TABLE: user_badges  (one row per user per badge; count/level updated on re-earn)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_badges (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL,
  badge_id   TEXT        NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  league_id  UUID        REFERENCES public.leagues(id)     ON DELETE SET NULL,
  season_id  UUID        REFERENCES public.app_seasons(id) ON DELETE SET NULL,
  level      TEXT        NOT NULL DEFAULT 'earned',   -- bronze | silver | gold | earned
  count      INTEGER     NOT NULL DEFAULT 1,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON public.user_badges (user_id);

-- ---------------------------------------------------------------------------
-- RLS: any authenticated user can read the catalog and anyone's badges.
-- Inserts/updates happen only via the service role (no write policies).
-- ---------------------------------------------------------------------------
ALTER TABLE public.badges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read badge catalog"
  ON public.badges FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read user badges"
  ON public.user_badges FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Extend the activity feed CHECK to allow badge_earned events
-- ---------------------------------------------------------------------------
ALTER TABLE public.league_activity
  DROP CONSTRAINT IF EXISTS league_activity_event_type_check;

ALTER TABLE public.league_activity
  ADD CONSTRAINT league_activity_event_type_check
  CHECK (event_type IN (
    'member_joined', 'draft_complete', 'trade_accepted',
    'pack_opened', 'player_dropped', 'matchup_final', 'announcement',
    'member_removed', 'trade_cancelled', 'week_reset',
    'pack_deadline_extended', 'lineup_lock',
    'badge_earned'
  ));

-- ---------------------------------------------------------------------------
-- Seed: badge catalog
-- ---------------------------------------------------------------------------
INSERT INTO public.badges (id, name, description, tier_levels, icon, is_cosmetic, sort_order) VALUES
  ('league_champion',  'League Champion',  'Win your league''s championship.',                        '{"bronze":1,"silver":2,"gold":5}', '🏆', FALSE, 10),
  ('runner_up',        'Runner-Up',        'Finish second in your league championship.',              '{"bronze":1,"silver":3,"gold":7}', '🥈', FALSE, 20),
  ('best_draft_grade', 'Draft Genius',     'Earn the highest draft grade in your league.',            '{"bronze":1,"silver":3,"gold":7}', '🎯', FALSE, 30),
  ('weekly_high_score','Weekly High Score','Post the highest score in your league in a week.',        '{"bronze":1,"silver":5,"gold":20}','🔥', TRUE,  40),
  ('perfect_lineup',   'Perfect Lineup',   'Start the optimal lineup for a full week.',               NULL, '💯', FALSE, 50),
  ('legend_puller',    'Legend Puller',    'Pull a Legend-tier player from a pack.',                  NULL, '🃏', FALSE, 60),
  ('playoff_hunter',   'Playoff Hunter',   'Make the playoffs.',                                      NULL, '🎟️', FALSE, 70),
  ('chaos_theory',     'Chaos Theory',     'Win a matchup despite the lowest projected score.',       NULL, '🎲', FALSE, 80),
  ('season_sweep',     'Season Sweep',     'Finish the regular season undefeated.',                   NULL, '🧹', FALSE, 90),
  ('deal_maker',       'Deal Maker',       'Complete 5 trades.',                                      NULL, '🤝', FALSE, 100),
  ('bracket_buster',   'Bracket Buster',   'Win a playoff game as the lower seed.',                   NULL, '💥', FALSE, 110),
  ('redemption_arc',   'Redemption Arc',   'Win the consolation bracket.',                            NULL, '🎢', FALSE, 120)
ON CONFLICT (id) DO NOTHING;
