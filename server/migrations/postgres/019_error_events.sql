-- 019_error_events.sql
--
-- In-house error monitoring (no third-party service). One row per distinct
-- error ("fingerprint"): repeats increase `occurrences` and move
-- `last_seen_at` instead of adding rows, so the table stays small.
--
--   source         client (customer/admin browser) | server
--   notified_at    when the error digest email last included it (NULL = not yet)
--   resolved_at    marked resolved by an admin; a new occurrence reopens it
--
-- Messages and stacks are redacted before storage (card-like numbers, email
-- addresses, tokens) by server/src/services/errorMonitor.js.

BEGIN;

CREATE TABLE IF NOT EXISTS error_events (
  id             TEXT PRIMARY KEY,
  fingerprint    TEXT NOT NULL UNIQUE,
  source         TEXT NOT NULL,
  message        TEXT NOT NULL,
  stack          TEXT,
  page           TEXT,
  user_agent     TEXT,
  occurrences    INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  notified_at    TEXT,
  resolved_at    TEXT,
  resolved_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_events_last_seen ON error_events (last_seen_at);

COMMIT;
