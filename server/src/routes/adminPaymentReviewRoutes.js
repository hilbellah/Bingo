// Admin "payments needing attention" panel.
//
// Lists every booking whose money arrived but could not be attached to a seat
// (payment_status = 'payment_review') plus second charges recorded against an
// already-paid booking, and lets staff resolve the common case in one click:
// when the seat is still free, "confirm" re-runs the paid transition so the
// booking completes exactly as if the payment had arrived on time.
//
// The gateway is never called from here except read-only verification, which
// is injected by index.js (confirmReviewedPayment) so the test seam applies.

import { all, get } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { formatCurrency } from '../utils/format.js';

function forbidViewer(req, res) {
  const role = req.adminUser?.role;
  if (role === 'viewer' || role === 'print_staff') {
    res.status(403).json({ error: 'forbidden', message: 'Your role cannot resolve payment reviews.' });
    return true;
  }
  return false;
}

async function loadReviewBookings() {
  const bookings = await all(`
    SELECT b.id, b.reference_number, b.payment_status, b.total_amount, b.transaction_id, b.auth_code,
           b.email, b.customer_first_name, b.customer_last_name, b.checkout_holder_id,
           b.created_at, b.payment_completed_at, b.payment_failure_reason,
           s.id AS session_id, s.date AS session_date, s.time AS session_time, s.event_title
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    WHERE b.payment_status = 'payment_review'
    ORDER BY b.created_at DESC
    LIMIT 100
  `);
  const nowIso = new Date().toISOString();
  const rows = [];
  for (const booking of bookings) {
    const seats = await all(`
      SELECT bi.first_name, bi.last_name, bi.reference_number AS ticket_reference,
             st.id AS seat_id, st.table_number, st.chair_number, st.status, st.held_by, st.held_until, st.is_disabled
      FROM booking_items bi
      JOIN seats st ON st.id = bi.seat_id
      WHERE bi.booking_id = ?
      ORDER BY bi.id
    `, [booking.id]);
    const seatStates = seats.map(seat => {
      const heldByCustomer = seat.status === 'held' && (!booking.checkout_holder_id || seat.held_by === booking.checkout_holder_id);
      const holdActive = seat.status === 'held' && (!seat.held_until || seat.held_until > nowIso);
      let state = 'free';
      if (seat.status === 'sold') state = 'sold_to_someone_else';
      else if (Number(seat.is_disabled) === 1) state = 'disabled';
      else if (seat.status === 'held' && !heldByCustomer && holdActive) state = 'held_by_someone_else';
      return {
        firstName: seat.first_name,
        lastName: seat.last_name,
        ticketReference: seat.ticket_reference,
        tableNumber: seat.table_number,
        chairNumber: seat.chair_number,
        seatStatus: seat.status,
        state,
      };
    });
    rows.push({
      id: booking.id,
      bookingReference: booking.reference_number,
      paymentStatus: booking.payment_status,
      amountCents: booking.total_amount,
      amountFormatted: formatCurrency(booking.total_amount),
      transactionId: booking.transaction_id,
      customerName: [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(' ').trim(),
      email: booking.email,
      sessionId: booking.session_id,
      sessionDate: booking.session_date,
      sessionTime: booking.session_time,
      eventTitle: booking.event_title,
      reason: booking.payment_failure_reason,
      createdAt: booking.created_at,
      reviewedAt: booking.payment_completed_at,
      seats: seatStates,
      // The one-click fix only applies when every seat can be claimed now.
      canConfirm: seatStates.length > 0 && seatStates.every(seat => seat.state === 'free'),
    });
  }
  return rows;
}

// Second charges on an already-paid booking. They live only in payment_events
// (the booking itself stays correctly 'paid'), so staff mark them resolved once
// the extra charge has been refunded.
async function loadDuplicateCharges() {
  const events = await all(`
    SELECT e.id, e.booking_id, e.event_type, e.raw_payload, e.created_at,
           b.reference_number, b.total_amount, b.transaction_id, b.email,
           b.customer_first_name, b.customer_last_name, b.payment_status,
           s.date AS session_date, s.time AS session_time, s.event_title
    FROM payment_events e
    JOIN bookings b ON b.id = e.booking_id
    JOIN sessions s ON s.id = b.session_id
    WHERE e.event_type IN ('duplicate_payment_requires_review', 'stale_payment_requires_review')
      AND NOT EXISTS (
        SELECT 1 FROM payment_events r
        WHERE r.booking_id = e.booking_id
          AND r.event_type = 'duplicate_payment_resolved'
          AND r.raw_payload LIKE '%' || e.id || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT 100
  `);
  return events.map(event => {
    let payload = {};
    try { payload = JSON.parse(event.raw_payload || '{}'); } catch { payload = {}; }
    return {
      id: event.id,
      bookingId: event.booking_id,
      bookingReference: event.reference_number,
      paymentStatus: event.payment_status,
      amountCents: event.total_amount,
      amountFormatted: formatCurrency(event.total_amount),
      duplicateTransactionId: payload.duplicateTransactionId || payload.strayTransactionId || null,
      originalTransactionId: payload.originalTransactionId || event.transaction_id || null,
      customerName: [event.customer_first_name, event.customer_last_name].filter(Boolean).join(' ').trim(),
      email: event.email,
      sessionDate: event.session_date,
      sessionTime: event.session_time,
      eventTitle: event.event_title,
      createdAt: event.created_at,
    };
  });
}

export function registerAdminPaymentReviewRoutes(app, { io, logAudit, logPaymentEvent, confirmReviewedPayment }) {
  app.get('/api/admin/payment-reviews', adminAuth, async (req, res) => {
    try {
      const [reviews, duplicates] = await Promise.all([loadReviewBookings(), loadDuplicateCharges()]);
      res.json({ reviews, duplicates });
    } catch (err) {
      console.error('GET /api/admin/payment-reviews failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/payment-reviews/:bookingId/confirm', adminAuth, async (req, res) => {
    if (forbidViewer(req, res)) return;
    try {
      const result = await confirmReviewedPayment({
        bookingId: req.params.bookingId,
        adminEmail: req.adminUser?.email || req.adminUser?.username || 'admin',
      });
      if (!result.ok) {
        const status = result.error === 'booking_not_found' ? 404 : 409;
        return res.status(status).json({ error: result.error, message: result.message || result.error, requiresReview: !!result.requiresReview });
      }
      io.to('admin:receipts').emit('booking:payment_review_resolved', { bookingId: req.params.bookingId });
      res.json({ success: true, referenceNumber: result.referenceNumber, reclaimedSeats: result.reclaimedSeats || 0 });
    } catch (err) {
      console.error('POST /api/admin/payment-reviews/:bookingId/confirm failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/payment-reviews/duplicates/:eventId/resolve', adminAuth, async (req, res) => {
    if (forbidViewer(req, res)) return;
    try {
      const event = await get(
        "SELECT id, booking_id FROM payment_events WHERE id = ? AND event_type IN ('duplicate_payment_requires_review', 'stale_payment_requires_review')",
        [req.params.eventId]
      );
      if (!event) return res.status(404).json({ error: 'not_found' });
      const note = String(req.body?.note || '').trim().slice(0, 500);
      await logPaymentEvent(event.booking_id, 'duplicate_payment_resolved', 'admin', {
        eventId: event.id,
        note,
        resolvedBy: req.adminUser?.email || req.adminUser?.username || 'admin',
      });
      await logAudit('duplicate_payment_resolved', 'booking', event.booking_id, { eventId: event.id, note });
      io.to('admin:receipts').emit('booking:payment_review_resolved', { bookingId: event.booking_id });
      res.json({ success: true });
    } catch (err) {
      console.error('POST /api/admin/payment-reviews/duplicates/:eventId/resolve failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
