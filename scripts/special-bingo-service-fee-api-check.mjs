import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-special-service-fee-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';
process.env.ANET_ENV = 'sandbox';
process.env.ADMIN_USERNAME = 'service-fee-admin';
process.env.ADMIN_PASSWORD = 'service-fee-password';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const sessionId = 'special-no-service-fee-session';
const seatId = 'special-no-service-fee-seat';
const onePhdSeatId = 'special-one-phd-seat';
const twoPhdSeatId = 'special-two-phd-seat';
const holderId = 'special-no-service-fee-holder';
const onePhdHolderId = 'special-one-phd-holder';
const twoPhdHolderId = 'special-two-phd-holder';
const admissionPackageId = 'special-no-service-fee-admission';
const phdPackageId = 'special-no-service-fee-phd';
const admissionPrice = 7500;
const phdPrice = 5000;
const eventSessionId = 'event-no-service-fee-session';
const eventSeatId = 'event-no-service-fee-seat';
const eventInitiateSeatId = 'event-no-service-fee-initiate-seat';
const eventHolderId = 'event-no-service-fee-holder';
const eventInitiateHolderId = 'event-no-service-fee-initiate-holder';
const eventPackageId = 'event-no-service-fee-admission';
const eventAdmissionPrice = 3000;
const eventHstAmount = 450;
const eventTotalAmount = eventAdmissionPrice + eventHstAmount;

await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event, event_title)
   VALUES (?, ?, '18:30', '12:00', 1, 'special_bingo', 1, 'Special Bingo')`,
  [sessionId, futureDate]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 1, 'held', ?, ?)`,
  [seatId, sessionId, holderId, holdUntil]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 2, 'held', ?, ?)`,
  [onePhdSeatId, sessionId, onePhdHolderId, holdUntil]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 3, 'held', ?, ?)`,
  [twoPhdSeatId, sessionId, twoPhdHolderId, holdUntil]
);
await run(
  `INSERT INTO session_packages
    (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
   VALUES (?, ?, 'Special Bingo Admission', ?, 'required', 1, 0, 0, '')`,
  [admissionPackageId, sessionId, admissionPrice]
);
await run(
  `INSERT INTO session_packages
    (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
   VALUES (?, ?, 'PHD Unit', ?, 'optional', 1, 1, 1, 'Handheld device for special bingo.')`,
  [phdPackageId, sessionId, phdPrice]
);
await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event, event_title)
   VALUES (?, ?, '19:30', '12:00', 1, 'event', 1, 'Live Event')`,
  [eventSessionId, futureDate]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 1, 'held', ?, ?)`,
  [eventSeatId, eventSessionId, eventHolderId, holdUntil]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 2, 'held', ?, ?)`,
  [eventInitiateSeatId, eventSessionId, eventInitiateHolderId, holdUntil]
);
await run(
  `INSERT INTO session_packages
    (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
   VALUES (?, ?, 'Live Event Admission', ?, 'required', 1, 0, 0, '')`,
  [eventPackageId, eventSessionId, eventAdmissionPrice]
);
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

async function postJson(pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

try {
  const auth = Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  const twoPhdResult = await postJson('/api/bookings', {
    sessionId,
    holderId: twoPhdHolderId,
    email: '',
    customerFirstName: 'Special',
    customerLastName: 'Two',
    attendees: [
      {
        firstName: 'Special',
        lastName: 'Two',
        seatId: twoPhdSeatId,
        addons: [{ packageId: phdPackageId, quantity: 2 }],
      },
    ],
  }, { Authorization: `Basic ${auth}` });

  assert.equal(twoPhdResult.response.status, 400);
  assert.match(twoPhdResult.data.error, /limited to 1 per player/i);

  const onePhdResult = await postJson('/api/bookings', {
    sessionId,
    holderId: onePhdHolderId,
    email: '',
    customerFirstName: 'Special',
    customerLastName: 'One',
    attendees: [
      {
        firstName: 'Special',
        lastName: 'One',
        seatId: onePhdSeatId,
        addons: [{ packageId: phdPackageId, quantity: 1 }],
      },
    ],
  }, { Authorization: `Basic ${auth}` });

  assert.equal(onePhdResult.response.status, 200);
  assert.equal(onePhdResult.data.totalAmount, admissionPrice + phdPrice);
  assert.equal(onePhdResult.data.totalFormatted, 'CA$125.00');

  const result = await postJson('/api/bookings', {
    sessionId,
    holderId,
    email: '',
    customerFirstName: 'Special',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'Special',
        lastName: 'Tester',
        seatId,
        addons: [],
      },
    ],
  }, { Authorization: `Basic ${auth}` });

  assert.equal(result.response.status, 200);
  assert.ok(result.data.bookingId);
  assert.equal(result.data.totalAmount, admissionPrice);
  assert.equal(result.data.totalFormatted, 'CA$75.00');

  const savedBooking = await get('SELECT total_amount, payment_status FROM bookings WHERE id = ?', [result.data.bookingId]);
  assert.equal(savedBooking.total_amount, admissionPrice);
  assert.equal(savedBooking.payment_status, 'paid');

  const eventResult = await postJson('/api/bookings', {
    sessionId: eventSessionId,
    holderId: eventHolderId,
    email: '',
    customerFirstName: 'Event',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'Event',
        lastName: 'Tester',
        seatId: eventSeatId,
        addons: [],
      },
    ],
  }, { Authorization: `Basic ${auth}` });

  assert.equal(eventResult.response.status, 200);
  assert.ok(eventResult.data.bookingId);
  assert.equal(eventResult.data.totalAmount, eventTotalAmount);
  assert.equal(eventResult.data.totalFormatted, 'CA$34.50');

  const savedEventBooking = await get('SELECT total_amount, payment_status FROM bookings WHERE id = ?', [eventResult.data.bookingId]);
  assert.equal(savedEventBooking.total_amount, eventTotalAmount);
  assert.equal(savedEventBooking.payment_status, 'paid');

  const eventInitiateResult = await postJson('/api/bookings/initiate', {
    sessionId: eventSessionId,
    holderId: eventInitiateHolderId,
    email: 'event-service-fee@example.com',
    customerFirstName: 'Event',
    customerLastName: 'Checkout',
    attendees: [
      {
        firstName: 'Event',
        lastName: 'Checkout',
        seatId: eventInitiateSeatId,
        addons: [],
      },
    ],
  });

  assert.equal(eventInitiateResult.response.status, 200);
  assert.ok(eventInitiateResult.data.bookingId);
  assert.equal(eventInitiateResult.data.totalAmount, eventTotalAmount);
  assert.equal(eventInitiateResult.data.totalFormatted, 'CA$34.50');
  assert.equal(eventInitiateResult.data.serviceFeeAmount, 0);
  assert.equal(eventInitiateResult.data.serviceFeeQuantity, 1);
  assert.equal(eventInitiateResult.data.salesTaxAmount, eventHstAmount);
  assert.equal(eventInitiateResult.data.salesTaxFormatted, 'CA$4.50');

  console.log('Special bingo and live event service fee API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
