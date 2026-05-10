-- Add helmet customisation columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS helmet_color     TEXT DEFAULT '#1B2A4A',
  ADD COLUMN IF NOT EXISTS helmet_secondary TEXT DEFAULT '#F0B429',
  ADD COLUMN IF NOT EXISTS helmet_pattern   TEXT DEFAULT 'solid';
