BEGIN;

UPDATE packages
SET max_quantity = 100
WHERE id = 'pkg-regular-optional-phd-credit';

COMMIT;
