-- =============================================================================
-- Migration 005: Draft Room tables
-- Draft Prime — drafts, draft_picks, draft_packs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE 1: drafts
-- One row per draft event; tracks status and whose turn it is.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drafts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id             UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'helmet_race', 'active', 'complete')),
  current_pick_number   INTEGER NOT NULL DEFAULT 1,          -- 1-based overall pick counter
  current_team_user_id  UUID,                                -- user_id of team on the clock
  draft_order           UUID[] NOT NULL DEFAULT '{}',        -- ordered array of user_ids (snake order)
  total_rounds          INTEGER NOT NULL DEFAULT 10,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drafts_league_id_idx ON public.drafts (league_id);

-- ---------------------------------------------------------------------------
-- TABLE 2: draft_packs
-- One row per pack offered to a team. Created server-side before the pick.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draft_packs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  pick_number     INTEGER NOT NULL,              -- overall pick this pack was generated for
  team_user_id    UUID NOT NULL,                 -- which team received this pack
  pack_odds_type  TEXT NOT NULL
                    CHECK (pack_odds_type IN ('captain', 'legend', 'normal')),
  player_ids      UUID[] NOT NULL DEFAULT '{}',  -- ordered array of 5 player IDs; index 4 = best
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS draft_packs_draft_id_idx        ON public.draft_packs (draft_id);
CREATE INDEX IF NOT EXISTS draft_packs_team_user_id_idx    ON public.draft_packs (draft_id, team_user_id);

-- ---------------------------------------------------------------------------
-- TABLE 3: draft_picks
-- One row per completed pick. Written when a team selects from their pack.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draft_picks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  pack_id         UUID REFERENCES public.draft_packs(id),   -- which pack the pick came from
  pick_number     INTEGER NOT NULL,             -- overall pick number (1-based)
  round           INTEGER NOT NULL,
  pick_in_round   INTEGER NOT NULL,             -- position within the round (1-based)
  team_user_id    UUID NOT NULL,                -- who made the pick
  player_id       UUID NOT NULL REFERENCES public.players(id),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_draft_pick_num_idx ON public.draft_picks (draft_id, pick_number);
CREATE INDEX IF NOT EXISTS draft_picks_draft_team_idx            ON public.draft_picks (draft_id, team_user_id);
CREATE INDEX IF NOT EXISTS draft_picks_player_idx                ON public.draft_picks (player_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for drafts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drafts_set_updated_at ON public.drafts;
CREATE TRIGGER drafts_set_updated_at
  BEFORE UPDATE ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Supabase Realtime — enable change events on live draft tables
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_picks;
