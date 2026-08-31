-- 016_website_placement.sql
--
-- Per-event placement on the marketing site.
--
-- A published bingo event appears on the Bingo page and nowhere else unless an
-- admin says otherwise. Big draws (Bigger Bank Bingo and the like) can also be
-- put on the homepage and/or the Events page by ticking the extra boxes.
--
-- Defaults encode the rule: bingo page on, everything else off. Rows published
-- before this migration keep showing on the Bingo page and quietly drop off the
-- other two surfaces, which is the intended new behaviour.
--
-- The hand-maintained events in wp-content/themes/wola/inc/wola-events.php are
-- NOT affected by any of this: they carry no placement flags, and the WordPress
-- side treats a flagless event as "show everywhere", exactly as it does today.

BEGIN;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS website_show_bingo  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS website_show_events INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_show_home   INTEGER NOT NULL DEFAULT 0;

COMMIT;
