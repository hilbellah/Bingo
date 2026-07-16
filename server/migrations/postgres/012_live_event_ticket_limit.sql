BEGIN;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS ticket_limit INTEGER;

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_ticket_limit_positive;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_ticket_limit_positive
  CHECK (ticket_limit IS NULL OR ticket_limit > 0);

COMMIT;
