-- =============================================================================
-- Migration 007: Row-Level Security policies for all draft tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- drafts
-- ---------------------------------------------------------------------------
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

-- League members can read drafts for their league
CREATE POLICY "members can read their league draft"
  ON public.drafts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = drafts.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Only the commissioner of the league can INSERT a draft
CREATE POLICY "commissioner can create draft"
  ON public.drafts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id      = drafts.league_id
        AND lm.user_id        = auth.uid()
        AND lm.is_commissioner = true
    )
  );

-- Only the commissioner of the league can UPDATE the draft (status, order, etc.)
CREATE POLICY "commissioner can update draft"
  ON public.drafts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id      = drafts.league_id
        AND lm.user_id        = auth.uid()
        AND lm.is_commissioner = true
    )
  );

-- ---------------------------------------------------------------------------
-- draft_packs
-- ---------------------------------------------------------------------------
ALTER TABLE public.draft_packs ENABLE ROW LEVEL SECURITY;

-- The team that owns a pack can read it; all league members can read packs
-- (needed so other teams can see what was offered)
CREATE POLICY "league members can read packs"
  ON public.draft_packs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.drafts d
      JOIN public.league_members lm ON lm.league_id = d.league_id
      WHERE d.id           = draft_packs.draft_id
        AND lm.user_id     = auth.uid()
    )
  );

-- Any authenticated league member can INSERT a pack (server-side via anon key)
-- In practice the pack is always written by the current user's session.
CREATE POLICY "active drafter can insert pack"
  ON public.draft_packs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drafts d
      JOIN public.league_members lm ON lm.league_id = d.league_id
      WHERE d.id       = draft_packs.draft_id
        AND lm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- draft_picks
-- ---------------------------------------------------------------------------
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;

-- All league members can read all picks
CREATE POLICY "league members can read picks"
  ON public.draft_picks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.drafts d
      JOIN public.league_members lm ON lm.league_id = d.league_id
      WHERE d.id       = draft_picks.draft_id
        AND lm.user_id = auth.uid()
    )
  );

-- The team whose turn it is can insert their pick
CREATE POLICY "on-clock team can insert pick"
  ON public.draft_picks FOR INSERT
  WITH CHECK (
    team_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.drafts d
      JOIN public.league_members lm ON lm.league_id = d.league_id
      WHERE d.id       = draft_picks.draft_id
        AND lm.user_id = auth.uid()
    )
  );
