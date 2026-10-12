-- 018_session_deleted_reason.sql
--
-- Record WHY a session is hidden.
--
-- sessions.deleted_at hides a session from every active list, but three
-- different things set it: the nightly archive of past sessions
-- (sessionArchive.js), an admin deleting a session, and the schedule generator
-- pruning empty future sessions beyond its look-ahead window. Reports could not
-- tell them apart, which hid every past session from Booking Sales and stopped
-- staff refunding past dates (2026-10-11). deleted_at keeps its meaning
-- ("hidden from active lists"); deleted_reason says which of the three it was:
--
--   past_session     auto-archived because its date has passed
--   staff            deleted by an admin
--   schedule_pruned  empty generated session removed by the schedule generator
--
-- Existing hidden sessions are backfilled from the audit log, taking the most
-- recent of session_auto_archived / session_deleted. Pruning was never audited,
-- so sessions hidden with no matching audit row keep a NULL reason (unknown)
-- rather than a guess.

BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

UPDATE sessions
SET deleted_reason = CASE (
    SELECT a.action
    FROM audit_log a
    WHERE a.entity_type = 'session'
      AND a.entity_id = sessions.id
      AND a.action IN ('session_auto_archived', 'session_deleted')
    ORDER BY datetime(a.created_at) DESC
    LIMIT 1
  )
  WHEN 'session_auto_archived' THEN 'past_session'
  WHEN 'session_deleted' THEN 'staff'
  ELSE NULL
END
WHERE deleted_at IS NOT NULL
  AND deleted_reason IS NULL;

COMMIT;
