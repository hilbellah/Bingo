-- Bind online bookings to the browser seat hold that created them. Payment
-- finalization uses this value to prove the checkout still owns every seat.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS checkout_holder_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_checkout_holder
  ON bookings(checkout_holder_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_transaction_unique
  ON bookings(transaction_id)
  WHERE transaction_id IS NOT NULL AND transaction_id <> '';
