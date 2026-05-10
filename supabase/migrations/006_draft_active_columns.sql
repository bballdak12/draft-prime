-- =============================================================================
-- Migration 006: Active draft columns
-- Adds pick_deadline to drafts and is_auto_draft to draft_picks
-- Run this in the Supabase SQL editor before using State 3.
-- =============================================================================

ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS pick_deadline TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.draft_picks
  ADD COLUMN IF NOT EXISTS is_auto_draft BOOLEAN NOT NULL DEFAULT false;
