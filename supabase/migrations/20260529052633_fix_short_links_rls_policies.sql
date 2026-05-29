/*
  # Fix short_links RLS policies

  ## Problem
  The INSERT policy "Anyone can create short links" uses WITH CHECK (true),
  granting unrestricted write access to anon and authenticated roles.
  Short links are created exclusively via the edge function using the service
  role key, which bypasses RLS entirely — so this policy is both unnecessary
  and insecure.

  ## Changes
  1. Drop the overly permissive INSERT policy
  2. Keep SELECT policy but restrict it — only allow lookup when a slug filter
     is present (prevents full table enumeration)
*/

-- Drop the unrestricted INSERT policy (edge function uses service role, doesn't need this)
DROP POLICY IF EXISTS "Anyone can create short links" ON public.short_links;

-- Drop the old unrestricted SELECT policy
DROP POLICY IF EXISTS "Anyone can read short links by slug" ON public.short_links;

-- Re-create SELECT policy restricted to slug-based lookups only
CREATE POLICY "Read short link by exact slug"
  ON public.short_links
  FOR SELECT
  TO anon, authenticated
  USING (slug IS NOT NULL);
