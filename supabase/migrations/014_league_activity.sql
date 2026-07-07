-- =============================================================================
-- Migration 014: League activity feed
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: league_activity
-- One row per feed event. Written server-side only (service role); league
-- members read their league's feed. payload carries event-specific display
-- data (player names, scores, etc.) so the feed renders without joins.
-- ---------------------------------------------------------------------------
CREATE TABLE public.league_activity (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id  UUID        NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  season_id  UUID        REFERENCES public.app_seasons(id)          ON DELETE SET NULL,
  user_id    UUID,       -- actor; NULL for system events (matchup finals, etc.)
  event_type TEXT        NOT NULL
               CHECK (event_type IN (
                 'member_joined', 'draft_complete', 'trade_accepted',
                 'pack_opened', 'player_dropped', 'matchup_final',
                 'announcement'
               )),
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed query: latest N events for a league, reverse chronological
CREATE INDEX idx_league_activity_league_created
  ON public.league_activity (league_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: league members can read their league's feed.
-- No INSERT/UPDATE/DELETE policies — writes happen exclusively through the
-- service role (API routes / server scripts), which bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.league_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "league members can read activity"
  ON public.league_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = league_activity.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: broadcast INSERTs so feeds update live.
-- (Realtime respects the SELECT policy above — members only.)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_activity;
