import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-bulk-tickets-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'password123';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
   VALUES (?, ?, ?, 'required', 1, 1, 1, '', 0)`,
  ['bulk-required-package', 'Bulk Required', 2500]
);
await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
   VALUES (?, ?, ?, 'optional', 1, 1, 2, '', 0)`,
  ['bulk-addon-package', 'Bulk Addon', 500]
);

for (const [index, sessionType] of ['regular_bingo', 'special_bingo', 'event'].entries()) {
  const sessionId = `bulk-${sessionType}-session`;
  const seatId = `bulk-${sessionType}-seat`;
  const bookingId = `bulk-${sessionType}-booking`;
  const itemId = `bulk-${sessionType}-item`;

  await run(
    `INSERT INTO sessions
      (id, date, time, cutoff_time, is_available, is_special_event, event_title, session_type, deleted_at)
     VALUES (?, ?, '18:30', '12:00', 1, ?, ?, ?, ?)`,
    [
      sessionId,
      date,
      sessionType === 'regular_bingo' ? 0 : 1,
      sessionType === 'regular_bingo' ? null : `Bulk ${sessionType}`,
      sessionType,
      new Date().toISOString(),
    ]
  );
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status)
     VALUES (?, ?, ?, 1, 'sold')`,
    [seatId, sessionId, index + 1]
  );
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status)
     VALUES (?, ?, ?, 3000, 'paid')`,
    [bookingId, sessionId, `BNG-BULK-${index}`]
  );
  await run(
    `INSERT INTO booking_items
      (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
     VALUES (?, ?, 'Bulk', ?, ?, 'bulk-required-package', 2500, ?)`,
    [itemId, bookingId, sessionType, seatId, `BNG-BULK-T-${index}`]
  );
  await run(
    `INSERT INTO booking_addons
      (id, booking_item_id, package_id, quantity, price)
     VALUES (?, ?, 'bulk-addon-package', 1, 500)`,
    [`bulk-${sessionType}-addon`, itemId]
  );
}
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const auth = Buffer.from('admin@example.com:password123').toString('base64');

try {
  const response = await fetch(`${baseUrl}/api/admin/bookings/bulk-tickets?dateFrom=${date}&dateTo=${date}&department=all`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.totalTickets, 3);
  assert.deepEqual(
    data.sessions.map(session => session.sessionType).sort(),
    ['event', 'regular_bingo', 'special_bingo']
  );
  assert(data.sessions.every(session => session.bookings[0].tickets[0].addons.length === 1));

  console.log('Bulk ticket session type API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
