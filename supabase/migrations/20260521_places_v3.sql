-- Add columns for address, coordinates, URL, hours, import metadata, and status tracking.
-- Run this in Supabase SQL editor if not already applied.

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS status            TEXT             DEFAULT 'want_to_go',
  ADD COLUMN IF NOT EXISTS visited_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_range       TEXT,
  ADD COLUMN IF NOT EXISTS hours             TEXT,
  ADD COLUMN IF NOT EXISTS address           TEXT,
  ADD COLUMN IF NOT EXISTS url               TEXT,
  ADD COLUMN IF NOT EXISTS lat               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS original_saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags              TEXT[]           DEFAULT '{}';
