import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-late-payment-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'late-payment-test-password';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));
const { migrate } = await import(migrateUrl);
const { getDb, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const sessionId = 'late-payment-session';
const seatId = 'late-payment-seat';
const firstBookingId = 'late-payment-cancelled-booking';
const secondBookingId = 'late-payment-valid-booking';
const firstItemId = 'late-payment-cancelled-item';
const secondItemId = 'late-payment-valid-item';
const packageRow = await get("SELECT id, price FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order LIMIT 1");
const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const heldUntil = new Date(Date.now() + 20 * 60000).toISOString();

await run(
  `INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);
await run(
  `INSERT INTO seats (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 69, 6, 'held', 'holder-first', ?)`,
  [seatId, sessionId, heldUntil]
);
await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, email,
     customer_first_name, customer_last_name, checkout_holder_id)
   VALUES (?, ?, 'BNG-LATE-FIRST', 9400, 'pending', 'vivian@example.com', 'Vivian', 'Kearns', 'holder-first')`,
  [firstBookingId, sessionId]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, 'Vivian', 'Kearns', ?, ?, ?, 'BNG-LATE-FIRST-ITEM')`,
  [firstItemId, firstBookingId, seatId, packageRow.id, packageRow.price]
);
await saveDb();

const {
  app,
  markBookingPaid,
  markBookingCancelled,
  markBookingVoided,
  reconcileReversedBookingSeats,
} = await import(appUrl);
const cancelled = await markBookingCancelled({ bookingId: firstBookingId, source: 'test' });
assert.equal(cancelled.ok, true);

// Simulate the cancelled hold expiring and the same seat being selected in a
// fresh checkout, exactly as happened in the production incident.
await run(
  `UPDATE seats SET status = 'held', held_by = 'holder-second', held_until = ? WHERE id = ?`,
  [heldUntil, seatId]
);
await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, email,
     customer_first_name, customer_last_name, checkout_holder_id)
   VALUES (?, ?, 'BNG-LATE-SECOND', 9400, 'pending', 'vivian@example.com', 'Vivian', 'Kearns', 'holder-second')`,
  [secondBookingId, sessionId]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, 'Vivian', 'Kearns', ?, ?, ?, 'BNG-LATE-SECOND-ITEM')`,
  [secondItemId, secondBookingId, seatId, packageRow.id, packageRow.price]
);

const validPayment = await markBookingPaid({
  bookingId: secondBookingId,
  transactionId: 'valid-transaction',
  authCode: 'VALID',
  source: 'test',
  verifiedTransaction: { ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'VALID' },
});
assert.equal(validPayment.ok, true);

const latePayment = await markBookingPaid({
  bookingId: firstBookingId,
  transactionId: 'late-transaction',
  authCode: 'LATE',
  source: 'test',
  verifiedTransaction: { ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'LATE' },
});

assert.equal(latePayment.ok, false);
assert.equal(latePayment.requiresReview, true);
assert.equal(latePayment.reversed, undefined);

const firstBooking = await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [firstBookingId]);
const secondBooking = await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [secondBookingId]);
const firstItem = await get('SELECT refund_status, refund_action FROM booking_items WHERE id = ?', [firstItemId]);
const seat = await get('SELECT status FROM seats WHERE id = ?', [seatId]);
assert.deepEqual(firstBooking, { payment_status: 'payment_review', transaction_id: 'late-transaction' });
assert.deepEqual(secondBooking, { payment_status: 'paid', transaction_id: 'valid-transaction' });
assert.equal(firstItem.refund_status, 'active');
assert.equal(firstItem.refund_action, null);
assert.equal(seat.status, 'sold');

const activeOwners = await get(`
  SELECT COUNT(DISTINCT b.id) as count
  FROM booking_items bi
  JOIN bookings b ON b.id = bi.booking_id
  WHERE bi.seat_id = ?
    AND b.payment_status IN ('paid', 'partially_refunded')
    AND COALESCE(bi.refund_status, 'active') != 'refunded'
`, [seatId]);
assert.equal(Number(activeOwners.count), 1);

// Staff can complete the manual reversal after review, and doing so must not
// release the seat from the separate valid paid booking.
const manualVoid = await markBookingVoided({
  bookingId: firstBookingId,
  transactionId: 'late-transaction',
  voidTransactionId: 'manual-void-transaction',
  source: 'test_manual_review',
});
assert.equal(manualVoid.ok, true);
assert.equal(manualVoid.releasedSeats, 0);
assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [firstBookingId])).payment_status, 'voided');
assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'sold');

// A partially refunded booking can still own active tickets. Maintenance must
// not release those seats merely because an older duplicate was reversed.
await run("UPDATE bookings SET payment_status = 'partially_refunded' WHERE id = ?", [secondBookingId]);
await saveDb();
assert.equal(await reconcileReversedBookingSeats(), 0);
assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'sold');

const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
try {
  const token = Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/admin/bookings/${secondBookingId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Basic ${token}` },
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, 'refund_required');
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'sold');

  console.log('Late payment quarantine and paid-booking cancellation safety check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
