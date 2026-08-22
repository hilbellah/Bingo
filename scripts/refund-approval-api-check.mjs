import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repoRoot, 'server/package.json'));
const bcrypt = require('bcryptjs');
const express = require('express');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-refund-approval-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = '';
process.env.ADMIN_PASSWORD = '';
process.env.POSTMARK_SERVER_TOKEN = '';
process.env.GMAIL_USER = '';
process.env.GMAIL_APP_PASSWORD = '';
process.env.RESEND_API_KEY = '';
process.env.REFUND_APPROVAL_EMAILS = '';
process.env.SUPER_ADMIN_EMAILS = '';
process.env.EMAIL_BCC = '';

const { migrate } = await import(pathToFileURL(path.join(repoRoot, 'server/src/migrate.js')));
const { getDb, get, run, saveDb } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
await migrate();
await getDb();

const password = 'refund-approval-test-password';
const hash = bcrypt.hashSync(password, 4);
await run("INSERT INTO admin_users (id, email, password_hash, display_name, is_active, is_super_user, role) VALUES ('requester', 'requester@example.com', ?, 'Requester', 1, 0, 'admin')", [hash]);
await run("INSERT INTO admin_users (id, email, password_hash, display_name, is_active, is_super_user, role) VALUES ('approver', 'approver@example.com', ?, 'Approver', 1, 1, 'super_user')", [hash]);

const sessionId = 'refund-approval-session';
const seatId = 'refund-approval-seat';
const bookingId = 'refund-approval-booking';
const itemId = 'refund-approval-item';
const packageRow = await get("SELECT id, price FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order LIMIT 1");
await run("INSERT INTO sessions (id, date, time, cutoff_time, is_available, session_type) VALUES (?, '2099-10-10', '18:30', '12:00', 1, 'regular_bingo')", [sessionId]);
await run("INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, 10, 2, 'sold')", [seatId, sessionId]);
await run("INSERT INTO bookings (id, session_id, reference_number, total_amount, payment_status, transaction_id, email) VALUES (?, ?, 'BNG-APPROVAL', 9400, 'paid', 'approval-transaction', 'customer@example.com')", [bookingId, sessionId]);
await run("INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number) VALUES (?, ?, 'Test', 'Customer', ?, ?, ?, 'BNG-APPROVAL-ITEM')", [itemId, bookingId, seatId, packageRow.id, packageRow.price]);
await saveDb();

const { registerAdminRefundApprovalRoutes } = await import(pathToFileURL(path.join(repoRoot, 'server/src/routes/adminRefundApprovalRoutes.js')));
const app = express();
app.use(express.json());
let refundCalls = 0;
let refundMode = 'success';
registerAdminRefundApprovalRoutes(app, {
  io: { to: () => ({ emit: () => {} }) },
  logAudit: async () => {},
  getBookingItemRefundAmount: async () => packageRow.price,
  markBookingItemRefunded: async () => ({ ok: true, releasedSeats: 1 }),
  markBookingRefunded: async ({ bookingId: id }) => {
    await run("UPDATE bookings SET payment_status = 'refunded' WHERE id = ?", [id]);
    await run("UPDATE booking_items SET refund_status = 'refunded' WHERE booking_id = ?", [id]);
    await run("UPDATE seats SET status = 'vacant' WHERE id = ?", [seatId]);
    return { ok: true, releasedSeats: 1 };
  },
  markBookingVoided: async () => ({ ok: true, releasedSeats: 1 }),
  paymentServices: {
    verifyTransaction: async () => ({ ok: true, status: 'settledSuccessfully', last4: '1111' }),
    refundTransaction: async ({ transId, amountCents }) => {
      refundCalls += 1;
      assert.equal(transId, 'approval-transaction');
      assert.equal(amountCents, 9400);
      if (refundMode === 'ambiguous') return { ok: false, error: 'no_response', ambiguous: true };
      return { ok: true, refundTransId: 'approved-refund-transaction' };
    },
    voidTransaction: async () => { throw new Error('void should not be called'); },
  },
});
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const base = `http://127.0.0.1:${listener.address().port}`;
const auth = email => `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
const post = (url, email, body = {}) => fetch(`${base}${url}`, {
  method: 'POST',
  headers: { Authorization: auth(email), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

try {
  const requestResponse = await post(`/api/admin/bookings/${bookingId}/refund`, 'requester@example.com', { reason: 'Customer requested a refund' });
  const requestBody = await requestResponse.json();
  assert.equal(requestResponse.status, 202);
  assert.equal(requestBody.approvalRequired, false);
  assert.equal(requestBody.readyToExecute, true);
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [bookingId])).payment_status, 'paid');
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'sold');

  const pending = await get('SELECT * FROM refund_requests WHERE id = ?', [requestBody.requestId]);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.requested_by, 'requester@example.com');
  assert.equal(Number(pending.amount_cents), 9400);

  const duplicate = await post(`/api/admin/bookings/${bookingId}/refund`, 'requester@example.com', { reason: 'Duplicate request' });
  assert.equal(duplicate.status, 409);
  const overlappingTicketRequest = await post(`/api/admin/booking-items/${itemId}/refund`, 'requester@example.com', { reason: 'Overlapping ticket request' });
  assert.equal(overlappingTicketRequest.status, 409);

  const listResponse = await fetch(`${base}/api/admin/refund-requests`, { headers: { Authorization: auth('approver@example.com') } });
  const requests = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].bookingReference, 'BNG-APPROVAL');

  const rejectResponse = await post(`/api/admin/refund-requests/${requestBody.requestId}/reject`, 'requester@example.com', { note: 'Cancelled before execution' });
  assert.equal(rejectResponse.status, 200);
  assert.equal((await get('SELECT status FROM refund_requests WHERE id = ?', [requestBody.requestId])).status, 'rejected');
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [bookingId])).payment_status, 'paid');
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'sold');
  assert.equal(refundCalls, 0);

  refundMode = 'ambiguous';
  const uncertainRequestResponse = await post(`/api/admin/bookings/${bookingId}/refund`, 'requester@example.com', { reason: 'Customer refund with lost gateway response' });
  const uncertainRequest = await uncertainRequestResponse.json();
  assert.equal(uncertainRequestResponse.status, 202);
  const uncertainApprovalResponse = await post(`/api/admin/refund-requests/${uncertainRequest.requestId}/approve`, 'requester@example.com');
  const uncertainApproval = await uncertainApprovalResponse.json();
  assert.equal(uncertainApprovalResponse.status, 502);
  assert.equal(uncertainApproval.status, 'reconciliation_required');
  assert.equal(uncertainApproval.retryAllowed, false);
  assert.equal((await get('SELECT status FROM refund_requests WHERE id = ?', [uncertainRequest.requestId])).status, 'reconciliation_required');
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [bookingId])).payment_status, 'paid');
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'sold');
  assert.equal(refundCalls, 1);

  const blockedRetry = await post(`/api/admin/refund-requests/${uncertainRequest.requestId}/approve`, 'requester@example.com');
  assert.equal(blockedRetry.status, 409);
  assert.equal(refundCalls, 1);

  // Simulate a staff reconciliation that confirmed no gateway refund occurred.
  await run("UPDATE refund_requests SET status = 'rejected' WHERE id = ?", [uncertainRequest.requestId]);
  refundMode = 'success';
  const secondRequestResponse = await post(`/api/admin/bookings/${bookingId}/refund`, 'requester@example.com', { reason: 'Approved customer refund' });
  const secondRequest = await secondRequestResponse.json();
  assert.equal(secondRequestResponse.status, 202);
  const approveResponse = await post(`/api/admin/refund-requests/${secondRequest.requestId}/approve`, 'requester@example.com', { note: 'Authorized by refunding admin' });
  const approveBody = await approveResponse.json();
  assert.equal(approveResponse.status, 200);
  assert.equal(approveBody.status, 'completed');
  assert.equal(refundCalls, 2);
  assert.equal((await get('SELECT status FROM refund_requests WHERE id = ?', [secondRequest.requestId])).status, 'completed');
  assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [bookingId])).payment_status, 'refunded');
  assert.equal((await get('SELECT status FROM seats WHERE id = ?', [seatId])).status, 'vacant');

  console.log('Direct admin refund authorization, retry safety, and reconciliation API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
