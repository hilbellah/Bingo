import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-anet-refund-webhook-'));
const dbPath = path.join(tmpDir, 'bingo.db');
const signatureKey = 'A'.repeat(128);

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ANET_SIGNATURE_KEY = signatureKey;
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { prepareTestDatabase } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, get, run, saveDb } = await import(databaseUrl);

await prepareTestDatabase();
await getDb();

const sessionId = 'anet-refund-webhook-session';
const seatId = 'anet-refund-webhook-seat';
const packageId = 'anet-refund-webhook-package';
const bookingId = 'anet-refund-webhook-booking';
const itemId = 'anet-refund-webhook-item';
const bookingReference = 'BNG-ANETREFUND1';
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
   VALUES (?, ?, 44, 1, 'sold', 0)`,
  [seatId, sessionId]
);
await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order)
   VALUES (?, 'Admission', 2500, 'required', 1, 1, 0)`,
  [packageId]
);
await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, transaction_id, email, customer_first_name, customer_last_name)
   VALUES (?, ?, ?, 2500, 'paid', 'anet-original-transaction', 'refund-webhook@example.com', 'Refund', 'Webhook')`,
  [bookingId, sessionId, bookingReference]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, 'Refund', 'Webhook', ?, ?, 2500, 'BNG-ANETREFUND1-1')`,
  [itemId, bookingId, seatId, packageId]
);
await saveDb();

const { app, __setPaymentServicesForTesting } = await import(appUrl);
// The refund webhook now verifies unknown refund transactions with the
// gateway before acting; stub the lookup so the check stays offline.
const verifyResponses = new Map();
__setPaymentServicesForTesting({
  verifyTransaction: async transId => {
    const response = verifyResponses.get(transId);
    if (!response) return { ok: false, error: `unexpected verify for ${transId}` };
    return response;
  },
});
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

function signBody(body) {
  const signature = crypto
    .createHmac('sha512', Buffer.from(signatureKey, 'hex'))
    .update(body)
    .digest('hex')
    .toUpperCase();
  return `sha512=${signature}`;
}

async function postWebhook(event) {
  const body = JSON.stringify(event);
  return fetch(`${baseUrl}/api/webhooks/authorize-net`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ANET-Signature': signBody(body),
    },
    body,
  });
}

async function waitForRefund() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const booking = await get('SELECT payment_status FROM bookings WHERE id = ?', [bookingId]);
    if (booking?.payment_status === 'refunded') return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for refund webhook processing.');
}

async function waitForEvent(eventType, targetBookingId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const event = await get(
      'SELECT id FROM payment_events WHERE booking_id = ? AND event_type = ?',
      [targetBookingId, eventType]
    );
    if (event) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${eventType} payment event.`);
}

try {
  // --- Scenario 1: gateway-initiated FULL refund on a paid booking ---
  verifyResponses.set('anet-refund-transaction', { ok: true, approved: true, amountCents: 2500 });
  const response = await postWebhook({
    eventType: 'net.authorize.payment.refund.created',
    notificationId: 'anet-refund-webhook-check',
    payload: {
      id: 'anet-refund-transaction',
      merchantReferenceId: bookingReference,
    },
  });

  assert.equal(response.status, 200);
  await waitForRefund();

  const booking = await get('SELECT payment_status FROM bookings WHERE id = ?', [bookingId]);
  assert.equal(booking.payment_status, 'refunded');

  const item = await get('SELECT refund_status, refund_transaction_id, refund_action FROM booking_items WHERE id = ?', [itemId]);
  assert.equal(item.refund_status, 'refunded');
  assert.equal(item.refund_transaction_id, 'anet-refund-transaction');
  assert.equal(item.refund_action, 'refund');

  const seat = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [seatId]);
  assert.equal(seat.status, 'vacant');
  assert.equal(seat.held_by, null);
  assert.equal(seat.held_until, null);

  // --- Scenario 2: webhook echo of an admin item refund must NOT escalate
  // a partially refunded booking into a fully refunded one ---
  const partialBookingId = 'anet-partial-webhook-booking';
  const partialReference = 'BNG-ANETPARTIAL1';
  const refundedItemId = 'anet-partial-item-refunded';
  const activeItemId = 'anet-partial-item-active';
  const refundedSeatId = 'anet-partial-seat-refunded';
  const activeSeatId = 'anet-partial-seat-active';
  await run(
    `INSERT INTO seats (id, session_id, table_number, chair_number, status, is_disabled)
     VALUES (?, ?, 45, 1, 'vacant', 0), (?, ?, 45, 2, 'sold', 0)`,
    [refundedSeatId, sessionId, activeSeatId, sessionId]
  );
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, transaction_id, email, customer_first_name, customer_last_name)
     VALUES (?, ?, ?, 5000, 'partially_refunded', 'anet-partial-original', 'partial-webhook@example.com', 'Partial', 'Webhook')`,
    [partialBookingId, sessionId, partialReference]
  );
  await run(
    `INSERT INTO booking_items
      (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number, refund_status, refund_transaction_id, refund_amount, refund_action)
     VALUES (?, ?, 'Refunded', 'Ticket', ?, ?, 2500, 'BNG-ANETPARTIAL1-1', 'refunded', 'anet-partial-refund-txn', 2500, 'refund')`,
    [refundedItemId, partialBookingId, refundedSeatId, packageId]
  );
  await run(
    `INSERT INTO booking_items
      (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
     VALUES (?, ?, 'Active', 'Ticket', ?, ?, 2500, 'BNG-ANETPARTIAL1-2')`,
    [activeItemId, partialBookingId, activeSeatId, packageId]
  );
  await saveDb();

  const echoResponse = await postWebhook({
    eventType: 'net.authorize.payment.refund.created',
    notificationId: 'anet-partial-echo-check',
    payload: {
      id: 'anet-partial-refund-txn',
      merchantReferenceId: partialReference,
    },
  });
  assert.equal(echoResponse.status, 200);
  await waitForEvent('webhook_refund_already_recorded', partialBookingId);

  const partialBooking = await get('SELECT payment_status FROM bookings WHERE id = ?', [partialBookingId]);
  assert.equal(partialBooking.payment_status, 'partially_refunded');
  const activeItem = await get('SELECT refund_status FROM booking_items WHERE id = ?', [activeItemId]);
  assert.equal(activeItem.refund_status || 'active', 'active');
  const activeSeat = await get('SELECT status FROM seats WHERE id = ?', [activeSeatId]);
  assert.equal(activeSeat.status, 'sold');

  // --- Scenario 3: external partial refund (unknown transaction, amount
  // below the outstanding balance) is flagged, never applied ---
  verifyResponses.set('anet-external-partial-txn', { ok: true, approved: true, amountCents: 1000 });
  const externalResponse = await postWebhook({
    eventType: 'net.authorize.payment.refund.created',
    notificationId: 'anet-external-partial-check',
    payload: {
      id: 'anet-external-partial-txn',
      merchantReferenceId: partialReference,
    },
  });
  assert.equal(externalResponse.status, 200);
  await waitForEvent('webhook_external_partial_refund', partialBookingId);

  const flaggedBooking = await get('SELECT payment_status FROM bookings WHERE id = ?', [partialBookingId]);
  assert.equal(flaggedBooking.payment_status, 'partially_refunded');
  const stillActiveItem = await get('SELECT refund_status FROM booking_items WHERE id = ?', [activeItemId]);
  assert.equal(stillActiveItem.refund_status || 'active', 'active');
  const stillSoldSeat = await get('SELECT status FROM seats WHERE id = ?', [activeSeatId]);
  assert.equal(stillSoldSeat.status, 'sold');

  console.log('Authorize.Net refund webhook API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
