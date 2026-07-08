-- =============================================================================
-- Migration 013: Allow authenticated users to read any profile
-- Needed by: league home, draft lobby, trade page, standings, matchup
-- =============================================================================

-- Profiles must be readable by all authenticated users so that team names,
-- display names, and helmet data are visible league-wide.

-- Drop any overly-restrictive existing read policy if it exists
DROP POLICY IF EXISTS "Users can view own profile"            ON public.profiles;
DROP POLICY IF EXISTS "users can view own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "authenticated users can read profiles" ON public.profiles;

-- Allow any signed-in user to read any profile row
CREATE POLICY "authenticated users can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Retain: users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "users can update own profile"  ON public.profiles;

CREATE POLICY "users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Retain: users can insert their own profile (for onboarding)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "users can insert own profile" ON public.profiles;

CREATE POLICY "users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
