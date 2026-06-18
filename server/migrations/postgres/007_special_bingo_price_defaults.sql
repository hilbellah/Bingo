-- Special bingo admission must default to CA$75.
-- The PHD unit remains a separate CA$50 optional add-on capped at one per player.

BEGIN;

INSERT INTO settings (key, value)
VALUES (
  'special_bingo_config',
  '{"admissionName":"Special Bingo Admission","admissionPrice":7500,"additionalPhdName":"PHD Unit","additionalPhdPrice":5000,"additionalPhdMaxQuantity":1}'
)
ON CONFLICT (key) DO NOTHING;

UPDATE settings
   SET value = jsonb_build_object(
     'admissionName',
     TRIM(REGEXP_REPLACE(COALESCE(value::jsonb->>'admissionName', 'Special Bingo Admission'), '\s*\(includes 1 PHD\)\s*', '', 'gi')),
     'admissionPrice',
     7500,
     'additionalPhdName',
     TRIM(REGEXP_REPLACE(COALESCE(value::jsonb->>'additionalPhdName', 'PHD Unit'), '^Additional\s+', '', 'i')),
     'additionalPhdPrice',
     5000,
     'additionalPhdMaxQuantity',
     1
   )::text,
   updated_at = NOW()
 WHERE key = 'special_bingo_config';

UPDATE session_packages sp
   SET name = TRIM(REGEXP_REPLACE(sp.name, '\s*\(includes 1 PHD\)\s*', '', 'gi')),
       price = 7500,
       is_phd = 0,
       description = ''
  FROM sessions s
 WHERE s.id = sp.session_id
   AND sp.type = 'required'
   AND COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo';

UPDATE session_packages sp
   SET name = TRIM(REGEXP_REPLACE(sp.name, '^Additional\s+', '', 'i')),
       price = 5000,
       max_quantity = 1,
       is_phd = 1,
       description = 'Handheld device for special bingo.'
  FROM sessions s
 WHERE s.id = sp.session_id
   AND sp.type = 'optional'
   AND COALESCE(sp.is_phd, 0) = 1
   AND COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo';

UPDATE packages p
   SET name = sp.name,
       price = sp.price,
       is_phd = sp.is_phd,
       description = sp.description
  FROM session_packages sp
  JOIN sessions s ON s.id = sp.session_id
 WHERE p.id = sp.id
   AND sp.type IN ('required', 'optional')
   AND COALESCE(NULLIF(s.session_type, ''), CASE WHEN s.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'special_bingo';

COMMIT;
