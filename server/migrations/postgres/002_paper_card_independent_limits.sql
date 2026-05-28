-- Make regular paper-card add-on limits independent per package.
-- PHD package limits and PHD inventory logic are intentionally unchanged.

BEGIN;

UPDATE packages
SET max_quantity = CASE id
  WHEN 'pkg-regular-optional-9-up' THEN 2
  WHEN 'pkg-regular-optional-6-up' THEN 3
  WHEN 'pkg-regular-optional-3-up' THEN 3
  WHEN 'pkg-regular-optional-mp-early-bird' THEN 6
  ELSE max_quantity
END
WHERE id IN (
  'pkg-regular-optional-9-up',
  'pkg-regular-optional-6-up',
  'pkg-regular-optional-3-up',
  'pkg-regular-optional-mp-early-bird'
);

COMMIT;
