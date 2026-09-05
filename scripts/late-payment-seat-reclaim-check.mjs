// Regression for the 2026-09-04 incident: a payment confirmed after the seat
// hold lapsed must still get its seat when nobody else has it, the customer's
// status poll must keep the hold alive, and staff must be able to confirm a
// quarantined payment from the admin panel when the seat is free.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-seat-reclaim-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'seat-reclaim-test-password';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';
process.env.SESSION_HOLD_MINUTES = '20';

const { prepareTestDatabase } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, get, all, run, saveDb } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
await prepareTestDatabase();
await getDb();

const sessionId = 'reclaim-session';
const packageRow = await get("SELECT id, price FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order LIMIT 1");
const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const minutesFromNow = m => new Date(Date.now() + m * 60000).toISOString();

await run(
  `INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);

let seatCounter = 0;
async function makeSeat({ status = 'vacant', heldBy = null, heldUntil = null } = {}) {
  seatCounter += 1;
  const id = `reclaim-seat-${seatCounter}`;
  await run(
    `INSERT INTO seats (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, 60, ?, ?, ?, ?)`,
    [id, sessionId, seatCounter, status, heldBy, heldUntil]
  );
  return id;
}

let bookingCounter = 0;
async function makeBooking({ seatId, holderId, attemptedAt = new Date().toISOString() }) {
  bookingCounter += 1;
  const id = `reclaim-booking-${bookingCounter}`;
  const ref = `BNG-RECLAIM-${bookingCounter}`;
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, email,
       customer_first_name, customer_last_name, checkout_holder_id, hosted_token, payment_attempted_at)
     VALUES (?, ?, ?, 9400, 'pending', 'dan@example.com', 'Dan', 'Johnson', ?, 'token', ?)`,
    [id, sessionId, ref, holderId, attemptedAt]
  );
  await run(
    `INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
     VALUES (?, ?, 'Dan', 'Johnson', ?, ?, ?, ?)`,
    [`${id}-item`, id, seatId, packageRow.id, packageRow.price, `${ref}-ITEM`]
  );
  await saveDb();
  return { id, ref };
}

const verified = (ref, transactionId) => ({
  ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'OK', invoiceNumber: ref, amountCents: 9400, transactionId,
});

const {
  app,
  markBookingPaid,
  keepCheckoutHoldAlive,
  __setPaymentServicesForTesting,
} = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));

const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const adminToken = Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString('base64');

try {
  // 1) Status poll keeps the hold alive while the customer is still checking out.
  const heartbeatSeat = await makeSeat({ status: 'held', heldBy: 'holder-hb', heldUntil: minutesFromNow(3) });
  const heartbeatBooking = await makeBooking({ seatId: heartbeatSeat, holderId: 'holder-hb' });
  const statusResponse = await fetch(`${baseUrl}/api/bookings/${heartbeatBooking.id}/status`);
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).status, 'pending');
  const refreshed = await get('SELECT held_until FROM seats WHERE id = ?', [heartbeatSeat]);
  assert.ok(new Date(refreshed.held_until).getTime() > Date.now() + 18 * 60000, 'status poll should extend the hold to a fresh window');

  // A hold that is already fresh is left alone (no write churn), and a seat
  // held by someone else is never touched.
  const untouched = await keepCheckoutHoldAlive({ ...(await get('SELECT * FROM bookings WHERE id = ?', [heartbeatBooking.id])) });
  assert.equal(untouched.extended, 0);
  const otherSeat = await makeSeat({ status: 'held', heldBy: 'holder-other', heldUntil: minutesFromNow(2) });
  const otherBooking = await makeBooking({ seatId: otherSeat, holderId: 'holder-mine' });
  await keepCheckoutHoldAlive(await get('SELECT * FROM bookings WHERE id = ?', [otherBooking.id]));
  assert.ok(new Date((await get('SELECT held_until FROM seats WHERE id = ?', [otherSeat])).held_until).getTime() < Date.now() + 3 * 60000);

  // The heartbeat is capped: an old checkout no longer extends anything.
  const staleBooking = await makeBooking({ seatId: await makeSeat({ status: 'held', heldBy: 'holder-stale', heldUntil: minutesFromNow(1) }), holderId: 'holder-stale', attemptedAt: new Date(Date.now() - 5 * 3600000).toISOString() });
  const capped = await keepCheckoutHoldAlive(await get('SELECT * FROM bookings WHERE id = ?', [staleBooking.id]));
  assert.equal(capped.extended, 0);
  assert.equal(capped.capped, true);

  // 2) Late payment, seat already swept back to vacant -> the customer keeps it.
  const vacantSeat = await makeSeat({ status: 'vacant' });
  const vacantBooking = await makeBooking({ seatId: vacantSeat, holderId: 'holder-late' });
  const reclaim = await markBookingPaid({
    bookingId: vacantBooking.id, transactionId: 'tx-late-vacant', authCode: 'OK', source: 'test',
    verifiedTransaction: verified(vacantBooking.ref, 'tx-late-vacant'),
  });
  assert.equal(reclaim.ok, true, `late payment should confirm on a vacant seat: ${JSON.stringify(reclaim)}`);
  assert.equal(reclaim.reclaimedSeats, 1);
  assert.deepEqual(await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [vacantBooking.id]), { payment_status: 'paid', transaction_id: 'tx-late-vacant' });
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [vacantSeat])).status, 'sold');
  assert.ok(await get("SELECT id FROM payment_events WHERE booking_id = ? AND event_type = 'late_payment_seat_reclaimed'", [vacantBooking.id]));

  // 3) Late payment, seat re-held by someone else but their hold already lapsed
  //    (sweeper has not run yet) -> still ours.
  const lapsedSeat = await makeSeat({ status: 'held', heldBy: 'holder-someone', heldUntil: new Date(Date.now() - 60000).toISOString() });
  const lapsedBooking = await makeBooking({ seatId: lapsedSeat, holderId: 'holder-late2' });
  const lapsed = await markBookingPaid({
    bookingId: lapsedBooking.id, transactionId: 'tx-late-lapsed', authCode: 'OK', source: 'test',
    verifiedTransaction: verified(lapsedBooking.ref, 'tx-late-lapsed'),
  });
  assert.equal(lapsed.ok, true, `lapsed foreign hold should be reclaimable: ${JSON.stringify(lapsed)}`);
  assert.equal((await get('SELECT status, held_by FROM seats WHERE id = ?', [lapsedSeat])).status, 'sold');

  // 4) Seat actively held by another customer -> quarantine, exactly as before.
  const busySeat = await makeSeat({ status: 'held', heldBy: 'holder-active', heldUntil: minutesFromNow(10) });
  const busyBooking = await makeBooking({ seatId: busySeat, holderId: 'holder-late3' });
  const quarantined = await markBookingPaid({
    bookingId: busyBooking.id, transactionId: 'tx-late-busy', authCode: 'OK', source: 'test',
    verifiedTransaction: verified(busyBooking.ref, 'tx-late-busy'),
  });
  assert.equal(quarantined.ok, false);
  assert.equal(quarantined.requiresReview, true);
  assert.equal(quarantined.rejection, 'seat_held_by_another_customer');
  assert.deepEqual(await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [busyBooking.id]), { payment_status: 'payment_review', transaction_id: 'tx-late-busy' });
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [busySeat])).status, 'held');
  const alertEvent = await new Promise(resolve => setTimeout(async () => {
    resolve(await get("SELECT raw_payload FROM payment_events WHERE booking_id = ? AND event_type = 'review_alert_email'", [busyBooking.id]));
  }, 200));
  assert.ok(alertEvent, 'a review alert email attempt must be logged for every quarantine');

  // 5) Admin panel lists it; the other customer walks away (seat becomes
  //    vacant); staff press "Confirm seat" and the booking completes.
  __setPaymentServicesForTesting({ verifyTransaction: async transId => verified(busyBooking.ref, transId) });
  let listing = await (await fetch(`${baseUrl}/api/admin/payment-reviews`, { headers: { Authorization: `Basic ${adminToken}` } })).json();
  let row = listing.reviews.find(r => r.id === busyBooking.id);
  assert.ok(row, 'quarantined booking should be listed for review');
  assert.equal(row.canConfirm, false);
  assert.equal(row.seats[0].state, 'held_by_someone_else');

  const blocked = await fetch(`${baseUrl}/api/admin/payment-reviews/${busyBooking.id}/confirm`, { method: 'POST', headers: { Authorization: `Basic ${adminToken}`, 'Content-Type': 'application/json' } });
  assert.equal(blocked.status, 409, 'confirm must refuse while another customer actively holds the seat');
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [busyBooking.id])).payment_status, 'payment_review');

  await run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [busySeat]);
  await saveDb();
  listing = await (await fetch(`${baseUrl}/api/admin/payment-reviews`, { headers: { Authorization: `Basic ${adminToken}` } })).json();
  row = listing.reviews.find(r => r.id === busyBooking.id);
  assert.equal(row.canConfirm, true);

  const confirmed = await fetch(`${baseUrl}/api/admin/payment-reviews/${busyBooking.id}/confirm`, { method: 'POST', headers: { Authorization: `Basic ${adminToken}`, 'Content-Type': 'application/json' } });
  const confirmedBody = await confirmed.json();
  assert.equal(confirmed.status, 200, JSON.stringify(confirmedBody));
  assert.deepEqual(await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [busyBooking.id]), { payment_status: 'paid', transaction_id: 'tx-late-busy' });
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [busySeat])).status, 'sold');
  assert.ok(await get("SELECT id FROM audit_log WHERE action = 'payment_review_confirmed' AND entity_id = ?", [busyBooking.id]));
  listing = await (await fetch(`${baseUrl}/api/admin/payment-reviews`, { headers: { Authorization: `Basic ${adminToken}` } })).json();
  assert.equal(listing.reviews.some(r => r.id === busyBooking.id), false);

  // 6) Duplicate charges are listed until staff mark them resolved.
  await run(
    `INSERT INTO payment_events (id, booking_id, event_type, source, raw_payload, created_at)
     VALUES ('dup-evt-1', ?, 'duplicate_payment_requires_review', 'automatic_payment_safety', ?, ?)`,
    [vacantBooking.id, JSON.stringify({ duplicateTransactionId: 'tx-dup', originalTransactionId: 'tx-late-vacant' }), new Date().toISOString()]
  );
  await saveDb();
  listing = await (await fetch(`${baseUrl}/api/admin/payment-reviews`, { headers: { Authorization: `Basic ${adminToken}` } })).json();
  const dup = listing.duplicates.find(d => d.id === 'dup-evt-1');
  assert.ok(dup);
  assert.equal(dup.duplicateTransactionId, 'tx-dup');
  const resolved = await fetch(`${baseUrl}/api/admin/payment-reviews/duplicates/dup-evt-1/resolve`, { method: 'POST', headers: { Authorization: `Basic ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'refunded in gateway' }) });
  assert.equal(resolved.status, 200);
  listing = await (await fetch(`${baseUrl}/api/admin/payment-reviews`, { headers: { Authorization: `Basic ${adminToken}` } })).json();
  assert.equal(listing.duplicates.some(d => d.id === 'dup-evt-1'), false);

  // 6b) A review handled another way can be cleared with a note; the booking
  //     keeps its status and the note lands in the audit trail.
  const handledSeat = await makeSeat({ status: 'held', heldBy: 'holder-taken', heldUntil: minutesFromNow(10) });
  const handledBooking = await makeBooking({ seatId: handledSeat, holderId: 'holder-handled' });
  const handledResult = await markBookingPaid({
    bookingId: handledBooking.id, transactionId: 'tx-handled', authCode: 'OK', source: 'test',
    verifiedTransaction: verified(handledBooking.ref, 'tx-handled'),
  });
  assert.equal(handledResult.requiresReview, true);
  const noNote = await fetch(`${baseUrl}/api/admin/payment-reviews/${handledBooking.id}/dismiss`, { method: 'POST', headers: { Authorization: `Basic ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '   ' }) });
  assert.equal(noNote.status, 400, 'dismiss must require a note');
  const dismissed = await fetch(`${baseUrl}/api/admin/payment-reviews/${handledBooking.id}/dismiss`, { method: 'POST', headers: { Authorization: `Basic ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Reseated customer at T45/5 with promo ticket' }) });
  assert.equal(dismissed.status, 200);
  listing = await (await fetch(`${baseUrl}/api/admin/payment-reviews`, { headers: { Authorization: `Basic ${adminToken}` } })).json();
  assert.equal(listing.reviews.some(r => r.id === handledBooking.id), false, 'dismissed review must leave the notification list');
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [handledBooking.id])).payment_status, 'payment_review');
  assert.ok(await get("SELECT id FROM audit_log WHERE action = 'payment_review_dismissed' AND entity_id = ?", [handledBooking.id]));

  // 7) The browser can hand the transaction id straight to the server.
  const iframeSeat = await makeSeat({ status: 'held', heldBy: 'holder-iframe', heldUntil: minutesFromNow(10) });
  const iframeBooking = await makeBooking({ seatId: iframeSeat, holderId: 'holder-iframe' });
  __setPaymentServicesForTesting({ verifyTransaction: async transId => verified(iframeBooking.ref, transId) });
  const posted = await fetch(`${baseUrl}/api/bookings/${iframeBooking.id}/payment-result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transId: 'tx-iframe' }) });
  const postedBody = await posted.json();
  assert.equal(posted.status, 200, JSON.stringify(postedBody));
  assert.equal(postedBody.status, 'paid');
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [iframeSeat])).status, 'sold');

  const paidCount = (await all("SELECT id FROM bookings WHERE payment_status = 'paid'")).length;
  assert.equal(paidCount, 4);
  console.log('Late payment seat reclaim, hold heartbeat and admin confirm check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
