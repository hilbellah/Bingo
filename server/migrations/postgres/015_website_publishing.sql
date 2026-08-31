-- 015_website_publishing.sql
--
-- "Publish to website" for special bingo events and live events.
--
-- When an admin ticks "Publish to website" on a session, the marketing site
-- (wolastoqcasino.ca) renders that event's flyer and copy alongside the
-- hand-maintained events in wp-content/themes/wola/inc/wola-events.php.
--
-- Publishing is opt-in per session. Nothing is published automatically —
-- website_published stays 0 until an admin explicitly turns it on and fills
-- in the required flyer + marketing copy.
--
-- Column names mirror the keys the WordPress event registry already renders
-- (img/alt/badge/datefmt/kicker/lead/blurb/rows/prize) so the public feed in
-- server/src/routes/websiteEventRoutes.js is a straight rename, not a
-- transformation.

BEGIN;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS website_published     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_slug          TEXT,
  ADD COLUMN IF NOT EXISTS website_name          TEXT,
  ADD COLUMN IF NOT EXISTS website_name_hl       TEXT,
  ADD COLUMN IF NOT EXISTS website_flyer_url     TEXT,
  ADD COLUMN IF NOT EXISTS website_flyer_alt     TEXT,
  ADD COLUMN IF NOT EXISTS website_badge         TEXT,
  ADD COLUMN IF NOT EXISTS website_datefmt       TEXT,
  ADD COLUMN IF NOT EXISTS website_kicker        TEXT,
  ADD COLUMN IF NOT EXISTS website_lead          TEXT,
  ADD COLUMN IF NOT EXISTS website_blurb         TEXT,
  ADD COLUMN IF NOT EXISTS website_detail_rows   TEXT,
  ADD COLUMN IF NOT EXISTS website_prize         INTEGER,
  ADD COLUMN IF NOT EXISTS website_end_date      TEXT,
  ADD COLUMN IF NOT EXISTS website_updated_at    TEXT;

-- Slugs are the anchor targets on /events/ (#we-ev-<slug>) and the dedupe key
-- against the hand-written PHP registry, so they must be unique among live
-- rows. Partial index: only published, non-deleted sessions are constrained.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_website_slug_unique
  ON sessions (website_slug)
  WHERE website_slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_website_published_idx
  ON sessions (website_published, website_end_date)
  WHERE website_published = 1;

COMMIT;
