-- Add the optional $1 PHD credit package.
-- Credits are priced and stored like normal add-ons, but server validation
-- only permits them when the same attendee has a PHD package.

BEGIN;

INSERT INTO packages
  (id, name, price, type, max_quantity, is_active, sort_order, is_phd, description)
VALUES
  (
    'pkg-regular-optional-phd-credit',
    '$1 Credit',
    100,
    'optional',
    50,
    1,
    26,
    0,
    'PHD credit. Available only when this player purchases a PHD package.'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  type = EXCLUDED.type,
  max_quantity = EXCLUDED.max_quantity,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  is_phd = EXCLUDED.is_phd,
  description = EXCLUDED.description;

COMMIT;
