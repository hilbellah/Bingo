import { all, get, run, saveDb, withTransaction } from '../database.js';
import { adminAuth, requireSuperUser } from '../middleware/adminAuth.js';
import { refundTransaction, verifyTransaction, voidTransaction } from '../services/payments.js';
import { sendRefundApprovalRequestNotification } from '../services/email.js';
import { formatCurrency, generateRef } from '../utils/format.js';

function normalizeReason(value) {
  return String(value || '').trim().slice(0, 1000);
}

function isUniqueConflict(err) {
  return err?.code === '23505' || /unique constraint/i.test(String(err?.message || ''));
}

async function loadRequestRows(where = '', params = []) {
  return all(`
    SELECT rr.*, b.reference_number, b.payment_status, b.transaction_id, b.total_amount,
           b.customer_first_name, b.customer_last_name, b.email,
           s.date as session_date, s.time as session_time,
           bi.reference_number as ticket_reference, bi.first_name as ticket_first_name,
           bi.last_name as ticket_last_name, seats.table_number, seats.chair_number
    FROM refund_requests rr
    JOIN bookings b ON b.id = rr.booking_id
    JOIN sessions s ON s.id = b.session_id
    LEFT JOIN booking_items bi ON bi.id = rr.booking_item_id
    LEFT JOIN seats ON seats.id = bi.seat_id
    ${where}
    ORDER BY rr.requested_at DESC
  `, params);
}

function serializeRequest(row, viewerEmail = '') {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingItemId: row.booking_item_id,
    bookingReference: row.reference_number,
    ticketReference: row.ticket_reference,
    amountCents: Number(row.amount_cents || 0),
    amountFormatted: formatCurrency(row.amount_cents),
    reason: row.reason || '',
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note || '',
    failureReason: row.failure_reason || '',
    gatewayAction: row.gateway_action,
    gatewayTransactionId: row.gateway_transaction_id,
    paymentStatus: row.payment_status,
    sessionDate: row.session_date,
    sessionTime: row.session_time,
    tableNumber: row.table_number,
    chairNumber: row.chair_number,
    requesterIsViewer: String(row.requested_by || '').toLowerCase() === String(viewerEmail || '').toLowerCase(),
  };
}

export function registerAdminRefundApprovalRoutes(app, {
  io,
  logAudit,
  getBookingItemRefundAmount,
  markBookingItemRefunded,
  markBookingRefunded,
  markBookingVoided,
  paymentServices = {},
}) {
  const verifyPayment = paymentServices.verifyTransaction || verifyTransaction;
  const refundPayment = paymentServices.refundTransaction || refundTransaction;
  const voidPayment = paymentServices.voidTransaction || voidTransaction;
  app.get('/api/admin/refund-requests', adminAuth, async (req, res) => {
    try {
      const status = String(req.query.status || 'pending').trim();
      const rows = status === 'all'
        ? await loadRequestRows()
        : status === 'pending'
          ? await loadRequestRows("WHERE rr.status IN ('pending', 'processing', 'reconciliation_required')")
          : await loadRequestRows('WHERE rr.status = ?', [status]);
      res.json(rows.map(row => serializeRequest(row, req.adminUser.email)));
    } catch (err) {
      console.error('GET /api/admin/refund-requests failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  async function createRequest({ booking, item = null, reason, requestedBy }) {
    const scopeItemId = item?.id || null;
    const existing = await get(
      `SELECT id, status FROM refund_requests
       WHERE booking_id = ? AND status IN ('pending', 'processing', 'reconciliation_required')`,
      [booking.id]
    );
    if (existing) return { duplicate: true, requestId: existing.id };

    const amountCents = item ? await getBookingItemRefundAmount(item.id) : Number(booking.total_amount || 0);
    if (!amountCents || amountCents <= 0) return { error: 'Could not determine the refund amount.' };
    const request = {
      id: generateRef().replace(/^BNG-/, 'RFR-'),
      booking_id: booking.id,
      booking_item_id: scopeItemId,
      amount_cents: amountCents,
      reason,
      requested_by: requestedBy,
    };
    await run(
      `INSERT INTO refund_requests
       (id, booking_id, booking_item_id, amount_cents, reason, status, requested_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [request.id, request.booking_id, request.booking_item_id, request.amount_cents, request.reason, request.requested_by]
    );
    await saveDb();
    await logAudit('refund_approval_requested', item ? 'booking_item' : 'booking', item?.id || booking.id, {
      requestId: request.id,
      bookingId: booking.id,
      amountCents,
      requestedBy,
      reason,
    });
    io.to('admin:receipts').emit('refund_request:created', {
      requestId: request.id,
      bookingId: booking.id,
      bookingReference: booking.reference_number,
      amountCents,
    });
    const approvers = await all("SELECT email FROM admin_users WHERE is_active = 1 AND (is_super_user = 1 OR role = 'super_user')");
    const approvalEmails = approvers.map(row => row.email);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_USERNAME || '')) approvalEmails.push(process.env.ADMIN_USERNAME);
    setImmediate(() => sendRefundApprovalRequestNotification({ request, booking, item, recipients: approvalEmails }).catch(err => {
      console.error('[email] refund approval request notification failed:', err?.message || err);
    }));
    return { request };
  }

  app.post('/api/admin/bookings/:id/refund', adminAuth, async (req, res) => {
    try {
      const reason = normalizeReason(req.body?.reason);
      if (reason.length < 3) return res.status(400).json({ error: 'A refund reason is required.' });
      const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (!['paid', 'payment_review'].includes(booking.payment_status) || !booking.transaction_id) {
        return res.status(400).json({ error: `Booking status '${booking.payment_status}' is not eligible for a full refund request.` });
      }
      const created = await createRequest({ booking, reason, requestedBy: req.adminUser.email });
      if (created.error) return res.status(400).json({ error: created.error });
      if (created.duplicate) return res.status(409).json({ error: 'refund_request_pending', requestId: created.requestId });
      res.status(202).json({ ok: true, approvalRequired: true, requestId: created.request.id, message: 'Refund request submitted for super-user approval. No money has moved and no seat has been released.' });
    } catch (err) {
      console.error('POST /api/admin/bookings/:id/refund request failed:', err);
      if (isUniqueConflict(err)) return res.status(409).json({ error: 'refund_request_pending' });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/booking-items/:id/refund', adminAuth, async (req, res) => {
    try {
      const reason = normalizeReason(req.body?.reason);
      if (reason.length < 3) return res.status(400).json({ error: 'A refund reason is required.' });
      const item = await get(`SELECT bi.*, b.reference_number as booking_reference, b.payment_status,
        b.transaction_id, b.total_amount, b.id as booking_id
        FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id WHERE bi.id = ?`, [req.params.id]);
      if (!item) return res.status(404).json({ error: 'Ticket not found' });
      if (item.refund_status === 'refunded') return res.status(400).json({ error: 'This ticket has already been refunded.' });
      if (!['paid', 'partially_refunded'].includes(item.payment_status) || !item.transaction_id) {
        return res.status(400).json({ error: `Ticket booking status '${item.payment_status}' is not eligible for a refund request.` });
      }
      const booking = { id: item.booking_id, reference_number: item.booking_reference, total_amount: item.total_amount };
      const created = await createRequest({ booking, item, reason, requestedBy: req.adminUser.email });
      if (created.error) return res.status(400).json({ error: created.error });
      if (created.duplicate) return res.status(409).json({ error: 'refund_request_pending', requestId: created.requestId });
      res.status(202).json({ ok: true, approvalRequired: true, requestId: created.request.id, message: 'Ticket refund request submitted for super-user approval. No money has moved and the seat remains assigned.' });
    } catch (err) {
      console.error('POST /api/admin/booking-items/:id/refund request failed:', err);
      if (isUniqueConflict(err)) return res.status(409).json({ error: 'refund_request_pending' });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/refund-requests/:id/reject', adminAuth, requireSuperUser, async (req, res) => {
    try {
      const note = normalizeReason(req.body?.note);
      const result = await withTransaction(async tx => {
        const request = await tx.getForUpdate('SELECT * FROM refund_requests WHERE id = ?', [req.params.id]);
        if (!request) return { status: 404, error: 'Refund request not found' };
        if (request.status !== 'pending') return { status: 409, error: `Request is already '${request.status}'.` };
        if (request.requested_by.toLowerCase() === req.adminUser.email.toLowerCase()) return { status: 403, error: 'A different super user must review this request.' };
        await tx.run("UPDATE refund_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'pending'", [req.adminUser.email, new Date().toISOString(), note, request.id]);
        return { status: 200, request };
      });
      if (result.status !== 200) return res.status(result.status).json({ error: result.error });
      await logAudit('refund_approval_rejected', result.request.booking_item_id ? 'booking_item' : 'booking', result.request.booking_item_id || result.request.booking_id, { requestId: result.request.id, reviewedBy: req.adminUser.email, note });
      io.to('admin:receipts').emit('refund_request:updated', { requestId: result.request.id, status: 'rejected' });
      res.json({ ok: true, status: 'rejected' });
    } catch (err) {
      console.error('POST /api/admin/refund-requests/:id/reject failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/refund-requests/:id/approve', adminAuth, requireSuperUser, async (req, res) => {
    let claimed = null;
    let confirmedGateway = null;
    try {
      const claim = await withTransaction(async tx => {
        const request = await tx.getForUpdate('SELECT * FROM refund_requests WHERE id = ?', [req.params.id]);
        if (!request) return { status: 404, error: 'Refund request not found' };
        if (request.status !== 'pending') return { status: 409, error: `Request is already '${request.status}'.` };
        if (request.requested_by.toLowerCase() === req.adminUser.email.toLowerCase()) return { status: 403, error: 'A different super user must approve this request.' };
        const updated = await tx.run("UPDATE refund_requests SET status = 'processing', reviewed_by = ?, reviewed_at = ?, review_note = ?, failure_reason = NULL WHERE id = ? AND status = 'pending'", [req.adminUser.email, new Date().toISOString(), normalizeReason(req.body?.note), request.id]);
        return updated.changes === 1 ? { status: 200, request } : { status: 409, error: 'Request state changed. Refresh and try again.' };
      });
      if (claim.status !== 200) return res.status(claim.status).json({ error: claim.error });
      claimed = claim.request;

      const booking = await get('SELECT * FROM bookings WHERE id = ?', [claimed.booking_id]);
      if (!booking?.transaction_id) throw new Error('Booking transaction is unavailable.');
      const item = claimed.booking_item_id ? await get('SELECT * FROM booking_items WHERE id = ?', [claimed.booking_item_id]) : null;
      if (claimed.booking_item_id && (!item || item.refund_status === 'refunded')) throw new Error('Ticket is unavailable or already refunded.');

      const verify = await verifyPayment(booking.transaction_id);
      if (!verify.ok) throw new Error(`Could not verify transaction state: ${verify.error}`);
      const txStatus = String(verify.status || '');
      let action;
      let gateway;
      if (['capturedPendingSettlement', 'authorizedPendingCapture'].includes(txStatus)) {
        if (item) {
          const active = await get("SELECT COUNT(*) as count FROM booking_items WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'", [booking.id]);
          if (Number(active?.count || 0) > 1) throw new Error('Authorize.Net cannot partially void an unsettled multi-ticket payment. Wait for settlement or reject this request.');
        }
        action = 'void';
        gateway = await voidPayment(booking.transaction_id);
      } else if (['settledSuccessfully', 'settlementError'].includes(txStatus)) {
        if (!verify.last4) throw new Error('Could not determine card last 4 for the refund.');
        action = 'refund';
        gateway = await refundPayment({ transId: booking.transaction_id, amountCents: Number(claimed.amount_cents), last4: verify.last4 });
      } else {
        throw new Error(`Transaction status '${txStatus}' cannot be reversed.`);
      }
      if (!gateway.ok) {
        if (gateway.ambiguous) confirmedGateway = { action, gatewayId: null };
        throw new Error(gateway.ambiguous
          ? `${action} outcome is unknown: ${gateway.error}. Verify Authorize.Net before taking any further action.`
          : `${action} failed: ${gateway.error}`);
      }
      const gatewayId = gateway.refundTransId || gateway.voidTransId;
      confirmedGateway = { action, gatewayId };
      // A void reverses the ENTIRE unsettled charge (item + service fee +
      // HST), not just the requested item amount — record what actually
      // moved so the books reconcile with Authorize.Net.
      const reversedAmountCents = action === 'void'
        ? Number(booking.total_amount || claimed.amount_cents)
        : Number(claimed.amount_cents);
      const markResult = item
        ? await markBookingItemRefunded({ bookingId: booking.id, bookingItemId: item.id, transactionId: booking.transaction_id, refundTransactionId: gatewayId, amountCents: reversedAmountCents, action, source: 'approved_refund_request' })
        : action === 'void'
          ? await markBookingVoided({ bookingId: booking.id, transactionId: booking.transaction_id, voidTransactionId: gatewayId, source: 'approved_refund_request' })
          : await markBookingRefunded({ bookingId: booking.id, transactionId: booking.transaction_id, refundTransactionId: gatewayId, source: 'approved_refund_request' });
      if (!markResult?.ok) throw new Error(`Payment was reversed but the booking update failed: ${markResult?.error || 'unknown error'}`);

      await run("UPDATE refund_requests SET status = 'completed', gateway_action = ?, gateway_transaction_id = ?, amount_cents = ?, failure_reason = NULL WHERE id = ? AND status = 'processing'", [action, gatewayId, reversedAmountCents, claimed.id]);
      await saveDb();
      await logAudit('refund_approval_completed', item ? 'booking_item' : 'booking', item?.id || booking.id, { requestId: claimed.id, approvedBy: req.adminUser.email, action, gatewayTransactionId: gatewayId });
      io.to('admin:receipts').emit('refund_request:updated', { requestId: claimed.id, status: 'completed' });
      res.json({ ok: true, status: 'completed', action, refundTransId: gatewayId, seatsReleased: markResult.releasedSeats || 0 });
    } catch (err) {
      if (claimed) {
        const failure = String(err?.message || err).slice(0, 500);
        if (confirmedGateway) {
          await run("UPDATE refund_requests SET status = 'reconciliation_required', gateway_action = ?, gateway_transaction_id = ?, failure_reason = ? WHERE id = ? AND status = 'processing'", [confirmedGateway.action, confirmedGateway.gatewayId, failure, claimed.id]).catch(() => {});
        } else {
          await run("UPDATE refund_requests SET status = 'pending', failure_reason = ? WHERE id = ? AND status = 'processing'", [failure, claimed.id]).catch(() => {});
        }
        await saveDb().catch(() => {});
      }
      console.error('POST /api/admin/refund-requests/:id/approve failed:', err?.message || err);
      res.status(502).json({
        error: err?.message || 'Refund approval failed. No confirmed booking update was made.',
        status: confirmedGateway ? 'reconciliation_required' : 'pending',
        retryAllowed: !confirmedGateway,
      });
    }
  });
}
