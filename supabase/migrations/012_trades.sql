-- =============================================================================
-- Migration 012: Trade system
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: trades
-- ---------------------------------------------------------------------------
CREATE TABLE public.trades (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id        UUID        NOT NULL REFERENCES public.leagues(id)     ON DELETE CASCADE,
  season_id        UUID        NOT NULL REFERENCES public.app_seasons(id) ON DELETE CASCADE,
  proposer_user_id UUID        NOT NULL,
  receiver_user_id UUID        NOT NULL,
  proposer_players UUID[]      NOT NULL DEFAULT '{}',
  receiver_players UUID[]      NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','accepted','rejected','cancelled','expired')),
  message          TEXT        CHECK (char_length(message) <= 200),
  proposed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours'
);

CREATE INDEX idx_trades_league   ON public.trades (league_id);
CREATE INDEX idx_trades_proposer ON public.trades (proposer_user_id);
CREATE INDEX idx_trades_receiver ON public.trades (receiver_user_id);
CREATE INDEX idx_trades_status   ON public.trades (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Proposer, receiver, and all league members can read trades (for history tab)
CREATE POLICY "league members can view trades"
  ON public.trades FOR SELECT
  USING (
    proposer_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = trades.league_id AND lm.user_id = auth.uid()
    )
  );

-- Only the proposer can create a trade
CREATE POLICY "proposer can create trade"
  ON public.trades FOR INSERT
  WITH CHECK (proposer_user_id = auth.uid());

-- Proposer (cancel) and receiver (reject) can update status directly
CREATE POLICY "parties can update trade status"
  ON public.trades FOR UPDATE
  USING  (proposer_user_id = auth.uid() OR receiver_user_id = auth.uid())
  WITH CHECK (proposer_user_id = auth.uid() OR receiver_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- FUNCTION: accept_trade
-- Atomically swaps draft_picks ownership and marks the trade accepted.
-- SECURITY DEFINER lets it bypass RLS on draft_picks (owned by postgres).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_trade(p_trade_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t   public.trades%ROWTYPE;
  did UUID;
BEGIN
  -- Lock and validate: only the receiver of a pending, non-expired trade may accept
  SELECT * INTO t
  FROM public.trades
  WHERE id               = p_trade_id
    AND receiver_user_id = auth.uid()
    AND status           = 'pending'
    AND expires_at       > NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found, already resolved, or expired';
  END IF;

  -- Most recent draft for this league (trades always apply to the latest draft)
  SELECT id INTO did
  FROM public.drafts
  WHERE league_id = t.league_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF did IS NULL THEN
    RAISE EXCEPTION 'No draft found for league %', t.league_id;
  END IF;

  -- Transfer proposer's players → receiver
  UPDATE public.draft_picks
    SET team_user_id = t.receiver_user_id
  WHERE draft_id = did
    AND player_id = ANY(t.proposer_players);

  -- Transfer receiver's players → proposer
  UPDATE public.draft_picks
    SET team_user_id = t.proposer_user_id
  WHERE draft_id = did
    AND player_id = ANY(t.receiver_players);

  -- Mark accepted
  UPDATE public.trades
    SET status       = 'accepted',
        responded_at = NOW()
  WHERE id = p_trade_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_trade(UUID) TO authenticated;
