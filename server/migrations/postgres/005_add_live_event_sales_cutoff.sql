ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS sales_cutoff_at TEXT;
