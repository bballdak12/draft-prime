-- =============================================================================
-- Migration 015: Commissioner tools
-- =============================================================================

-- ---------------------------------------------------------------------------
-- League-level commissioner settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS announcement            TEXT,
  ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_lineup_lock      BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- Bot flag for draft auto-pick
-- ---------------------------------------------------------------------------
ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- Extend activity event types so every commissioner action can be logged.
-- (014 created event_type with an inline CHECK; Postgres auto-named it
--  league_activity_event_type_check.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.league_activity
  DROP CONSTRAINT IF EXISTS league_activity_event_type_check;

ALTER TABLE public.league_activity
  ADD CONSTRAINT league_activity_event_type_check
  CHECK (event_type IN (
    'member_joined', 'draft_complete', 'trade_accepted',
    'pack_opened', 'player_dropped', 'matchup_final', 'announcement',
    -- commissioner actions
    'member_removed', 'trade_cancelled', 'week_reset',
    'pack_deadline_extended', 'lineup_lock'
  ));
