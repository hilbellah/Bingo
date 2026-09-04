// Every dollar the gateway captured must map to a confirmed / reviewed /
// refunded booking. Anything else is flagged, emailed, and turns
// /health/payments red for external monitoring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-audit-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'audit-test-password';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';

const { migrate } = await import(pathToFileURL(path.join(repoRoot, 'server/src/migrate.js')));
const { getDb, get, run, saveDb } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
await migrate();
await getDb();

const sessionId = 'audit-session';
const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
await run(
  `INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
  [sessionId, futureDate]
);
let n = 0;
async function booking(status, transactionId = null) {
  n += 1;
  const id = `audit-booking-${n}`;
  const ref = `BNG-AUDIT-${n}`;
  await run(
    `INSERT INTO bookings (id, session_id, reference_number, total_amount, payment_status, email, customer_first_name, customer_last_name, transaction_id, hosted_token)
     VALUES (?, ?, ?, 9400, ?, 'w@example.com', 'Wendi', 'Colton', ?, 'token')`,
    [id, sessionId, ref, status, transactionId]
  );
  await saveDb();
  return { id, ref };
}

const okPaid = await booking('paid', 'tx-ok');
const pendingCharged = await booking('pending');          // charged, never confirmed  -> critical
const cancelledCharged = await booking('cancelled');      // charged after cancel      -> critical
const doubleCharged = await booking('paid', 'tx-double-a'); // second unflagged charge -> critical
const flaggedDouble = await booking('paid', 'tx-flag-a');   // second charge already flagged -> fine
await run(
  `INSERT INTO payment_events (id, booking_id, event_type, source, raw_payload, created_at)
   VALUES ('flag-evt', ?, 'duplicate_payment_requires_review', 'automatic_payment_safety', ?, ?)`,
  [flaggedDouble.id, JSON.stringify({ duplicateTransactionId: 'tx-flag-b', originalTransactionId: 'tx-flag-a' }), new Date().toISOString()]
);
const inReview = await booking('payment_review', 'tx-review');
await saveDb();

const { app, runGatewayAudit, __setPaymentServicesForTesting } = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));

const gateway = [
  { transId: 'tx-ok', invoiceNumber: okPaid.ref, status: 'capturedPendingSettlement' },
  { transId: 'tx-pending', invoiceNumber: pendingCharged.ref, status: 'capturedPendingSettlement' },
  { transId: 'tx-cancelled', invoiceNumber: cancelledCharged.ref, status: 'settledSuccessfully' },
  { transId: 'tx-double-a', invoiceNumber: doubleCharged.ref, status: 'settledSuccessfully' },
  { transId: 'tx-double-b', invoiceNumber: doubleCharged.ref, status: 'capturedPendingSettlement' },
  { transId: 'tx-flag-a', invoiceNumber: flaggedDouble.ref, status: 'settledSuccessfully' },
  { transId: 'tx-flag-b', invoiceNumber: flaggedDouble.ref, status: 'capturedPendingSettlement' },
  { transId: 'tx-review', invoiceNumber: inReview.ref, status: 'capturedPendingSettlement' },
  { transId: 'tx-ghost', invoiceNumber: 'BNG-DOESNOTEXIST', status: 'capturedPendingSettlement' },
  { transId: 'tx-declined', invoiceNumber: pendingCharged.ref, status: 'declined' },
  { transId: 'tx-terminal', invoiceNumber: null, status: 'settledSuccessfully' },
];
__setPaymentServicesForTesting({
  listUnsettledTransactions: async () => ({ ok: true, transactions: gateway.filter(t => t.status !== 'settledSuccessfully') }),
  listSettledTransactions: async () => ({ ok: true, transactions: gateway.filter(t => t.status === 'settledSuccessfully') }),
});

const listener = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

try {
  const before = await fetch(`${baseUrl}/health/payments`);
  assert.equal(before.status, 200, 'no audit yet and no reviews open -> not red');

  const result = await runGatewayAudit({ reason: 'test' });
  assert.equal(result.error, undefined, JSON.stringify(result));
  const kinds = result.anomalies.map(a => `${a.kind}:${a.invoiceNumber}`).sort();
  assert.deepEqual(kinds, [
    `awaiting_staff_review:${inReview.ref}`,
    `charge_on_unconfirmed_booking:${cancelledCharged.ref}`,
    `charge_on_unconfirmed_booking:${pendingCharged.ref}`,
    'charge_without_booking:BNG-DOESNOTEXIST',
    `unrecorded_second_charge:${doubleCharged.ref}`,
  ].sort());
  assert.equal(result.critical.length, 4);
  assert.ok(await get("SELECT id FROM audit_log WHERE action = 'gateway_payment_audit'"));

  const red = await fetch(`${baseUrl}/health/payments`);
  const redBody = await red.json();
  assert.equal(red.status, 503, JSON.stringify(redBody));
  assert.equal(redBody.status, 'error');
  assert.equal(redBody.audit.criticalCount, 4);
  assert.ok(redBody.problems.some(p => /critical/.test(p)), JSON.stringify(redBody.problems));

  // Gateway unreachable: reported, not thrown; the endpoint says so.
  __setPaymentServicesForTesting({ listUnsettledTransactions: async () => ({ ok: false, error: 'E00001: down' }) });
  const failed = await runGatewayAudit({ reason: 'outage' });
  assert.match(failed.error, /down/);
  const stillRed = await fetch(`${baseUrl}/health/payments`);
  assert.equal(stillRed.status, 503);

  console.log('Gateway payment audit and payments health check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
