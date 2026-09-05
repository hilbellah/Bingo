// The server must confirm a paid booking by asking the gateway, without ever
// receiving a webhook (2026-09-04: six webhooks arrived an hour late).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-reconcile-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'reconcile-test-password';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';
process.env.PAYMENT_RECONCILE_MIN_AGE_SECONDS = '10';

const { prepareTestDatabase } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, get, run, saveDb } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
await prepareTestDatabase();
await getDb();

const sessionId = 'reconcile-session';
const packageRow = await get("SELECT id, price FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order LIMIT 1");
const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
await run(
  `INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);

let n = 0;
async function makePendingBooking({ hostedToken = 'token', attemptedAgoSeconds = 90 } = {}) {
  n += 1;
  const id = `reconcile-booking-${n}`;
  const ref = `BNG-RECON-${n}`;
  const seatId = `reconcile-seat-${n}`;
  const holder = `holder-${n}`;
  await run(
    `INSERT INTO seats (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, 61, ?, 'held', ?, ?)`,
    [seatId, sessionId, n, holder, new Date(Date.now() + 15 * 60000).toISOString()]
  );
  await run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, email,
       customer_first_name, customer_last_name, checkout_holder_id, hosted_token, payment_attempted_at)
     VALUES (?, ?, ?, 9400, 'pending', 'ashley@example.com', 'Ashley', 'Tucker', ?, ?, ?)`,
    [id, sessionId, ref, holder, hostedToken, new Date(Date.now() - attemptedAgoSeconds * 1000).toISOString()]
  );
  await run(
    `INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
     VALUES (?, ?, 'Ashley', 'Tucker', ?, ?, ?, ?)`,
    [`${id}-item`, id, seatId, packageRow.id, packageRow.price, `${ref}-ITEM`]
  );
  await saveDb();
  return { id, ref, seatId };
}

const paidNoWebhook = await makePendingBooking();          // gateway has it, webhook never came
const stillUnpaid = await makePendingBooking();            // customer never paid
const declinedOnly = await makePendingBooking();           // gateway shows only a decline
const tooFresh = await makePendingBooking({ attemptedAgoSeconds: 2 }); // just started, leave alone
const neverReachedGateway = await makePendingBooking({ hostedToken: null });
const settledLater = await makePendingBooking({ attemptedAgoSeconds: 20 * 3600 }); // only in a settled batch

const { reconcilePendingPayments, __setPaymentServicesForTesting } = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));

const calls = { unsettled: 0, settled: 0, verify: [] };
__setPaymentServicesForTesting({
  listUnsettledTransactions: async () => {
    calls.unsettled += 1;
    return {
      ok: true,
      transactions: [
        { transId: 'tx-paid', invoiceNumber: paidNoWebhook.ref, status: 'capturedPendingSettlement', submitTimeUTC: '2026-09-04T16:26:00Z' },
        { transId: 'tx-declined', invoiceNumber: declinedOnly.ref, status: 'declined' },
        { transId: 'tx-fresh', invoiceNumber: tooFresh.ref, status: 'capturedPendingSettlement' },
        { transId: 'tx-unrelated', invoiceNumber: 'BNG-SOMEONE-ELSE', status: 'capturedPendingSettlement' },
      ],
    };
  },
  listSettledTransactions: async () => {
    calls.settled += 1;
    return { ok: true, transactions: [{ transId: 'tx-settled', invoiceNumber: settledLater.ref, status: 'settledSuccessfully' }] };
  },
  verifyTransaction: async transId => {
    calls.verify.push(transId);
    const byId = {
      'tx-paid': { ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'A1', invoiceNumber: paidNoWebhook.ref, amountCents: 9400 },
      'tx-settled': { ok: true, approved: true, status: 'settledSuccessfully', authCode: 'A2', invoiceNumber: settledLater.ref, amountCents: 9400 },
      'tx-fresh': { ok: true, approved: true, status: 'capturedPendingSettlement', authCode: 'A3', invoiceNumber: tooFresh.ref, amountCents: 9400 },
    };
    return byId[transId] || { ok: false, error: `unexpected verify for ${transId}` };
  },
});

try {
  const first = await reconcilePendingPayments({ reason: 'test', includeSettled: true });
  assert.equal(first.error, undefined, JSON.stringify(first));
  assert.equal(first.confirmed, 2, JSON.stringify(first));
  assert.equal(calls.unsettled, 1);
  assert.equal(calls.settled, 1);
  assert.deepEqual([...calls.verify].sort(), ['tx-paid', 'tx-settled']);

  assert.deepEqual(await get('SELECT payment_status, transaction_id, auth_code FROM bookings WHERE id = ?', [paidNoWebhook.id]), { payment_status: 'paid', transaction_id: 'tx-paid', auth_code: 'A1' });
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [paidNoWebhook.seatId])).status, 'sold');
  assert.ok(await get("SELECT id FROM payment_events WHERE booking_id = ? AND event_type = 'reconciled_from_gateway'", [paidNoWebhook.id]));
  assert.ok(await get("SELECT id FROM payment_events WHERE booking_id = ? AND event_type = 'approved' AND source = 'gateway_reconciliation'", [paidNoWebhook.id]));

  assert.deepEqual(await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [settledLater.id]), { payment_status: 'paid', transaction_id: 'tx-settled' });

  for (const untouched of [stillUnpaid, declinedOnly, tooFresh, neverReachedGateway]) {
    const row = await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [untouched.id]);
    assert.deepEqual(row, { payment_status: 'pending', transaction_id: null }, `${untouched.ref} must stay pending`);
    assert.equal((await get('SELECT status FROM seats WHERE id = ?', [untouched.seatId])).status, 'held');
  }

  // Idempotent: a second pass (or a late webhook) changes nothing and does
  // not re-verify already-paid bookings.
  const verifyCallsBefore = calls.verify.length;
  const second = await reconcilePendingPayments({ reason: 'test-again' });
  assert.equal(second.confirmed, 0);
  assert.equal(calls.verify.length, verifyCallsBefore);
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [paidNoWebhook.id])).payment_status, 'paid');

  // Gateway outage: nothing changes, nothing throws.
  __setPaymentServicesForTesting({ listUnsettledTransactions: async () => ({ ok: false, error: 'E00001: timeout' }) });
  const outage = await reconcilePendingPayments({ reason: 'outage' });
  assert.equal(outage.confirmed, 0);
  assert.match(outage.error, /timeout/);
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [stillUnpaid.id])).payment_status, 'pending');

  console.log('Gateway payment reconciliation check passed.');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
