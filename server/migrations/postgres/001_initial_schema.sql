-- 001_initial_schema.sql
--
-- Wolastoq BINGO — Phase 1 of the SQLite → Postgres migration.
--
-- This file establishes the full Postgres schema as a 1:1 mirror of what
-- server/src/migrate.js builds in SQLite. Same table names, same column
-- names, same column types (TEXT/INTEGER stay TEXT/INTEGER), same defaults,
-- same indexes. The goal is that when Phase 2 cuts the runtime over, every
-- query in the codebase finds the row it expects in the column it expects.
--
-- Two SQLite-only functions used throughout the codebase are recreated here
-- as Postgres shim functions, so SQLite-style SQL strings (e.g.
-- `INSERT INTO foo (created_at) VALUES (datetime('now'))` or
-- `WHERE strftime('%w', date) = '0'`) continue to work without source edits:
--
--   datetime(text)          mimics SQLite's datetime() for the 'now' arg
--   strftime(text, text)    mimics SQLite's strftime() for common format strings
--
-- Run this via:   npm run migrate:postgres
-- Idempotent — every CREATE uses IF NOT EXISTS.

BEGIN;

-- ============================================================
-- SQLite shim functions
-- ============================================================

-- datetime('now')  →  'YYYY-MM-DD HH24:MI:SS' UTC string (matches SQLite output exactly)
-- datetime('<iso>') → same string format for the given timestamp
-- STABLE because now() varies per transaction but is otherwise stable; not IMMUTABLE.
CREATE OR REPLACE FUNCTION datetime(arg text) RETURNS text AS $$
  SELECT CASE
    WHEN arg IS NULL OR arg = 'now'
      THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    ELSE
      to_char(arg::timestamp, 'YYYY-MM-DD HH24:MI:SS')
  END;
$$ LANGUAGE sql STABLE;

-- strftime — SQLite-compatible format-string subset. Add more cases here as
-- the codebase needs them. The fallback delegates to Postgres' to_char which
-- understands a (mostly) different format-pattern dialect, so unknown formats
-- will likely produce surprising output — prefer explicit cases above.
CREATE OR REPLACE FUNCTION strftime(fmt text, dt text) RETURNS text AS $$
  SELECT CASE
    WHEN fmt = '%w'        THEN EXTRACT(DOW   FROM dt::timestamp)::int::text
    WHEN fmt = '%Y-%m-%d'  THEN to_char(dt::timestamp, 'YYYY-MM-DD')
    WHEN fmt = '%H:%M:%S'  THEN to_char(dt::timestamp, 'HH24:MI:SS')
    WHEN fmt = '%Y'        THEN to_char(dt::timestamp, 'YYYY')
    WHEN fmt = '%m'        THEN to_char(dt::timestamp, 'MM')
    WHEN fmt = '%d'        THEN to_char(dt::timestamp, 'DD')
    WHEN fmt = '%H'        THEN to_char(dt::timestamp, 'HH24')
    WHEN fmt = '%M'        THEN to_char(dt::timestamp, 'MI')
    WHEN fmt = '%S'        THEN to_char(dt::timestamp, 'SS')
    ELSE to_char(dt::timestamp, fmt)
  END;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Tables
-- ============================================================
-- Type-mapping rules used throughout:
--   SQLite TEXT     → Postgres TEXT
--   SQLite INTEGER  → Postgres INTEGER (used for both numeric counts/prices
--                                       in cents AND for boolean-style 0/1 flags,
--                                       to preserve existing `WHERE is_active = 1`
--                                       query semantics)
--   AUTOINCREMENT   → not used; all PKs are UUIDs supplied by the app layer
--   datetime('now') in defaults is preserved verbatim, routed through the shim
--   above so it returns a SQLite-formatted UTC string into a TEXT column.

CREATE TABLE IF NOT EXISTS sessions (
  id                 TEXT PRIMARY KEY,
  date               TEXT NOT NULL,
  time               TEXT NOT NULL,
  cutoff_time        TEXT NOT NULL DEFAULT '12:00',
  is_available       INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  is_special_event   INTEGER DEFAULT 0,
  event_title        TEXT,
  event_description  TEXT,
  session_type       TEXT DEFAULT 'regular_bingo',
  deleted_at         TEXT
);

CREATE TABLE IF NOT EXISTS seats (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  table_number    INTEGER NOT NULL,
  chair_number    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'vacant',
  held_by         TEXT,
  held_until      TEXT,
  is_disabled     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(session_id, table_number, chair_number)
);

CREATE TABLE IF NOT EXISTS packages (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  price          INTEGER NOT NULL,
  type           TEXT NOT NULL,
  max_quantity   INTEGER NOT NULL DEFAULT 1,
  is_active      INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_phd         INTEGER DEFAULT 0,
  description    TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
  id                       TEXT PRIMARY KEY,
  session_id               TEXT NOT NULL REFERENCES sessions(id),
  reference_number         TEXT NOT NULL UNIQUE,
  total_amount             INTEGER NOT NULL,
  payment_status           TEXT NOT NULL DEFAULT 'pending',
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  email                    TEXT,
  customer_first_name      TEXT,
  customer_last_name       TEXT,
  email_verified_at        TEXT,
  payment_provider         TEXT DEFAULT 'authorize_net',
  transaction_id           TEXT,
  auth_code                TEXT,
  payment_attempted_at     TEXT,
  payment_completed_at     TEXT,
  payment_failure_reason   TEXT,
  hosted_token             TEXT,
  ticket_access_token      TEXT
);

CREATE TABLE IF NOT EXISTS booking_items (
  id                       TEXT PRIMARY KEY,
  booking_id               TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  first_name               TEXT NOT NULL,
  last_name                TEXT NOT NULL,
  seat_id                  TEXT NOT NULL REFERENCES seats(id),
  package_id               TEXT NOT NULL REFERENCES packages(id),
  price                    INTEGER NOT NULL,
  reference_number         TEXT,
  printed_at               TEXT,
  refund_status            TEXT DEFAULT 'active',
  refunded_at              TEXT,
  refund_transaction_id    TEXT,
  refund_amount            INTEGER DEFAULT 0,
  refund_action            TEXT
);

CREATE TABLE IF NOT EXISTS booking_addons (
  id                TEXT PRIMARY KEY,
  booking_item_id   TEXT NOT NULL REFERENCES booking_items(id) ON DELETE CASCADE,
  package_id        TEXT NOT NULL REFERENCES packages(id),
  quantity          INTEGER NOT NULL DEFAULT 1,
  price             INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_packages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price          INTEGER NOT NULL,
  type           TEXT NOT NULL,
  max_quantity   INTEGER DEFAULT 1,
  sort_order     INTEGER DEFAULT 0,
  is_phd         INTEGER DEFAULT 0,
  description    TEXT DEFAULT '',
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id           TEXT PRIMARY KEY,
  title        TEXT,
  message      TEXT NOT NULL,
  type         TEXT DEFAULT 'info',
  is_active    INTEGER DEFAULT 1,
  start_date   TEXT,
  end_date     TEXT,
  sort_order   INTEGER DEFAULT 0,
  image_url    TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  details       TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id             TEXT PRIMARY KEY,
  day_of_week    INTEGER NOT NULL,
  time           TEXT NOT NULL,
  cutoff_time    TEXT NOT NULL DEFAULT '12:00',
  session_type   TEXT NOT NULL DEFAULT 'regular_bingo',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_verifications (
  id                     TEXT PRIMARY KEY,
  email                  TEXT NOT NULL,
  code_hash              TEXT NOT NULL,
  customer_first_name    TEXT,
  customer_last_name     TEXT,
  attempts               INTEGER NOT NULL DEFAULT 0,
  expires_at             TEXT NOT NULL,
  verified_at            TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  first_name          TEXT,
  last_name           TEXT,
  email_verified_at   TEXT,
  first_booking_at    TEXT,
  last_booking_at     TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  is_super_user   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_events (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES bookings(id),
  event_type    TEXT NOT NULL,
  source        TEXT NOT NULL,
  raw_payload   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes
-- ============================================================
-- Same set the SQLite migrate.js maintains. Names match so anyone debugging
-- a slow query can grep across both databases for the same index name.

CREATE INDEX IF NOT EXISTS idx_seats_session                   ON seats(session_id);
CREATE INDEX IF NOT EXISTS idx_seats_table                     ON seats(session_id, table_number);
CREATE INDEX IF NOT EXISTS idx_seats_status                    ON seats(session_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_session                ON bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email                  ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status         ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_reference              ON bookings(reference_number);
CREATE INDEX IF NOT EXISTS idx_bookings_transaction_id         ON bookings(transaction_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ticket_access_token    ON bookings(ticket_access_token);

CREATE INDEX IF NOT EXISTS idx_booking_items_booking           ON booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_seat              ON booking_items(seat_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_refund_status     ON booking_items(refund_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_items_reference  ON booking_items(reference_number);

CREATE INDEX IF NOT EXISTS idx_session_packages_session        ON session_packages(session_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity                ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action                ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created               ON audit_log(created_at);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_active_day  ON recurring_schedules(is_active, day_of_week);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email       ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires     ON email_verifications(expires_at);

CREATE INDEX IF NOT EXISTS idx_customers_email                 ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_last_booking          ON customers(last_booking_at);

CREATE INDEX IF NOT EXISTS idx_payment_events_booking          ON payment_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type             ON payment_events(event_type);

COMMIT;
