-- =============================================================================
-- Migration 009: Allow authenticated users to read player_games
--
-- The player_games table has RLS enabled (or defaults deny the authenticated
-- role) which causes the browser client to get 0 rows silently.
-- Adding a simple open SELECT policy lets the matchup page fetch game stats.
-- =============================================================================

-- Ensure RLS is enabled (safe to run even if already enabled)
ALTER TABLE public.player_games ENABLE ROW LEVEL SECURITY;

-- Drop the policy first so this migration is re-runnable
DROP POLICY IF EXISTS "authenticated users can read player_games" ON public.player_games;

-- Any logged-in user may read any player_game row (public reference data)
CREATE POLICY "authenticated users can read player_games"
  ON public.player_games
  FOR SELECT
  TO authenticated
  USING (true);
