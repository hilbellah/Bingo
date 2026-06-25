import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-seat-move-api-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'password123';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const sessionId = 'seat-move-session';
const oldSeatId = 'seat-move-old-seat';
const newSeatId = 'seat-move-new-seat';
const soldSeatId = 'seat-move-sold-seat';
const disabledSeatId = 'seat-move-disabled-seat';
const packageId = 'seat-move-package';
const bookingId = 'seat-move-booking';
const itemId = 'seat-move-item';
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, is_disabled)
   VALUES
     (?, ?, 1, 1, 'sold', 0),
     (?, ?, 1, 2, 'vacant', 0),
     (?, ?, 1, 3, 'sold', 0),
     (?, ?, 1, 4, 'vacant', 1)`,
  [oldSeatId, sessionId, newSeatId, sessionId, soldSeatId, sessionId, disabledSeatId, sessionId]
);
await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order)
   VALUES (?, 'Admission', 2500, 'required', 1, 1, 0)`,
  [packageId]
);
await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, email, customer_first_name, customer_last_name)
   VALUES (?, ?, 'BNG-MOVE1', 2500, 'paid', 'move@example.com', 'Move', 'Tester')`,
  [bookingId, sessionId]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, 'Move', 'Tester', ?, ?, 2500, 'BNG-MOVE1-1')`,
  [itemId, bookingId, oldSeatId, packageId]
);
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const token = Buffer.from('admin:password123').toString('base64');

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

try {
  const result = await postJson(`/api/admin/booking-items/${itemId}/move-seat`, {
    tableNumber: 1,
    chairNumber: 2,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.fromSeat.id, oldSeatId);
  assert.equal(result.data.toSeat.id, newSeatId);

  const movedItem = await get('SELECT seat_id FROM booking_items WHERE id = ?', [itemId]);
  assert.equal(movedItem.seat_id, newSeatId);

  const oldSeat = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [oldSeatId]);
  assert.equal(oldSeat.status, 'vacant');
  assert.equal(oldSeat.held_by, null);
  assert.equal(oldSeat.held_until, null);

  const newSeat = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [newSeatId]);
  assert.equal(newSeat.status, 'sold');
  assert.equal(newSeat.held_by, null);
  assert.equal(newSeat.held_until, null);

  const moveToOccupiedSeat = await postJson(`/api/admin/booking-items/${itemId}/move-seat`, {
    tableNumber: 1,
    chairNumber: 3,
  });
  assert.equal(moveToOccupiedSeat.response.status, 409);
  assert.match(moveToOccupiedSeat.data.error, /currently sold/i);

  const moveToDisabledSeat = await postJson(`/api/admin/booking-items/${itemId}/move-seat`, {
    tableNumber: 1,
    chairNumber: 4,
  });
  assert.equal(moveToDisabledSeat.response.status, 409);
  assert.match(moveToDisabledSeat.data.error, /disabled/i);

  const moveBackToOriginalSeat = await postJson(`/api/admin/booking-items/${itemId}/move-seat`, {
    tableNumber: 1,
    chairNumber: 1,
  });
  assert.equal(moveBackToOriginalSeat.response.status, 200);
  assert.equal(moveBackToOriginalSeat.data.ok, true);

  const moveToSameSeat = await postJson(`/api/admin/booking-items/${itemId}/move-seat`, {
    tableNumber: 1,
    chairNumber: 1,
  });
  assert.equal(moveToSameSeat.response.status, 400);
  assert.match(moveToSameSeat.data.error, /already assigned/i);

  console.log('Admin seat move API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
