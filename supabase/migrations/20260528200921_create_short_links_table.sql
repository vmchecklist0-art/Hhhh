/*
  # Create short_links table

  ## Purpose
  Stores URL shortener mappings for the Location page share/custom links.

  ## New Tables
  - `short_links`
    - `id` (uuid, primary key)
    - `slug` (text, unique) — short alphanumeric code used in the URL
    - `long_url` (text) — the full destination URL with encoded view state
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Anyone can read (resolve) a short link by slug (public SELECT)
  - Anyone can insert a new short link (public INSERT) — slugs are random, no sensitive data
  - No update or delete policies (links are immutable once created)
*/

CREATE TABLE IF NOT EXISTS short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  long_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read short links by slug"
  ON short_links
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create short links"
  ON short_links
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS short_links_slug_idx ON short_links (slug);
