import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// sessions.deleted_at hides a session for three different reasons. The
// deleted_reason column records which one: the past-session archive, an admin
// delete, or the schedule generator pruning an empty future session. Restoring
// clears it, and the migration backfills existing rows from the audit log.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-deleted-reason-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'password123';

const { prepareTestDatabase, driver } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, run, get, all, exec, saveDb } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
const { migrate } = await import(pathToFileURL(path.join(repoRoot, 'server/src/migrate.js')));
const { archivePastSessions } = await import(pathToFileURL(path.join(repoRoot, 'server/src/services/sessionArchive.js')));
const { pruneFutureSessionsBeyondLookahead } = await import(pathToFileURL(path.join(repoRoot, 'server/src/services/scheduler.js')));

await prepareTestDatabase();
await getDb();

async function addSession(id, date, { deletedAt = null } = {}) {
  await run(
    `INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type, is_special_event, deleted_at)
     VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0, ?)`,
    [id, date, deletedAt]
  );
}
async function audit(action, sessionId, createdAt) {
  await run(
    `INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'session', ?, '{}', ?)`,
    [`${action}-${sessionId}-${createdAt}`, action, sessionId, createdAt]
  );
}
const reasonOf = async id => (await get('SELECT deleted_at AS "deletedAt", deleted_reason AS "deletedReason" FROM sessions WHERE id = ?', [id]));

// --- Backfill of rows hidden before the column existed --------------------
await addSession('legacy-archived', '2026-08-01', { deletedAt: '2026-08-02T04:00:00.000Z' });
await audit('session_auto_archived', 'legacy-archived', '2026-08-02T04:00:00.000Z');
await addSession('legacy-staff', '2026-12-24', { deletedAt: '2026-09-01 10:00:00' });
await audit('session_deleted', 'legacy-staff', '2026-09-01 10:00:00');
// Deleted by staff, restored, then auto-archived later: the latest reason wins,
// even though the two audit rows use different timestamp formats.
await addSession('legacy-restored-then-archived', '2026-08-10', { deletedAt: '2026-08-11T04:00:00.000Z' });
await audit('session_deleted', 'legacy-restored-then-archived', '2026-08-05 09:00:00');
await audit('session_auto_archived', 'legacy-restored-then-archived', '2026-08-11T04:00:00.000Z');
// Hidden with no audit trail (e.g. pruned before pruning set a reason): unknown, not guessed.
await addSession('legacy-unknown', '2027-03-01', { deletedAt: '2026-09-15T00:00:00.000Z' });
// Visible session: untouched.
await addSession('legacy-visible', '2099-06-02'); // a Tuesday: Monday regular sessions are hidden by the no-Monday rule
// Empty future Monday regular session: hidden by the no-Monday schedule rule.
await addSession('future-monday', '2099-06-01');
await saveDb();

// SQLite backfills inside migrate(); Postgres backfills in SQL migration 018,
// which already ran on the empty schema, so re-run that exact file here.
const migration018 = fs.readFileSync(path.join(repoRoot, 'server/migrations/postgres/018_session_deleted_reason.sql'), 'utf8');
const backfill = () => (driver === 'postgres' ? exec(migration018) : migrate());
await backfill();

assert.equal((await reasonOf('legacy-archived')).deletedReason, 'past_session');
assert.equal((await reasonOf('legacy-staff')).deletedReason, 'staff');
assert.equal((await reasonOf('legacy-restored-then-archived')).deletedReason, 'past_session');
assert.equal((await reasonOf('legacy-unknown')).deletedReason, null);
assert.equal((await reasonOf('legacy-visible')).deletedAt, null);
assert.equal((await reasonOf('legacy-visible')).deletedReason, null);
if (driver === 'sqlite') {
  // The no-Monday schedule correction only runs in the SQLite migrate().
  assert.equal((await reasonOf('future-monday')).deletedReason, 'schedule_pruned');
}

// Running the migration again changes nothing.
await backfill();
assert.equal((await reasonOf('legacy-staff')).deletedReason, 'staff');

// --- Live writers ---------------------------------------------------------
await addSession('past-to-archive', '2026-01-15');
await archivePastSessions();
assert.equal((await reasonOf('past-to-archive')).deletedReason, 'past_session');
assert.ok((await reasonOf('past-to-archive')).deletedAt);

await addSession('far-future-empty', '2099-12-31');
await pruneFutureSessionsBeyondLookahead();
assert.equal((await reasonOf('far-future-empty')).deletedReason, 'schedule_pruned');

await addSession('staff-target', '2099-05-05');
await saveDb();

const { app } = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const headers = { Authorization: `Basic ${Buffer.from('admin@example.com:password123').toString('base64')}`, 'Content-Type': 'application/json' };

try {
  const del = await fetch(`${baseUrl}/api/admin/sessions/staff-target`, { method: 'DELETE', headers });
  assert.equal(del.status, 200, `delete failed: ${await del.clone().text()}`);
  assert.equal((await reasonOf('staff-target')).deletedReason, 'staff');

  const listed = await fetch(`${baseUrl}/api/admin/sessions/deleted`, { headers });
  assert.equal(listed.status, 200);
  const rows = await listed.json();
  const byId = Object.fromEntries(rows.map(row => [row.id, row.deleted_reason]));
  assert.equal(byId['staff-target'], 'staff');
  assert.equal(byId['past-to-archive'], 'past_session');
  assert.equal(byId['far-future-empty'], 'schedule_pruned');

  const restore = await fetch(`${baseUrl}/api/admin/sessions/staff-target/restore`, { method: 'POST', headers });
  assert.equal(restore.status, 200, `restore failed: ${await restore.clone().text()}`);
  const restored = await reasonOf('staff-target');
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.deletedReason, null);

  // Nothing else hid or showed sessions as a side effect.
  const hidden = await all('SELECT id FROM sessions WHERE deleted_at IS NOT NULL AND deleted_reason IS NULL');
  assert.deepEqual(hidden.map(row => row.id), ['legacy-unknown']);

  console.log('Session deleted_reason check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
