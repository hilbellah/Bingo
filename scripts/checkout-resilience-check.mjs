// "No unconfirmed seats": every scenario that could still leave a charged
// customer without a seat after the 2026-09-04 fixes.
//   A. gateway unreachable -> in-flight checkout seats are protected, not resold
//   B. reaching the card form gives a longer hold than browsing
//   C. payment after cancel / after a decline still gets the seat if it is free
//   D. admins cannot disable / assign / move onto / delete around an in-flight checkout
//   E. stale cleanup leaves card-form checkouts alone for a week
//   F. a review waiting too long turns /health/payments red and is re-emailed
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-resilience-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'resilience-test-password';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.CHECKOUT_HOLD_MINUTES = '30';
process.env.PAYMENT_RECONCILE_MIN_AGE_SECONDS = '1';

const { prepareTestDatabase } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, get, all, run, saveDb } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
await prepareTestDatabase();
await getDb();

const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const minutesFromNow = m => new Date(Date.now() + m * 60000).toISOString();
const sessionId = 'res-session';
await run(`INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type, is_special_event) VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`, [sessionId, futureDate]);
const packageRow = await get("SELECT id, price FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order LIMIT 1");
let n = 0;
let seatCount = 0;
// One seat per table (tables 100+) so fixtures never collide on the
// (session, table, chair) unique index; a test may pin a table explicitly.
async function seat({ table = null, status = 'vacant', heldBy = null, heldUntil = null } = {}) {
  seatCount += 1; const id = `res-seat-${seatCount}`;
  await run(`INSERT INTO seats (id, session_id, table_number, chair_number, status, held_by, held_until) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, sessionId, table ?? (100 + seatCount), 1, status, heldBy, heldUntil]);
  return id;
}
async function booking({ seatId, holder, status = 'pending', hostedToken = 'token', attemptedAt = new Date().toISOString(), transactionId = null }) {
  n += 1; const id = `res-booking-${n}`; const ref = `BNG-RES-${n}`;
  await run(`INSERT INTO bookings (id, session_id, reference_number, total_amount, payment_status, email, customer_first_name, customer_last_name, checkout_holder_id, hosted_token, payment_attempted_at, transaction_id)
             VALUES (?, ?, ?, 9400, ?, 'r@example.com', 'Res', 'Tester', ?, ?, ?, ?)`, [id, sessionId, ref, status, holder, hostedToken, attemptedAt, transactionId]);
  await run(`INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number) VALUES (?, ?, 'Res', 'Tester', ?, ?, ?, ?)`, [`${id}-i`, id, seatId, packageRow.id, packageRow.price, `${ref}-1`]);
  await saveDb();
  return { id, ref };
}
const verified = (ref, tx) => ({ ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'OK', invoiceNumber: ref, amountCents: 9400, transactionId: tx });

const {
  app, markBookingPaid, reconcilePendingPayments, __setPaymentServicesForTesting,
} = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));
const { expireStalePendingBookings } = await import(pathToFileURL(path.join(repoRoot, 'server/src/services/scheduler.js')));
const listener = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${listener.address().port}`;
const ADMIN = `Basic ${Buffer.from('admin:resilience-test-password').toString('base64')}`;
const admin = (method, url, body) => fetch(`${base}${url}`, { method, headers: { Authorization: ADMIN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

try {
  // ---- B. card form => 30-minute hold (browsing stays 20) ----
  {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.config.holdMinutes, 20);
    assert.equal(health.config.checkoutHoldMinutes, 30);
    const sid = await seat();
    const lock = await (await fetch(`${base}/api/seats/${sid}/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holderId: 'browse-1' }) })).json();
    const browseMs = new Date(lock.holdUntil).getTime() - Date.now();
    assert.ok(browseMs > 18 * 60000 && browseMs < 21 * 60000, `browsing hold ~20 min (got ${Math.round(browseMs / 60000)})`);
    const init = await (await fetch(`${base}/api/bookings/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, holderId: 'browse-1', email: 'b@example.com', customerFirstName: 'Card', customerLastName: 'Form', attendees: [{ firstName: 'Card', lastName: 'Form', seatId: sid, addons: [] }] }) })).json();
    assert.ok(init.bookingId, `initiate ok: ${JSON.stringify(init).slice(0, 120)}`);
    const held = await get('SELECT held_until FROM seats WHERE id = ?', [sid]);
    const checkoutMs = new Date(held.held_until).getTime() - Date.now();
    assert.ok(checkoutMs > 28 * 60000 && checkoutMs < 31 * 60000, `card-form hold ~30 min (got ${Math.round(checkoutMs / 60000)})`);
  }

  // ---- A. gateway unreachable twice -> in-flight seats protected ----
  {
    const heldSeat = await seat({ status: 'held', heldBy: 'h-a', heldUntil: minutesFromNow(3) });
    const releasedSeat = await seat({ status: 'vacant' }); // sweeper already released it
    const takenSeat = await seat({ status: 'held', heldBy: 'someone-else', heldUntil: minutesFromNow(10) });
    const a = await booking({ seatId: heldSeat, holder: 'h-a', attemptedAt: new Date(Date.now() - 60000).toISOString() });
    const b = await booking({ seatId: releasedSeat, holder: 'h-b', attemptedAt: new Date(Date.now() - 25 * 60000).toISOString() });
    const c = await booking({ seatId: takenSeat, holder: 'h-c', attemptedAt: new Date(Date.now() - 60000).toISOString() });
    __setPaymentServicesForTesting({ listUnsettledTransactions: async () => ({ ok: false, error: 'E00001: gateway down' }) });
    const r1 = await reconcilePendingPayments({ reason: 'test-1' });
    assert.match(r1.error, /gateway down/);
    let hp = await (await fetch(`${base}/health/payments`)).json();
    assert.equal(hp.reconciler.degraded, false, 'one failure is not yet degraded');
    assert.equal((await get('SELECT status FROM seats WHERE id = ?', [releasedSeat])).status, 'vacant', 'nothing protected after a single failure');
    await reconcilePendingPayments({ reason: 'test-2' });
    hp = await (await fetch(`${base}/health/payments`)).json();
    assert.equal(hp.reconciler.degraded, true, 'second consecutive failure enters degraded mode');
    assert.ok(hp.problems.some(p => /degraded/.test(p)), 'health reports degraded mode');
    const heldNow = await get('SELECT held_until FROM seats WHERE id = ?', [heldSeat]);
    assert.ok(new Date(heldNow.held_until).getTime() > Date.now() + 55 * 60000, `held seat extended to ~60 min (got ${Math.round((new Date(heldNow.held_until) - Date.now()) / 60000)})`);
    const reheld = await get('SELECT status, held_by, held_until FROM seats WHERE id = ?', [releasedSeat]);
    assert.equal(reheld.status, 'held'); assert.equal(reheld.held_by, 'h-b');
    assert.ok(new Date(reheld.held_until).getTime() > Date.now() + 55 * 60000, 'released seat re-held for its checkout');
    const untouched = await get('SELECT held_by FROM seats WHERE id = ?', [takenSeat]);
    assert.equal(untouched.held_by, 'someone-else', 'seat actively held by another customer is left alone');
    assert.ok(await get("SELECT id FROM audit_log WHERE action = 'gateway_degraded_holds_protected'"), 'protection is audit-logged');
    // Recovery
    __setPaymentServicesForTesting({ listUnsettledTransactions: async () => ({ ok: true, transactions: [] }), listSettledTransactions: async () => ({ ok: true, transactions: [] }) });
    await reconcilePendingPayments({ reason: 'test-3' });
    hp = await (await fetch(`${base}/health/payments`)).json();
    assert.equal(hp.reconciler.degraded, false, 'leaves degraded mode when the gateway answers');
    void a; void b; void c;
  }

  // ---- C. payment after cancel / after decline reclaims a free seat ----
  {
    const s1 = await seat({ status: 'vacant' });
    const cancelled = await booking({ seatId: s1, holder: 'h-cancel', status: 'cancelled' });
    const r = await markBookingPaid({ bookingId: cancelled.id, transactionId: 'tx-after-cancel', authCode: 'OK', source: 'test', verifiedTransaction: verified(cancelled.ref, 'tx-after-cancel') });
    assert.equal(r.ok, true, `payment after cancel is confirmed when the seat is free: ${JSON.stringify(r)}`);
    assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [cancelled.id])).payment_status, 'paid');
    assert.equal((await get('SELECT status FROM seats WHERE id = ?', [s1])).status, 'sold');
    assert.ok(await get("SELECT id FROM payment_events WHERE booking_id = ? AND event_type = 'payment_after_cancelled_reclaimed'", [cancelled.id]));

    const s2 = await seat({ status: 'held', heldBy: 'h-fail', heldUntil: minutesFromNow(10) });
    const failed = await booking({ seatId: s2, holder: 'h-fail', status: 'failed' });
    const r2 = await markBookingPaid({ bookingId: failed.id, transactionId: 'tx-after-decline', authCode: 'OK', source: 'test', verifiedTransaction: verified(failed.ref, 'tx-after-decline') });
    assert.equal(r2.ok, true, 'retry after a declined attempt on the same card form is confirmed');

    const s3 = await seat({ status: 'sold' });
    const cancelledTaken = await booking({ seatId: s3, holder: 'h-cancel2', status: 'cancelled' });
    const r3 = await markBookingPaid({ bookingId: cancelledTaken.id, transactionId: 'tx-after-cancel-taken', authCode: 'OK', source: 'test', verifiedTransaction: verified(cancelledTaken.ref, 'tx-after-cancel-taken') });
    assert.equal(r3.requiresReview, true, 'payment after cancel onto a sold seat still goes to staff review');

    const refunded = await booking({ seatId: await seat(), holder: 'h-ref', status: 'refunded', transactionId: 'tx-old' });
    const r4 = await markBookingPaid({ bookingId: refunded.id, transactionId: 'tx-old', authCode: 'OK', source: 'test', verifiedTransaction: verified(refunded.ref, 'tx-old') });
    assert.equal(r4.ok, false, 'a refunded booking is never resurrected');
  }

  // ---- D. admin guards around an in-flight checkout ----
  {
    const sid = await seat({ table: 71, status: 'held', heldBy: 'h-inflight', heldUntil: minutesFromNow(25) });
    const inflight = await booking({ seatId: sid, holder: 'h-inflight' });
    const disable = await admin('PATCH', `/api/admin/seats/${sid}`, { is_disabled: 1 });
    assert.equal(disable.status, 409, 'cannot disable a seat with a checkout in flight');
    const body = await disable.json();
    assert.equal(body.error, 'checkout_in_progress'); assert.deepEqual(body.bookings, [inflight.ref]);
    assert.equal((await get('SELECT is_disabled FROM seats WHERE id = ?', [sid])).is_disabled, 0);
    const enable = await admin('PATCH', `/api/admin/seats/${sid}`, { is_disabled: 0 });
    assert.equal(enable.status, 200, 'enabling is never blocked');
    const table = await admin('PATCH', `/api/admin/sessions/${sessionId}/tables/71/seats`, { is_disabled: true });
    assert.equal(table.status, 409, 'cannot disable the whole table either');
    const bulk = await admin('PATCH', `/api/admin/sessions/${sessionId}/seats/bulk`, { seatIds: [sid], is_disabled: true });
    assert.equal(bulk.status, 409, 'nor via bulk');
    // Customer's hold lapsed and was swept, but they are still on the card form
    await run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [sid]); await saveDb();
    const seatRow = await get('SELECT table_number, chair_number FROM seats WHERE id = ?', [sid]);
    const promo = await admin('POST', '/api/admin/assigned-tickets', { sessionId, tableNumber: seatRow.table_number, chairNumber: seatRow.chair_number, firstName: 'Promo', lastName: 'Guest', type: 'promo' });
    assert.equal(promo.status, 409, 'cannot assign a promo ticket onto a seat someone is still paying for');
    const del = await admin('DELETE', `/api/admin/sessions/${sessionId}`);
    assert.equal(del.status, 409, 'cannot delete a session with a checkout in flight');
    assert.equal((await get('SELECT deleted_at FROM sessions WHERE id = ?', [sessionId])).deleted_at, null);
    // Super user override is explicit and audited
    const forced = await admin('PATCH', `/api/admin/seats/${sid}?force=1`, { is_disabled: 1 });
    assert.equal(forced.status, 200, 'super user can override with ?force=1');
    assert.ok(await get("SELECT id FROM audit_log WHERE action = 'checkout_guard_overridden'"), 'override is audit-logged');
    await admin('PATCH', `/api/admin/seats/${sid}`, { is_disabled: 0 });
    // Move-seat onto an in-flight seat is refused too
    const paidSeat = await seat({ status: 'sold' });
    const paid = await booking({ seatId: paidSeat, holder: 'h-paid', status: 'paid', transactionId: 'tx-paid' });
    const target = await get('SELECT table_number, chair_number FROM seats WHERE id = ?', [sid]);
    const move = await admin('POST', `/api/admin/booking-items/${paid.id}-i/move-seat`, { tableNumber: target.table_number, chairNumber: target.chair_number });
    assert.equal(move.status, 409, `cannot move a ticket onto a seat with a checkout in flight (${move.status})`);
    // Once the window passes the guard lifts
    await run("UPDATE bookings SET payment_attempted_at = ? WHERE id = ?", [new Date(Date.now() - 45 * 60000).toISOString(), inflight.id]); await saveDb();
    const later = await admin('PATCH', `/api/admin/seats/${sid}`, { is_disabled: 1 });
    assert.equal(later.status, 200, 'guard lifts after the in-flight window');
    await admin('PATCH', `/api/admin/seats/${sid}`, { is_disabled: 0 });
  }

  // ---- E. stale cleanup keeps card-form checkouts for 7 days ----
  {
    const s = await seat();
    const old = await booking({ seatId: s, holder: 'h-old', attemptedAt: new Date(Date.now() - 3 * 86400000).toISOString() });
    const browseOnly = await booking({ seatId: await seat(), holder: 'h-browse', hostedToken: null, attemptedAt: new Date(Date.now() - 3 * 86400000).toISOString() });
    await expireStalePendingBookings({ now: new Date() });
    assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [old.id])).payment_status, 'pending', '3-day-old card-form checkout is kept');
    assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [browseOnly.id])).payment_status, 'cancelled', 'a checkout that never reached the card form is still cleaned up');
    await expireStalePendingBookings({ now: new Date(Date.now() + 5 * 86400000) });
    assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [old.id])).payment_status, 'cancelled', 'and is cleaned up after a week');
  }

  // ---- F. a review waiting > 2h escalates ----
  {
    let hp = await fetch(`${base}/health/payments`);
    assert.ok(!(await hp.json()).problems.some(p => /waiting for staff review/.test(p)), 'no stale review problem yet');
    const s = await seat({ status: 'sold' });
    const review = await booking({ seatId: s, holder: 'h-rev', status: 'payment_review', transactionId: 'tx-review' });
    await run('UPDATE bookings SET payment_completed_at = ? WHERE id = ?', [new Date(Date.now() - 3 * 3600000).toISOString(), review.id]); await saveDb();
    hp = await fetch(`${base}/health/payments`);
    const body = await hp.json();
    assert.equal(hp.status, 503, `review waiting 3h turns the endpoint red (${hp.status})`);
    assert.ok(body.problems.some(p => /waiting for staff review/.test(p)), JSON.stringify(body.problems));
    // Marked handled -> no longer counts
    const dismiss = await admin('POST', `/api/admin/payment-reviews/${review.id}/dismiss`, { note: 'handled by phone' });
    assert.equal(dismiss.status, 200);
    hp = await fetch(`${base}/health/payments`);
    assert.ok(!(await hp.json()).problems.some(p => /waiting for staff review/.test(p)), 'dismissed review no longer escalates');
    // The audit re-emails stale reviews: a second stale review, audit run with a matching gateway record
    const s2 = await seat({ status: 'sold' });
    const review2 = await booking({ seatId: s2, holder: 'h-rev2', status: 'payment_review', transactionId: 'tx-review2' });
    await run('UPDATE bookings SET payment_completed_at = ? WHERE id = ?', [new Date(Date.now() - 5 * 3600000).toISOString(), review2.id]); await saveDb();
    __setPaymentServicesForTesting({
      listUnsettledTransactions: async () => ({ ok: true, transactions: [{ transId: 'tx-review2', invoiceNumber: review2.ref, status: 'capturedPendingSettlement' }] }),
      listSettledTransactions: async () => ({ ok: true, transactions: [] }),
    });
    const { runGatewayAudit } = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));
    const result = await runGatewayAudit({ reason: 'test' });
    const stale = result.anomalies.filter(a => a.kind === 'awaiting_staff_review' && a.waitingHours >= 2);
    assert.equal(stale.length, 1, 'audit flags the stale review');
    const logRow = await get("SELECT details FROM audit_log WHERE action = 'gateway_payment_audit' ORDER BY created_at DESC LIMIT 1");
    assert.equal(JSON.parse(logRow.details).staleReviewCount, 1, 'stale review count recorded (email would be sent when a provider is configured)');
  }

  console.log('Checkout resilience (no unconfirmed seats) check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
