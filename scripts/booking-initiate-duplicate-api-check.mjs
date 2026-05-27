import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-booking-duplicate-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';
process.env.ANET_ENV = 'sandbox';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, all, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const sessionId = 'booking-duplicate-session';
const seatId = 'booking-duplicate-seat-1';
const holderId = 'booking-duplicate-holder';
const bookingId = 'booking-duplicate-existing';
const bookingItemId = 'booking-duplicate-item';
const referenceNumber = 'BNG-DUPE1';
const itemReferenceNumber = 'BNG-DUPE2';
const hostedToken = 'existing-hosted-token';
const ticketAccessToken = 'existing-ticket-token';
const email = 'duplicate@example.com';
const customerFirstName = 'Duplicate';
const customerLastName = 'Customer';
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const createdAt = new Date().toISOString();
const requiredPkg = await get("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order ASC LIMIT 1");
const requiredPkgs = await all("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order ASC");
const checkoutServiceFee = 200;
const expectedTotalAmount = requiredPkgs.reduce((sum, pkg) => sum + pkg.price, checkoutServiceFee);

await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 1, 'held', ?, ?)`,
  [seatId, sessionId, holderId, holdUntil]
);
await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, created_at,
     email, customer_first_name, customer_last_name, hosted_token, ticket_access_token, payment_attempted_at)
   VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
  [
    bookingId,
    sessionId,
    referenceNumber,
    requiredPkg.price,
    createdAt,
    email,
    customerFirstName,
    customerLastName,
    hostedToken,
    ticketAccessToken,
    createdAt,
  ]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [bookingItemId, bookingId, customerFirstName, customerLastName, seatId, requiredPkg.id, requiredPkg.price, itemReferenceNumber]
);
await saveDb();

const { app } = await import(appUrl);
const listener = app.listen(0);
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
  const result = await postJson('/api/bookings/initiate', {
    sessionId,
    holderId,
    email,
    customerFirstName,
    customerLastName,
    attendees: [
      {
        firstName: customerFirstName,
        lastName: customerLastName,
        seatId,
        addons: [],
      },
    ],
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.data.bookingId, bookingId);
  assert.equal(result.data.referenceNumber, referenceNumber);
  assert.ok(result.data.token);
  assert.notEqual(result.data.token, hostedToken, 'duplicate retry should refresh the hosted payment token');
  assert.equal(result.data.ticketAccessToken, ticketAccessToken);
  assert.equal(result.data.duplicate, true);
  assert.deepEqual(result.data.itemReferences, [itemReferenceNumber]);
  assert.equal(result.data.totalAmount, expectedTotalAmount);
  assert.equal(result.data.serviceFeeAmount, checkoutServiceFee);

  const bookingRows = await all('SELECT id FROM bookings WHERE session_id = ?', [sessionId]);
  assert.equal(bookingRows.length, 1, 'duplicate confirm should not create a second booking');
  const refreshedBooking = await get('SELECT hosted_token, total_amount FROM bookings WHERE id = ?', [bookingId]);
  assert.equal(refreshedBooking.hosted_token, result.data.token);
  assert.equal(refreshedBooking.total_amount, expectedTotalAmount);

  console.log('Booking initiate duplicate API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
