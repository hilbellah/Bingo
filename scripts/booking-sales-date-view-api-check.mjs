import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Past sessions are auto-archived (deleted_at set), which used to hide them
// from Booking Sales and its View / Refund drilldown. The date view must bring
// back archived sessions that still have paid bookings, and nothing else.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-booking-sales-dates-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'password123';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { prepareTestDatabase } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, run, saveDb } = await import(databaseUrl);

await prepareTestDatabase();
await getDb();

const cutoffAt = '2026-06-01T00:00:00.000Z';
const paidAt = '2026-06-05T12:00:00.000Z';
const preCutoffPaidAt = '2026-05-20T12:00:00.000Z';
const archivedAt = '2026-07-01T00:00:00.000Z';

await run(`INSERT INTO settings (key, value) VALUES ('sales_report_cutoff_at', ?)`, [cutoffAt]);
await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
   VALUES ('dates-package', 'Dates Required', 3000, 'required', 1, 1, 1, '', 0)`
);

async function addSession(id, date, deletedAt = null) {
  await run(
    `INSERT INTO sessions
      (id, date, time, cutoff_time, is_available, session_type, is_special_event, deleted_at)
     VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0, ?)`,
    [id, date, deletedAt]
  );
}

let seatCounter = 0;
async function addBooking(sessionId, bookingId, paymentStatus, at, tickets) {
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, email,
       customer_first_name, customer_last_name, payment_completed_at, created_at, transaction_id)
     VALUES (?, ?, ?, ?, ?, 'buyer@example.com', 'Buyer', 'Person', ?, ?, ?)`,
    [bookingId, sessionId, `BNG-${bookingId}`, 3000 * tickets, paymentStatus, at, at, `tx-${bookingId}`]
  );
  for (let i = 0; i < tickets; i += 1) {
    seatCounter += 1;
    const seatId = `dates-seat-${seatCounter}`;
    await run(
      `INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, 1, ?, 'sold')`,
      [seatId, sessionId, seatCounter]
    );
    await run(
      `INSERT INTO booking_items
        (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
       VALUES (?, ?, 'Player', 'One', ?, 'dates-package', 3000, ?)`,
      [`${bookingId}-item-${i}`, bookingId, seatId, `BNG-${bookingId}-T${i}`]
    );
  }
}

// Archived past session with paid tickets: must come back in the date view.
await addSession('archived-paid', '2026-06-10', archivedAt);
await addBooking('archived-paid', 'ARCH-PAID', 'paid', paidAt, 2);
// Archived past session with nothing sold: stays hidden.
await addSession('archived-empty', '2026-06-11', archivedAt);
// Archived past session whose only booking was already refunded: stays hidden.
await addSession('archived-refunded', '2026-06-12', archivedAt);
await addBooking('archived-refunded', 'ARCH-REFUNDED', 'refunded', paidAt, 1);
// Archived past session whose only sale predates the sales-report cutoff: stays hidden.
await addSession('archived-precutoff', '2026-06-13', archivedAt);
await addBooking('archived-precutoff', 'ARCH-PRECUT', 'paid', preCutoffPaidAt, 1);
// Current session: shows in the default view and in a range that covers it.
await addSession('current-session', '2099-12-01');
await addBooking('current-session', 'CURRENT', 'paid', paidAt, 1);

await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const auth = Buffer.from('admin@example.com:password123').toString('base64');
const getSales = async (query = '') => {
  const response = await fetch(`${baseUrl}/api/admin/booking-sales${query}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return { status: response.status, body: await response.json() };
};

try {
  const defaultView = await getSales();
  assert.equal(defaultView.status, 200);
  assert.deepEqual(defaultView.body.map(row => row.id), ['current-session'], 'default view is unchanged: archived sessions stay out');

  const pastRange = await getSales('?dateFrom=2026-06-01&dateTo=2026-06-30');
  assert.equal(pastRange.status, 200);
  assert.deepEqual(pastRange.body.map(row => row.id), ['archived-paid'], 'only archived sessions with paid bookings come back');
  const [archivedRow] = pastRange.body;
  assert.equal(archivedRow.date, '2026-06-10');
  assert.equal(archivedRow.quantity, 2);
  assert.equal(archivedRow.bookingCount, 1);
  assert.equal(archivedRow.totalAmount, 6000);

  const wideRange = await getSales('?dateFrom=2026-01-01&dateTo=2099-12-31');
  assert.equal(wideRange.status, 200);
  assert.deepEqual(wideRange.body.map(row => row.id), ['archived-paid', 'current-session'], 'range covers past and current, oldest first');

  const emptyRange = await getSales('?dateFrom=2025-01-01&dateTo=2025-12-31');
  assert.equal(emptyRange.status, 200);
  assert.deepEqual(emptyRange.body, []);

  // The drilldown behind View / Refund loads bookings by session id, archived or not.
  const drilldown = await fetch(`${baseUrl}/api/admin/bookings?sessionId=archived-paid`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const drilldownBookings = await drilldown.json();
  assert.equal(drilldown.status, 200);
  assert.deepEqual(drilldownBookings.map(booking => booking.referenceNumber), ['BNG-ARCH-PAID']);

  for (const query of [
    '?dateFrom=2026-06-01',
    '?dateTo=2026-06-30',
    '?dateFrom=06/01/2026&dateTo=2026-06-30',
    '?dateFrom=2026-06-30&dateTo=2026-06-01',
  ]) {
    const bad = await getSales(query);
    assert.equal(bad.status, 400, `expected 400 for ${query}`);
    assert.ok(bad.body.error);
  }

  console.log('Booking sales date view API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
