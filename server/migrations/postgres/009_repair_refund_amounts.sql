-- Repair refunded ticket amounts affected by string concatenation in the
-- admin refund calculation path. Values are stored in cents.

WITH addon_totals AS (
  SELECT
    booking_item_id,
    COALESCE(SUM(price), 0)::INTEGER AS addon_total
  FROM booking_addons
  GROUP BY booking_item_id
),
expected_refunds AS (
  SELECT
    bi.id,
    (bi.price + COALESCE(at.addon_total, 0))::INTEGER AS expected_refund_amount
  FROM booking_items bi
  LEFT JOIN addon_totals at ON at.booking_item_id = bi.id
  WHERE COALESCE(bi.refund_status, 'active') = 'refunded'
)
UPDATE booking_items bi
SET refund_amount = er.expected_refund_amount
FROM expected_refunds er
WHERE bi.id = er.id
  AND bi.refund_amount IS DISTINCT FROM er.expected_refund_amount;
