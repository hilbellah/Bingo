import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-seat-api-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '60';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const sessionId = 'seat-api-session';
const seatId = 'seat-api-seat-1';

await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status)
   VALUES (?, ?, 1, 1, 'vacant')`,
  [seatId, sessionId]
);
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

try {
  const beforeLock = Date.now();
  const firstLock = await postJson(`/api/seats/${seatId}/lock`, { holderId: 'holder-a' });
  const afterLock = Date.now();
  assert.equal(firstLock.response.status, 200);
  assert.equal(firstLock.data.success, true);

  const holdUntilMs = Date.parse(firstLock.data.holdUntil);
  assert(Number.isFinite(holdUntilMs), 'lock response should include a valid holdUntil');
  assert(
    holdUntilMs >= beforeLock + 19.5 * 60 * 1000 && holdUntilMs <= afterLock + 20.5 * 60 * 1000,
    `expected holdUntil about 20 minutes out, got ${firstLock.data.holdUntil}`
  );

  let seat = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [seatId]);
  assert.equal(seat.status, 'held');
  assert.equal(seat.held_by, 'holder-a');
  assert.equal(seat.held_until, firstLock.data.holdUntil);

  const sameHolderLock = await postJson(`/api/seats/${seatId}/lock`, { holderId: 'holder-a' });
  assert.equal(sameHolderLock.response.status, 200);
  assert.equal(sameHolderLock.data.success, true);

  const otherHolderLock = await postJson(`/api/seats/${seatId}/lock`, { holderId: 'holder-b' });
  assert.equal(otherHolderLock.response.status, 409);
  assert.match(otherHolderLock.data.error, /held by another user/i);

  const wrongUnlock = await postJson(`/api/seats/${seatId}/unlock`, { holderId: 'holder-b' });
  assert.equal(wrongUnlock.response.status, 403);

  const unlock = await postJson(`/api/seats/${seatId}/unlock`, { holderId: 'holder-a' });
  assert.equal(unlock.response.status, 200);
  assert.equal(unlock.data.success, true);

  seat = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [seatId]);
  assert.equal(seat.status, 'vacant');
  assert.equal(seat.held_by, null);
  assert.equal(seat.held_until, null);

  const lockAfterUnlock = await postJson(`/api/seats/${seatId}/lock`, { holderId: 'holder-b' });
  assert.equal(lockAfterUnlock.response.status, 200);
  assert.equal(lockAfterUnlock.data.success, true);

  console.log('Seat lock API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
