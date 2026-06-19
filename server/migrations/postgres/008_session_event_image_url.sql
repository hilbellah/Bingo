-- Optional display image for Special Bingo and Live Event / Venue feature cards.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS event_image_url TEXT;
