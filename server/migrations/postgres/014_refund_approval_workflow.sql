CREATE TABLE IF NOT EXISTS refund_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  booking_item_id TEXT REFERENCES booking_items(id),
  amount_cents INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  gateway_action TEXT,
  gateway_transaction_id TEXT,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_refund_requests_booking ON refund_requests(booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_pending_scope
  ON refund_requests(booking_id)
  WHERE status IN ('pending', 'processing', 'reconciliation_required');
