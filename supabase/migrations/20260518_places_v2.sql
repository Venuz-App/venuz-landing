-- Add URL, tags, visited status to places table
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS url         TEXT,
  ADD COLUMN IF NOT EXISTS tags        TEXT[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visited     BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS visited_at  TIMESTAMPTZ;
