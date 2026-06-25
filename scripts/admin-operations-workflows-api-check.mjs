import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-admin-ops-'));
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

const sessionId = 'admin-ops-session';
const paidSeatId = 'admin-ops-paid-seat';
const assignedSeatId = 'admin-ops-assigned-seat';
const packageId = 'admin-ops-package';
const bookingId = 'admin-ops-paid-booking';
const itemId = 'admin-ops-paid-item';
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
   VALUES (?, ?, 10, 1, 'sold', 0), (?, ?, 10, 2, 'vacant', 0)`,
  [paidSeatId, sessionId, assignedSeatId, sessionId]
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
   VALUES (?, ?, 'BNG-ADMINOPS1', 2500, 'paid', 'ops@example.com', 'Paid', 'Guest')`,
  [bookingId, sessionId]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, 'Paid', 'Guest', ?, ?, 2500, 'BNG-ADMINOPS1-1')`,
  [itemId, bookingId, paidSeatId, packageId]
);
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const superToken = Buffer.from('admin:password123').toString('base64');

async function request(pathname, { method = 'GET', token = superToken, body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

try {
  const credit = await request(`/api/admin/booking-items/${itemId}/no-show-credit`, {
    method: 'POST',
    body: { amountCents: 2500, note: 'Regression no-show credit' },
  });
  assert.equal(credit.response.status, 200);
  assert.equal(credit.data.ok, true);
  assert.match(credit.data.credit.code, /^CR-/);

  const creditRow = await get('SELECT * FROM customer_credits WHERE booking_item_id = ?', [itemId]);
  assert.equal(creditRow.amount, 2500);
  assert.equal(creditRow.status, 'active');

  const duplicateCredit = await request(`/api/admin/booking-items/${itemId}/no-show-credit`, {
    method: 'POST',
    body: { amountCents: 2500 },
  });
  assert.equal(duplicateCredit.response.status, 409);

  const assigned = await request('/api/admin/assigned-tickets', {
    method: 'POST',
    body: {
      sessionId,
      tableNumber: 10,
      chairNumber: 2,
      firstName: 'Promo',
      lastName: 'Guest',
      type: 'promo',
      note: 'Regression promo seat',
    },
  });
  assert.equal(assigned.response.status, 201);
  assert.equal(assigned.data.ok, true);

  const assignedBooking = await get('SELECT payment_status, total_amount, booking_source FROM bookings WHERE id = ?', [assigned.data.bookingId]);
  assert.equal(assignedBooking.payment_status, 'paid');
  assert.equal(assignedBooking.total_amount, 0);
  assert.equal(assignedBooking.booking_source, 'promo');

  const assignedSeat = await get('SELECT status FROM seats WHERE id = ?', [assignedSeatId]);
  assert.equal(assignedSeat.status, 'sold');

  const bulk = await request(`/api/admin/bookings/bulk-tickets?dateFrom=${futureDate}&dateTo=${futureDate}&department=regular_bingo`);
  assert.equal(bulk.response.status, 200);
  const allTickets = bulk.data.sessions.flatMap(session => session.bookings.flatMap(booking => booking.tickets));
  assert.equal(allTickets.some(ticket => ticket.firstName === 'Promo' && ticket.lastName === 'Guest' && ticket.packagePrice === 0), true);

  const printStaffEmail = 'print.staff@example.com';
  const printStaffPassword = 'printpass123';
  const createdPrintStaff = await request('/api/admin/users', {
    method: 'POST',
    body: {
      email: printStaffEmail,
      password: printStaffPassword,
      displayName: 'Print Staff',
      role: 'print_staff',
    },
  });
  assert.equal(createdPrintStaff.response.status, 201);
  assert.equal(createdPrintStaff.data.role, 'print_staff');

  const printStaffToken = Buffer.from(`${printStaffEmail}:${printStaffPassword}`).toString('base64');
  const allowedBulk = await request(`/api/admin/bookings/bulk-tickets?dateFrom=${futureDate}&dateTo=${futureDate}`, {
    token: printStaffToken,
  });
  assert.equal(allowedBulk.response.status, 200);

  const deniedDashboard = await request('/api/admin/dashboard', { token: printStaffToken });
  assert.equal(deniedDashboard.response.status, 403);

  console.log('Admin operations workflow API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
