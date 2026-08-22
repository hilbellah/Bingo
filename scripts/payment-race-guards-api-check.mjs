// Regression checks for the payment-race guards:
//   1. /api/bookings/initiate must NOT rebuild a reused booking whose payment
//      completed during hosted-token creation (initiate_rebuild_aborted_not_pending),
//      and must only say "payment completed" for genuinely completed states.
//   2. markBookingPaid must preserve completed financial states
//      (stale_payment_after_completed_state) instead of overwriting them.
//   3. validateBookingRequest must reject duplicate attendee seats and
//      bookings larger than 6 tickets.
//   4. A checkout resumed under a new browser holder must stamp that current
//      holder onto the reused booking so its approved payment can claim seats.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-payment-race-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, all, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const createdAt = new Date().toISOString();
const sessionId = 'payment-race-session';
const requiredPkg = await get("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order ASC LIMIT 1");

await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);

// Fixture helper: a pending reusable checkout (booking + held seat + item).
let seatCounter = 0;
async function insertReusableCheckout({ bookingId, holderId, email, reference }) {
  seatCounter += 1;
  const seatId = `payment-race-seat-${seatCounter}`;
  const itemId = `${bookingId}-item`;
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, 40, ?, 'held', ?, ?)`,
    [seatId, sessionId, seatCounter, holderId, holdUntil]
  );
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, created_at,
       email, customer_first_name, customer_last_name, hosted_token, ticket_access_token,
       payment_attempted_at, checkout_holder_id)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, 'Race', 'Tester', 'stale-hosted-token', 'race-ticket-token', ?, ?)`,
    [bookingId, sessionId, reference, requiredPkg.price, createdAt, email, createdAt, holderId]
  );
  await run(
    `INSERT INTO booking_items
      (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
     VALUES (?, ?, 'Race', 'Tester', ?, ?, ?, ?)`,
    [itemId, bookingId, seatId, requiredPkg.id, requiredPkg.price, `${reference}-ITEM`]
  );
  return { seatId, itemId };
}

const paidRace = await insertReusableCheckout({
  bookingId: 'payment-race-paid-booking',
  holderId: 'race-holder-paid',
  email: 'race-paid@example.com',
  reference: 'BNG-RACEPAID',
});
const cancelledRace = await insertReusableCheckout({
  bookingId: 'payment-race-cancelled-booking',
  holderId: 'race-holder-cancelled',
  email: 'race-cancelled@example.com',
  reference: 'BNG-RACECANCEL',
});
const resumedRace = await insertReusableCheckout({
  bookingId: 'payment-race-resumed-booking',
  holderId: 'race-holder-original-browser',
  email: 'race-resumed@example.com',
  reference: 'BNG-RACERESUMED',
});
await run(
  `UPDATE seats SET held_by = ?, held_until = ? WHERE id = ?`,
  ['race-holder-new-browser', holdUntil, resumedRace.seatId]
);
await saveDb();

const { app, markBookingPaid, __setPaymentServicesForTesting } = await import(appUrl);
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

function initiateBody({ holderId, email, seatId }) {
  return {
    sessionId,
    holderId,
    email,
    customerFirstName: 'Race',
    customerLastName: 'Tester',
    attendees: [{ firstName: 'Race', lastName: 'Tester', seatId, addons: [] }],
  };
}

try {
  // --- Scenario 1: previous payment completes DURING hosted-token creation.
  // The rebuild must abort without touching items/total/token, and the
  // response must direct the customer to their completed payment.
  __setPaymentServicesForTesting({
    createHostedPaymentPage: async () => {
      await run(
        "UPDATE bookings SET payment_status = 'paid', transaction_id = 'race-early-txn' WHERE id = ?",
        ['payment-race-paid-booking']
      );
      return { ok: true, token: 'race-new-token' };
    },
  });
  const paidResult = await postJson('/api/bookings/initiate', initiateBody({
    holderId: 'race-holder-paid',
    email: 'race-paid@example.com',
    seatId: paidRace.seatId,
  }));
  assert.equal(paidResult.response.status, 409);
  assert.equal(paidResult.data.alreadyCompleted, true);
  assert.match(paidResult.data.error, /already completed/i);

  const paidBooking = await get(
    'SELECT payment_status, transaction_id, hosted_token, total_amount FROM bookings WHERE id = ?',
    ['payment-race-paid-booking']
  );
  assert.equal(paidBooking.payment_status, 'paid');
  assert.equal(paidBooking.transaction_id, 'race-early-txn');
  assert.equal(paidBooking.hosted_token, 'stale-hosted-token', 'aborted rebuild must not swap the hosted token');
  assert.equal(paidBooking.total_amount, requiredPkg.price, 'aborted rebuild must not change the charged total');
  const paidItems = await all('SELECT id FROM booking_items WHERE booking_id = ?', ['payment-race-paid-booking']);
  assert.deepEqual(paidItems.map(row => row.id), [paidRace.itemId], 'aborted rebuild must keep the original items');
  const abortEvent = await get(
    "SELECT id FROM payment_events WHERE booking_id = ? AND event_type = 'initiate_rebuild_aborted_not_pending'",
    ['payment-race-paid-booking']
  );
  assert.ok(abortEvent, 'expected initiate_rebuild_aborted_not_pending payment event');

  // --- Scenario 2: booking becomes CANCELLED during token creation. The
  // abort response must NOT claim the payment completed.
  __setPaymentServicesForTesting({
    createHostedPaymentPage: async () => {
      await run(
        "UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?",
        ['payment-race-cancelled-booking']
      );
      return { ok: true, token: 'race-new-token-2' };
    },
  });
  const cancelledResult = await postJson('/api/bookings/initiate', initiateBody({
    holderId: 'race-holder-cancelled',
    email: 'race-cancelled@example.com',
    seatId: cancelledRace.seatId,
  }));
  assert.equal(cancelledResult.response.status, 409);
  assert.equal(cancelledResult.data.alreadyCompleted, undefined);
  assert.match(cancelledResult.data.error, /no longer active/i);
  assert.doesNotMatch(cancelledResult.data.error, /already completed/i);

  // --- Scenario 3: an expired checkout is resumed from a different browser.
  // The same pending booking is intentionally reused, but its holder id must
  // follow the fresh seat lease or a valid charge gets quarantined instead of
  // converting the newly held seats to sold.
  __setPaymentServicesForTesting({
    createHostedPaymentPage: async () => ({ ok: true, token: 'race-resumed-token' }),
  });
  const resumedResult = await postJson('/api/bookings/initiate', initiateBody({
    holderId: 'race-holder-new-browser',
    email: 'race-resumed@example.com',
    seatId: resumedRace.seatId,
  }));
  assert.equal(resumedResult.response.status, 200);
  assert.equal(resumedResult.data.bookingId, 'payment-race-resumed-booking');
  assert.equal(resumedResult.data.duplicate, true);
  const resumedBooking = await get(
    'SELECT checkout_holder_id, hosted_token, payment_status FROM bookings WHERE id = ?',
    ['payment-race-resumed-booking']
  );
  assert.deepEqual(resumedBooking, {
    checkout_holder_id: 'race-holder-new-browser',
    hosted_token: 'race-resumed-token',
    payment_status: 'pending',
  });

  const resumedPaid = await markBookingPaid({
    bookingId: 'payment-race-resumed-booking',
    transactionId: 'race-resumed-txn',
    authCode: 'RESUMED',
    source: 'test',
    verifiedTransaction: {
      ok: true,
      approved: true,
      status: 'capturedPendingSettlement',
      authCode: 'RESUMED',
      amountCents: resumedResult.data.totalAmount,
    },
  });
  assert.equal(resumedPaid.ok, true, JSON.stringify(resumedPaid));
  const resumedSeat = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [resumedRace.seatId]);
  assert.deepEqual(resumedSeat, { status: 'sold', held_by: null, held_until: null });

  // --- Scenario 4: duplicate attendee seat ids are rejected server-side.
  const duplicateSeatResult = await postJson('/api/bookings/initiate', {
    sessionId,
    holderId: 'race-holder-dup',
    email: 'race-dup@example.com',
    customerFirstName: 'Race',
    customerLastName: 'Tester',
    attendees: [
      { firstName: 'One', lastName: 'Tester', seatId: paidRace.seatId, addons: [] },
      { firstName: 'Two', lastName: 'Tester', seatId: paidRace.seatId, addons: [] },
    ],
  });
  assert.equal(duplicateSeatResult.response.status, 400);
  assert.match(duplicateSeatResult.data.error, /different seat/i);

  // --- Scenario 5: more than 6 attendees is rejected server-side.
  const oversizeResult = await postJson('/api/bookings/initiate', {
    sessionId,
    holderId: 'race-holder-oversize',
    email: 'race-oversize@example.com',
    customerFirstName: 'Race',
    customerLastName: 'Tester',
    attendees: Array.from({ length: 7 }, (_, index) => ({
      firstName: `P${index}`,
      lastName: 'Tester',
      seatId: `oversize-seat-${index}`,
      addons: [],
    })),
  });
  assert.equal(oversizeResult.response.status, 400);
  assert.match(oversizeResult.data.error, /at most 6/i);

  // --- Scenario 6: a stray charge landing on a partially refunded booking
  // must preserve its status and original transaction id.
  const staleBookingId = 'payment-race-partial-booking';
  await run(
    `INSERT INTO seats (id, session_id, table_number, chair_number, status)
     VALUES ('payment-race-partial-seat-1', ?, 41, 1, 'vacant'),
            ('payment-race-partial-seat-2', ?, 41, 2, 'sold')`,
    [sessionId, sessionId]
  );
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, created_at, email,
       customer_first_name, customer_last_name, transaction_id)
     VALUES (?, ?, 'BNG-RACEPARTIAL', 5000, 'partially_refunded', ?, 'race-partial@example.com', 'Race', 'Tester', 'orig-txn')`,
    [staleBookingId, sessionId, createdAt]
  );
  await run(
    `INSERT INTO booking_items
      (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number, refund_status, refund_amount, refund_transaction_id, refund_action)
     VALUES ('payment-race-partial-item-1', ?, 'Refunded', 'Tester', 'payment-race-partial-seat-1', ?, 2500, 'BNG-RACEPARTIAL-1', 'refunded', 2500, 'orig-refund-txn', 'refund')`,
    [staleBookingId, requiredPkg.id]
  );
  await run(
    `INSERT INTO booking_items
      (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
     VALUES ('payment-race-partial-item-2', ?, 'Active', 'Tester', 'payment-race-partial-seat-2', ?, 2500, 'BNG-RACEPARTIAL-2')`,
    [staleBookingId, requiredPkg.id]
  );
  await saveDb();

  const strayResult = await markBookingPaid({
    bookingId: staleBookingId,
    transactionId: 'stray-txn',
    authCode: 'STRAY',
    source: 'test',
    verifiedTransaction: { ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'STRAY' },
  });
  assert.equal(strayResult.ok, false);
  assert.equal(strayResult.requiresReview, true);
  assert.equal(strayResult.rejection, 'stale_payment_after_completed_state');

  const preservedBooking = await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [staleBookingId]);
  assert.deepEqual(preservedBooking, { payment_status: 'partially_refunded', transaction_id: 'orig-txn' });
  const activeItem = await get('SELECT refund_status FROM booking_items WHERE id = ?', ['payment-race-partial-item-2']);
  assert.equal(activeItem.refund_status || 'active', 'active');
  const staleEvent = await get(
    "SELECT id FROM payment_events WHERE booking_id = ? AND event_type = 'stale_payment_requires_review'",
    [staleBookingId]
  );
  assert.ok(staleEvent, 'expected stale_payment_requires_review payment event');

  // Idempotent echo of the ORIGINAL transaction must be a silent no-op.
  const echoResult = await markBookingPaid({
    bookingId: staleBookingId,
    transactionId: 'orig-txn',
    authCode: 'ORIG',
    source: 'test',
    verifiedTransaction: { ok: true, approved: true, status: 'settledSuccessfully', authCode: 'ORIG' },
  });
  assert.equal(echoResult.ok, false);
  assert.equal(echoResult.alreadyReversed, true);
  const echoBooking = await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [staleBookingId]);
  assert.deepEqual(echoBooking, { payment_status: 'partially_refunded', transaction_id: 'orig-txn' });

  console.log('Payment race guards API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
