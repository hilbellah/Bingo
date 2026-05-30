-- Remove the old manually-created PHD Credits test item now that the real
-- gated $1 Credit package exists.

BEGIN;

DELETE FROM packages
WHERE id = '76e5594d-759e-445b-85bf-f2a250b7b5ae'
  AND name = 'PHD Credits'
  AND price = 100
  AND id NOT IN (SELECT package_id FROM booking_items WHERE package_id IS NOT NULL)
  AND id NOT IN (SELECT package_id FROM booking_addons WHERE package_id IS NOT NULL);

UPDATE packages
SET is_active = 0
WHERE id = '76e5594d-759e-445b-85bf-f2a250b7b5ae'
  AND name = 'PHD Credits'
  AND price = 100;

COMMIT;
