-- Special bingo admission is the CA$75 ticket only.
-- The handheld/PHD unit is a separate optional add-on capped at one per player.

BEGIN;

INSERT INTO settings (key, value)
VALUES (
  'special_bingo_config',
  '{"admissionName":"Special Bingo Admission","admissionPrice":7500,"additionalPhdName":"PHD Unit","additionalPhdPrice":5000,"additionalPhdMaxQuantity":1}'
)
ON CONFLICT (key) DO NOTHING;

UPDATE settings
   SET value = REPLACE(
     REPLACE(value, ' (includes 1 PHD)', ''),
     'Additional ',
     ''
   ),
   updated_at = NOW()
 WHERE key = 'special_bingo_config';

UPDATE session_packages sp
   SET name = REPLACE(sp.name, ' (includes 1 PHD)', ''),
       is_phd = 0,
       description = ''
  FROM sessions s
 WHERE s.id = sp.session_id
   AND sp.type = 'required'
   AND COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo';

UPDATE session_packages sp
   SET name = REPLACE(sp.name, 'Additional ', ''),
       max_quantity = 1,
       is_phd = 1,
       description = 'Handheld device for special bingo.'
  FROM sessions s
 WHERE s.id = sp.session_id
   AND sp.type = 'optional'
   AND COALESCE(sp.is_phd, 0) = 1
   AND COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo';

INSERT INTO session_packages
  (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
SELECT
  'special-phd-' || s.id,
  s.id,
  'PHD Unit',
  5000,
  'optional',
  1,
  1,
  1,
  'Handheld device for special bingo.'
FROM sessions s
WHERE COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo'
  AND NOT EXISTS (
    SELECT 1
      FROM session_packages sp
     WHERE sp.session_id = s.id
       AND sp.type = 'optional'
       AND COALESCE(sp.is_phd, 0) = 1
  )
  AND NOT EXISTS (
    SELECT 1
      FROM session_packages sp
     WHERE sp.id = 'special-phd-' || s.id
  );

UPDATE packages p
   SET name = REPLACE(p.name, ' (includes 1 PHD)', ''),
       is_phd = 0,
       description = ''
 WHERE EXISTS (
   SELECT 1
     FROM session_packages sp
     JOIN sessions s ON s.id = sp.session_id
    WHERE sp.id = p.id
      AND sp.type = 'required'
      AND COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo'
 );

COMMIT;
