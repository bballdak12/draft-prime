-- Add avg_fppg column to players table.
-- Stores the mean half-PPR score across all eligible games for a card,
-- used for OVR normalization and display. Written by calculate-card-stats.js.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS avg_fppg DECIMAL;
