-- Places v2: new columns for URL, tags, visited state, address, coordinates, and import date
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS url               TEXT,
  ADD COLUMN IF NOT EXISTS tags              TEXT[]           DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visited           BOOLEAN          DEFAULT false,
  ADD COLUMN IF NOT EXISTS visited_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address           TEXT,
  ADD COLUMN IF NOT EXISTS lat               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS original_saved_at TIMESTAMPTZ;
