-- Add admin roles, no-show credit tracking, and assigned-ticket metadata.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_source TEXT DEFAULT 'online';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

UPDATE bookings
SET booking_source = 'online'
WHERE booking_source IS NULL OR booking_source = '';

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';

UPDATE admin_users
SET role = 'super_user'
WHERE is_super_user = 1
  AND (role IS NULL OR role = '' OR role = 'admin');

UPDATE admin_users
SET role = 'admin'
WHERE role IS NULL OR role = '';

CREATE TABLE IF NOT EXISTS customer_credits (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_item_id TEXT NOT NULL UNIQUE REFERENCES booking_items(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL DEFAULT 'no_show',
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT datetime('now'),
  redeemed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_status ON customer_credits(status);
CREATE INDEX IF NOT EXISTS idx_customer_credits_booking ON customer_credits(booking_id);
