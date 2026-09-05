// Booking payment state machine.
//
// Every transition of a booking's payment_status and of its seats' status
// lives here: pending -> paid (markBookingPaid, with late-payment seat
// recovery and quarantine), failed, cancelled, refunded (full and per
// ticket), voided, plus the reversal reconciler and the customer emails those
// transitions send. Nothing else in the codebase may change payment_status or
// seat status directly.
//
// Moved verbatim out of server/src/index.js on 2026-09-05 (Phase 3 of the
// delivery-process hardening). The factory only supplies the handful of
// values the code previously reached from index.js's module scope.

import { all, get, run, saveDb, withTransaction } from '../database.js';
import { logger } from '../logger.js';
import { formatCurrency } from '../utils/format.js';
import { logPaymentEvent } from './paymentEvents.js';
import { holdExpiresAt, shortenBookingSeatHolds } from './holds.js';
import { getPhdInventoryForSession, getPhdUsageBySession } from './phdInventory.js';
import { upsertCustomerFromBooking } from './customers.js';
import { normalizeSessionType } from './sessionPackages.js';
import { sendBookingConfirmation, sendBookingRefundNotification, sendPaymentReviewAlert } from './email.js';
import { verifyTransaction } from './payments.js';

/**
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io        live seat / admin events
 * @param {Function} deps.logAudit                     index.js audit_log writer
 * @param {number} deps.holdMinutes                    checkout hold window
 * @param {number} deps.paymentFailureHoldMinutes      shortened hold after a failed payment
 */
export function createBookingPaymentService({ io, logAudit, holdMinutes, paymentFailureHoldMinutes }) {
  const HOLD_MINUTES = holdMinutes;
  const PAYMENT_FAILURE_HOLD_MINUTES = paymentFailureHoldMinutes;
  // Idempotently transition a booking from 'pending' to 'paid'. Performs the
  // side effects that used to live inline in POST /api/bookings:
  //   - flip booked seats from 'held' to 'sold' + emit seat:sold
  //   - update bookings row with transaction_id, auth_code, payment_completed_at
  //   - emit receipt data to admin auto-print room
  //   - emit PHD inventory update if booking had PHD addons
  //   - log payment_event 'approved' + audit_log 'booking_paid'
  //   - fire confirmation email (setImmediate, never blocks caller)
  //
  // Returns { ok, alreadyPaid? }. Safe to call multiple times — second+ calls
  // short-circuit. This is what makes /payment/return and the webhook safe to
  // both fire for the same booking.
  async function quarantineRejectedApprovedPayment({ booking, transactionId, authCode, rejection, verifiedTransaction, paymentServices = null }) {
    const verifyPayment = paymentServices?.verifyTransaction || verifyTransaction;
    const verify = verifiedTransaction?.ok ? verifiedTransaction : await verifyPayment(transactionId);
    const txStatus = String(verify?.status || '');
    const now = new Date().toISOString();
    await run(
      `UPDATE bookings SET payment_status = 'payment_review', transaction_id = ?, auth_code = ?,
         payment_completed_at = ?, payment_failure_reason = ? WHERE id = ?`,
      [transactionId, authCode || verify?.authCode || null, now, `late_payment_${rejection}: manual_void_or_refund_required (${txStatus || verify?.error || 'status_unknown'})`.slice(0, 500), booking.id]
    );
    await saveDb();
    await logPaymentEvent(booking.id, 'late_payment_requires_review', 'automatic_payment_safety', {
      transactionId,
      rejection,
      priorStatus: booking.payment_status,
      transactionStatus: txStatus || null,
      error: verify?.error || null,
    });
    await logAudit('late_payment_requires_review', 'booking', booking.id, {
      referenceNumber: booking.reference_number,
      transactionId,
      rejection,
      priorStatus: booking.payment_status,
      seatReleased: false,
    });
    io.to('admin:receipts').emit('booking:payment_review', {
      bookingId: booking.id,
      referenceNumber: booking.reference_number,
      transactionId,
      rejection,
    });
    notifyPaymentReview({ bookingId: booking.id, rejection, transactionId });
    return { ok: false, paymentRejected: true, requiresReview: true, rejection };
  }

  // Super users get an email for every quarantined or duplicate payment. Until
  // the 2026-09-04 incident the only signal was a socket event nobody rendered,
  // and customers found out before staff did.
  async function getSuperUserEmails() {
    try {
      const rows = await all(
        "SELECT email FROM admin_users WHERE is_active = 1 AND (is_super_user = 1 OR role = 'super_user')"
      );
      return rows.map(row => String(row.email || '').trim().toLowerCase()).filter(email => email.includes('@'));
    } catch (err) {
      console.error('[payments] could not load super user emails:', err?.message || err);
      return [];
    }
  }

  function notifyPaymentReview({ bookingId, rejection, transactionId, kind = 'payment_review' }) {
    setImmediate(async () => {
      try {
        const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (!booking) return;
        const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
        const seats = await all(
          `SELECT bi.first_name, bi.last_name, s.table_number, s.chair_number, s.status
           FROM booking_items bi JOIN seats s ON s.id = bi.seat_id
           WHERE bi.booking_id = ? ORDER BY bi.id`,
          [bookingId]
        );
        const recipients = await getSuperUserEmails();
        const result = await sendPaymentReviewAlert({ booking, session, seats, rejection, transactionId, kind, recipients });
        await logPaymentEvent(bookingId, 'review_alert_email', 'server', {
          kind, rejection, transactionId, ok: !!result?.ok, error: result?.error || null, recipients: recipients.length,
        });
      } catch (err) {
        console.error('[payments] payment review alert failed:', err?.message || err);
      }
    });
  }

  async function markBookingPaid({ bookingId, transactionId = null, authCode = null, source = 'instant', verifiedTransaction = null, paymentServices = null }) {
    const completedAt = new Date().toISOString();
    const claim = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (booking.payment_status === 'paid') {
        if (!transactionId || !booking.transaction_id || booking.transaction_id === transactionId) {
          return { ok: true, alreadyPaid: true, booking };
        }
        return { ok: false, rejection: 'booking_already_paid_by_another_transaction', booking };
      }
      if (['refunded', 'voided', 'partially_refunded'].includes(booking.payment_status) && booking.transaction_id === transactionId) {
        // Idempotent echo of the transaction that already paid this booking —
        // its current (possibly partially refunded) state must stand.
        return { ok: false, alreadyReversed: true, booking };
      }
      if (booking.payment_status === 'payment_review' && booking.transaction_id === transactionId) {
        return { ok: false, requiresReview: true, booking };
      }
      if (['refunded', 'voided', 'partially_refunded', 'payment_review'].includes(booking.payment_status)
        && transactionId && booking.transaction_id && booking.transaction_id !== transactionId) {
        // A different charge arriving after the booking reached a completed
        // financial state must never overwrite that state or its original
        // transaction id — surface the stray charge for manual review instead.
        return { ok: false, rejection: 'stale_payment_after_completed_state', preserveBookingState: true, booking };
      }

      const items = await tx.all('SELECT * FROM booking_items WHERE booking_id = ? ORDER BY seat_id', [bookingId]);
      if (items.length === 0) return { ok: false, rejection: 'booking_has_no_seats', booking };
      const seatIds = [...new Set(items.map(item => item.seat_id))].sort();
      const placeholders = seatIds.map(() => '?').join(',');
      const seats = await tx.allForUpdate(`SELECT * FROM seats WHERE id IN (${placeholders}) ORDER BY id`, seatIds);

      const conflicts = await tx.all(
        `SELECT DISTINCT b.id, b.reference_number, bi.seat_id
         FROM booking_items bi
         JOIN bookings b ON b.id = bi.booking_id
         WHERE bi.seat_id IN (${placeholders})
           AND b.id != ?
           AND b.payment_status IN ('paid', 'partially_refunded')
           AND COALESCE(bi.refund_status, 'active') != 'refunded'`,
        [...seatIds, bookingId]
      );

      // Seat ownership at the moment the payment is applied. A payment can
      // arrive after the 20-minute hold lapsed (2026-09-04: gateway webhooks an
      // hour late). If the seat is still free — vacant, or a lapsed hold the
      // sweeper has not cleared yet — the paying customer keeps it. Only a seat
      // that someone else is actively holding or has bought is a real conflict.
      const reclaimedSeatIds = [];
      let seatRejection = null;
      if (seats.length !== seatIds.length) {
        seatRejection = 'seat_hold_expired_or_released';
      } else {
        for (const seat of seats) {
          if (seat.status === 'sold') { seatRejection = 'seat_hold_expired_or_released'; break; }
          if (Number(seat.is_disabled) === 1) { seatRejection = 'seat_disabled'; break; }
          const heldByThisCustomer = seat.status === 'held'
            && (!booking.checkout_holder_id || seat.held_by === booking.checkout_holder_id);
          if (heldByThisCustomer) continue;
          const holdActive = seat.status === 'held' && (!seat.held_until || seat.held_until > completedAt);
          if (holdActive) { seatRejection = 'seat_held_by_another_customer'; break; }
          reclaimedSeatIds.push(seat.id);
        }
      }

      let rejection = null;
      if (booking.payment_status !== 'pending') rejection = `booking_status_${booking.payment_status}`;
      // The gateway-verified amount must match what this booking currently
      // charges. A stale hosted-payment page can complete at an outdated total
      // after the reusable-checkout path rebuilt the booking's line items.
      else if (verifiedTransaction?.ok
        && Number.isFinite(Number(verifiedTransaction.amountCents))
        && Number(verifiedTransaction.amountCents) !== Number(booking.total_amount)) rejection = 'payment_amount_mismatch';
      else if (conflicts.length > 0) rejection = 'seat_owned_by_another_paid_booking';
      else if (seatRejection) rejection = seatRejection;

      if (rejection) {
        if (transactionId) {
          await tx.run(
            `UPDATE bookings SET payment_status = 'payment_review', transaction_id = ?, auth_code = ?,
               payment_completed_at = ?, payment_failure_reason = ? WHERE id = ?`,
            [transactionId, authCode || verifiedTransaction?.authCode || null, completedAt, `late_payment_${rejection}`, bookingId]
          );
        }
        return { ok: false, rejection, booking, conflicts };
      }

      const updated = await tx.run(
        `UPDATE bookings SET payment_status = 'paid', transaction_id = ?, auth_code = ?,
           payment_completed_at = ?, payment_failure_reason = NULL
         WHERE id = ? AND payment_status = 'pending'`,
        [transactionId, authCode, completedAt, bookingId]
      );
      if (updated.changes !== 1) return { ok: false, rejection: 'payment_state_changed', booking };
      for (const item of items) {
        await tx.run(`UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?`, [item.seat_id]);
      }
      return { ok: true, booking, items, reclaimedSeatIds };
    });

    if (!claim.ok) {
      if (claim.alreadyReversed || claim.requiresReview) return claim;
      if (claim.preserveBookingState) {
        await logPaymentEvent(bookingId, 'stale_payment_requires_review', 'automatic_payment_safety', {
          strayTransactionId: transactionId,
          originalTransactionId: claim.booking.transaction_id,
          bookingStatus: claim.booking.payment_status,
        });
        await logAudit('stale_payment_requires_review', 'booking', bookingId, {
          referenceNumber: claim.booking.reference_number,
          strayTransactionId: transactionId,
          originalTransactionId: claim.booking.transaction_id,
          bookingStatus: claim.booking.payment_status,
        });
        io.to('admin:receipts').emit('booking:payment_review', {
          bookingId,
          referenceNumber: claim.booking.reference_number,
          transactionId,
          rejection: claim.rejection,
        });
        notifyPaymentReview({ bookingId, rejection: claim.rejection, transactionId, kind: 'duplicate_payment' });
        return { ok: false, paymentRejected: true, requiresReview: true, rejection: claim.rejection };
      }
      if (claim.rejection === 'booking_already_paid_by_another_transaction') {
        // The booking is legitimately paid by its original transaction. Do NOT
        // demote it to payment_review or overwrite transaction_id — that lost
        // the real payment's id and let the refund flow release paid seats.
        // Surface the duplicate charge for a manual gateway-side refund instead.
        await logPaymentEvent(bookingId, 'duplicate_payment_requires_review', 'automatic_payment_safety', {
          duplicateTransactionId: transactionId,
          originalTransactionId: claim.booking.transaction_id,
        });
        await logAudit('duplicate_payment_requires_review', 'booking', bookingId, {
          referenceNumber: claim.booking.reference_number,
          duplicateTransactionId: transactionId,
          originalTransactionId: claim.booking.transaction_id,
        });
        io.to('admin:receipts').emit('booking:payment_review', {
          bookingId,
          referenceNumber: claim.booking.reference_number,
          transactionId,
          rejection: claim.rejection,
        });
        notifyPaymentReview({ bookingId, rejection: claim.rejection, transactionId, kind: 'duplicate_payment' });
        return { ok: false, paymentRejected: true, requiresReview: true, rejection: claim.rejection };
      }
      if (transactionId && claim.booking) {
        return quarantineRejectedApprovedPayment({
          booking: claim.booking,
          transactionId,
          authCode,
          rejection: claim.rejection || claim.error || 'payment_rejected',
          verifiedTransaction,
          paymentServices,
        });
      }
      console.error(`[bookings] markBookingPaid rejected booking=${bookingId}: ${claim.rejection || claim.error}`);
      return claim;
    }
    if (claim.alreadyPaid) {
      console.log(`[bookings] markBookingPaid: ${bookingId} already paid, idempotent skip`);
      return { ok: true, alreadyPaid: true };
    }

    const booking = claim.booking;
    const items = claim.items;
    const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);

    await upsertCustomerFromBooking({
      ...booking,
      payment_status: 'paid',
      transaction_id: transactionId,
      auth_code: authCode,
      payment_completed_at: new Date().toISOString(),
    });

    // The transaction above atomically claimed the seats. Emit per-seat updates.
    for (const it of items) {
      io.to(`session:${booking.session_id}`).emit('seat:sold', { seatId: it.seat_id, sessionId: booking.session_id });
    }

    // Build receipt data and emit to admin auto-print room
    const receiptItems = await all(`
      SELECT bi.id, bi.first_name, bi.last_name, bi.price, bi.reference_number,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name,
             COALESCE(p.price, sp.price) as package_price
      FROM booking_items bi
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      WHERE bi.booking_id = ?
      ORDER BY bi.id
    `, [bookingId]);
    const receiptAddons = await all(`
      SELECT ba.booking_item_id, ba.quantity, ba.price,
             COALESCE(p.name, sp.name) as package_name
      FROM booking_addons ba
      LEFT JOIN packages p ON p.id = ba.package_id
      LEFT JOIN session_packages sp ON sp.id = ba.package_id
      JOIN booking_items bi ON bi.id = ba.booking_item_id
      WHERE bi.booking_id = ?
    `, [bookingId]);
    const sessionType = normalizeSessionType(session?.session_type, session?.is_special_event);
    const notificationType = sessionType === 'event'
      ? 'live_event_ticket'
      : sessionType === 'special_bingo'
        ? 'special_bingo_ticket'
        : 'regular_bingo_receipt';
    const notificationLabel = sessionType === 'event'
      ? 'Live Event Ticket'
      : sessionType === 'special_bingo'
        ? 'Special Bingo Ticket'
        : 'Regular Bingo Receipt';
    io.to('admin:receipts').emit('booking:new', {
      bookingId: booking.id,
      referenceNumber: booking.reference_number,
      sessionDate: session?.date,
      sessionTime: session?.time,
      sessionTitle: session?.event_title || null,
      eventTitle: session?.event_title || null,
      sessionType,
      isSpecialEvent: sessionType !== 'regular_bingo',
      notificationType,
      notificationLabel,
      receiptTitle: notificationLabel.toUpperCase(),
      paymentStatus: 'paid',
      totalAmount: booking.total_amount,
      totalFormatted: formatCurrency(booking.total_amount),
      createdAt: new Date().toISOString(),
      items: receiptItems.map(item => ({
        firstName: item.first_name,
        lastName: item.last_name,
        tableNumber: item.table_number,
        chairNumber: item.chair_number,
        referenceNumber: item.reference_number,
        packageName: item.package_name,
        packagePrice: item.package_price,
        packagePriceFormatted: formatCurrency(item.package_price),
        addons: receiptAddons
          .filter(a => a.booking_item_id === item.id)
          .map(a => ({ packageName: a.package_name, quantity: a.quantity, price: a.price, priceFormatted: formatCurrency(a.price) }))
      }))
    });

    // PHD inventory update emit — included PHD packages and PHD add-ons both count.
    const phdInBooking = await get(`
      SELECT
        COALESCE((
          SELECT COUNT(*)
          FROM booking_items bi
          WHERE bi.booking_id = ?
            AND (
              bi.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
              OR bi.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
            )
        ), 0)
        +
        COALESCE((
          SELECT SUM(ba.quantity)
          FROM booking_addons ba
          JOIN booking_items bi ON bi.id = ba.booking_item_id
          WHERE bi.booking_id = ?
            AND (
              ba.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
              OR ba.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
            )
        ), 0) as cnt
    `, [bookingId, bookingId]);
    if (phdInBooking && phdInBooking.cnt > 0) {
      const phdInventory = await getPhdInventoryForSession(booking.session_id);
      io.to('admin:receipts').emit('phd:updated', {
        ...phdInventory,
        perSession: await getPhdUsageBySession(),
      });
    }

    // Flush to disk — critical write
    await saveDb();

    await logPaymentEvent(bookingId, 'approved', source, { transactionId, authCode });
    if (claim.reclaimedSeatIds?.length) {
      // The hold had lapsed but nobody else had taken the seat. Record it so a
      // late gateway signal is visible in the audit trail instead of silent.
      await logPaymentEvent(bookingId, 'late_payment_seat_reclaimed', source, {
        transactionId,
        seatIds: claim.reclaimedSeatIds,
      });
      await logAudit('late_payment_seat_reclaimed', 'booking', bookingId, {
        referenceNumber: booking.reference_number,
        transactionId,
        seatIds: claim.reclaimedSeatIds,
        source,
      });
      console.warn(`[bookings] late payment for ${booking.reference_number} reclaimed ${claim.reclaimedSeatIds.length} lapsed seat(s) (source=${source})`);
    }
    await logAudit('booking_paid', 'booking', bookingId, {
      referenceNumber: booking.reference_number,
      sessionId: booking.session_id,
      totalAmount: booking.total_amount,
      transactionId,
      authCode,
      source
    });

    // Fire confirmation email asynchronously so we don't block the caller.
    setImmediate(() => sendBookingConfirmationEmail(bookingId).catch(err => {
      console.error('[email] unexpected error:', err);
    }));

    return { ok: true, reclaimedSeats: claim.reclaimedSeatIds?.length || 0 };
  }

  // Idempotently mark a 'pending' booking as 'failed' (decline / error path).
  // Failed payment seats stay held only briefly so customers/admins see the table
  // open again without waiting for the full checkout hold window.
  async function markBookingFailed({ bookingId, reason, source = 'server' }) {
    const failureReason = String(reason || 'unknown').slice(0, 500);
    const transition = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT id, payment_status, transaction_id FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (['paid', 'partially_refunded', 'payment_review'].includes(booking.payment_status) || booking.transaction_id) {
        return { ok: false, error: 'payment_already_recorded' };
      }
      if (booking.payment_status === 'failed') return { ok: true, alreadyFailed: true };
      if (booking.payment_status !== 'pending') return { ok: false, error: 'not_pending' };
      const updated = await tx.run(
        `UPDATE bookings SET payment_status = 'failed', payment_failure_reason = ?
         WHERE id = ? AND payment_status = 'pending' AND transaction_id IS NULL`,
        [failureReason, bookingId]
      );
      return updated.changes === 1 ? { ok: true } : { ok: false, error: 'payment_state_changed' };
    });
    if (!transition.ok || transition.alreadyFailed) return transition;

    // Shorten the post-payment-error hold to the go-live operational window.
    const holdShorten = await shortenBookingSeatHolds({ bookingId, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
    await saveDb();

    await logPaymentEvent(bookingId, 'declined', source, {
      reason,
      heldSeatsReleaseAt: holdShorten.releaseAt,
      heldSeatsShortened: holdShorten.changedSeats,
    });
    return { ok: true };
  }

  // Idempotently mark a 'pending' booking as 'cancelled' (customer clicked Cancel
  // on the Authorize.Net hosted page). Cancelled payment seats use the same short
  // release window as failed payments.
  async function markBookingCancelled({ bookingId, source = 'customer' }) {
    const transition = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT id, payment_status, transaction_id FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (['paid', 'partially_refunded', 'payment_review'].includes(booking.payment_status) || booking.transaction_id) {
        return { ok: false, error: 'refund_required' };
      }
      if (booking.payment_status === 'cancelled') return { ok: true, alreadyCancelled: true };
      if (booking.payment_status !== 'pending') return { ok: false, error: 'not_pending' };
      const updated = await tx.run(
        `UPDATE bookings SET payment_status = 'cancelled' WHERE id = ? AND payment_status = 'pending' AND transaction_id IS NULL`,
        [bookingId]
      );
      return updated.changes === 1 ? { ok: true } : { ok: false, error: 'payment_state_changed' };
    });
    if (!transition.ok || transition.alreadyCancelled) return transition;

    // Treat payment cancellations like payment failures for seat availability.
    const holdShorten = await shortenBookingSeatHolds({ bookingId, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
    await saveDb();

    await logPaymentEvent(bookingId, 'cancelled', source, {
      heldSeatsReleaseAt: holdShorten.releaseAt,
      heldSeatsShortened: holdShorten.changedSeats,
    });
    return { ok: true };
  }

  async function cancelPendingBookingForEdit({ bookingId, source = 'customer_edit' }) {
    const holdUntil = holdExpiresAt(HOLD_MINUTES);
    const transition = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT id, payment_status, transaction_id FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (['paid', 'partially_refunded', 'payment_review'].includes(booking.payment_status) || booking.transaction_id) {
        return { ok: false, error: 'refund_required' };
      }
      if (booking.payment_status === 'cancelled') return { ok: true, alreadyCancelled: true };
      if (booking.payment_status !== 'pending') return { ok: false, error: 'not_pending' };

      const items = await tx.all('SELECT seat_id FROM booking_items WHERE booking_id = ? ORDER BY seat_id', [bookingId]);
      if (items.length > 0) {
        const placeholders = items.map(() => '?').join(',');
        await tx.allForUpdate(`SELECT id FROM seats WHERE id IN (${placeholders}) ORDER BY id`, items.map(item => item.seat_id));
      }
      const updated = await tx.run(
        `UPDATE bookings SET payment_status = 'cancelled' WHERE id = ? AND payment_status = 'pending' AND transaction_id IS NULL`,
        [bookingId]
      );
      if (updated.changes !== 1) return { ok: false, error: 'payment_state_changed' };
      for (const item of items) {
        await tx.run(`UPDATE seats SET held_until = ? WHERE id = ? AND status = 'held'`, [holdUntil, item.seat_id]);
      }
      return { ok: true, items };
    });
    if (!transition.ok || transition.alreadyCancelled) return transition;

    await saveDb();

    await logPaymentEvent(bookingId, 'cancelled_for_edit', source, {
      heldSeatsRetained: transition.items.length,
      heldSeatsReleaseAt: holdUntil,
    });

    return { ok: true, heldUntil: holdUntil };
  }

  async function releaseBookingSeatsTx(tx, { bookingId, items }) {
    let releasedSeats = 0;
    for (const it of items) {
      const result = await tx.run(
        `UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM booking_items active_item
             JOIN bookings active_booking ON active_booking.id = active_item.booking_id
             WHERE active_item.seat_id = seats.id
               AND active_booking.id != ?
               AND active_booking.payment_status IN ('paid', 'partially_refunded')
               AND COALESCE(active_item.refund_status, 'active') != 'refunded'
           )`,
        [it.seat_id, bookingId]
      );
      if (result.changes > 0) releasedSeats += 1;
    }
    return releasedSeats;
  }

  async function reconcileReversedBookingSeats() {
    const seatsToRelease = await all(`
      SELECT DISTINCT s.id, s.session_id
      FROM seats s
      JOIN booking_items reversed_item ON reversed_item.seat_id = s.id
      JOIN bookings reversed_booking ON reversed_booking.id = reversed_item.booking_id
      WHERE s.status = 'sold'
        AND reversed_booking.payment_status IN ('refunded', 'voided')
        AND NOT EXISTS (
          SELECT 1
          FROM booking_items paid_item
          JOIN bookings paid_booking ON paid_booking.id = paid_item.booking_id
          WHERE paid_item.seat_id = s.id
            AND paid_booking.payment_status IN ('paid', 'partially_refunded')
            AND COALESCE(paid_item.refund_status, 'active') != 'refunded'
        )
    `);

    for (const seat of seatsToRelease) {
      await run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [seat.id]);
    }

    if (seatsToRelease.length > 0) {
      await saveDb();
      logger.info('Released seats from reversed bookings', { count: seatsToRelease.length });
    }

    return seatsToRelease.length;
  }

  function sendRefundNotificationAsync({ bookingId, action, refundTransactionId, bookingItemId = null }) {
    setImmediate(async () => {
      try {
        const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (!booking) return;
        const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
        const item = bookingItemId
          ? await get(`
              SELECT id, first_name, last_name, reference_number, price, refund_amount, refund_action
              FROM booking_items
              WHERE id = ? AND booking_id = ?
            `, [bookingItemId, bookingId])
          : null;
        sendBookingRefundNotification({
          to: booking.email,
          booking,
          session,
          item,
          action,
          refundTransactionId,
        }).catch(err => {
          console.error('[email] refund notification unexpected error:', err);
        });
      } catch (err) {
        console.error('[email] refund notification setup failed:', err?.message || err);
      }
    });
  }

  // Idempotently mark a paid, partially refunded, or quarantined booking as refunded.
  // (post-settlement reversal).
  // Releases seats, refreshes public seat maps, and emails the customer plus
  // EMAIL_BCC recipients.
  async function markBookingRefunded({ bookingId, transactionId = null, refundTransactionId = null, source = 'admin' }) {
    const refundedAt = new Date().toISOString();
    const transition = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (booking.payment_status === 'refunded') return { ok: true, alreadyRefunded: true, booking, releasedSeats: 0 };
      if (!['paid', 'partially_refunded', 'payment_review'].includes(booking.payment_status)) {
        return { ok: false, error: `cannot refund booking in status '${booking.payment_status}'` };
      }
      const items = await tx.allForUpdate('SELECT id, seat_id FROM booking_items WHERE booking_id = ? ORDER BY id', [bookingId]);
      if (items.length > 0) {
        const placeholders = items.map(() => '?').join(',');
        await tx.allForUpdate(`SELECT id FROM seats WHERE id IN (${placeholders}) ORDER BY id`, items.map(item => item.seat_id));
      }
      await tx.run("UPDATE bookings SET payment_status = 'refunded' WHERE id = ?", [bookingId]);
      await tx.run(
        `UPDATE booking_items
         SET refund_status = 'refunded',
             refunded_at = ?,
             refund_transaction_id = ?,
             refund_amount = COALESCE(NULLIF(refund_amount, 0), price + COALESCE((SELECT SUM(price) FROM booking_addons WHERE booking_item_id = booking_items.id), 0)),
             refund_action = 'refund'
         WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
        [refundedAt, refundTransactionId || transactionId, bookingId]
      );
      const releasedSeats = await releaseBookingSeatsTx(tx, { bookingId, items });
      return { ok: true, booking, releasedSeats };
    });
    if (!transition.ok || transition.alreadyRefunded) return transition;
    const { booking, releasedSeats } = transition;

    await logPaymentEvent(bookingId, 'refunded', source, { transactionId });
    await logAudit('booking_refunded', 'booking', bookingId, { transactionId, source, releasedSeats });
    io.to('admin:receipts').emit('booking:refunded', { bookingId, transactionId, releasedSeats });
    io.to('admin:receipts').emit('phd:updated', {
      ...(await getPhdInventoryForSession(booking.session_id)),
      perSession: await getPhdUsageBySession(),
    });
    sendRefundNotificationAsync({ bookingId, action: 'refund', refundTransactionId: refundTransactionId || transactionId });
    io.to(`session:${booking.session_id}`).emit('seats:refresh', { sessionId: booking.session_id });
    return { ok: true, releasedSeats };
  }

  // Idempotently mark a paid or quarantined booking as voided (pre-settlement reversal).
  // Same semantics as markBookingRefunded but distinguished in audit logs so
  // admins can tell which type of reversal happened.
  async function markBookingVoided({ bookingId, transactionId = null, voidTransactionId = null, source = 'admin' }) {
    const voidedAt = new Date().toISOString();
    const transition = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (booking.payment_status === 'voided') return { ok: true, alreadyVoided: true, booking, releasedSeats: 0 };
      if (!['paid', 'payment_review'].includes(booking.payment_status)) {
        return { ok: false, error: `cannot void booking in status '${booking.payment_status}'` };
      }
      const items = await tx.allForUpdate('SELECT id, seat_id FROM booking_items WHERE booking_id = ? ORDER BY id', [bookingId]);
      if (items.length > 0) {
        const placeholders = items.map(() => '?').join(',');
        await tx.allForUpdate(`SELECT id FROM seats WHERE id IN (${placeholders}) ORDER BY id`, items.map(item => item.seat_id));
      }
      await tx.run("UPDATE bookings SET payment_status = 'voided' WHERE id = ?", [bookingId]);
      await tx.run(
        `UPDATE booking_items
         SET refund_status = 'refunded',
             refunded_at = ?,
             refund_transaction_id = ?,
             refund_amount = COALESCE(NULLIF(refund_amount, 0), price + COALESCE((SELECT SUM(price) FROM booking_addons WHERE booking_item_id = booking_items.id), 0)),
             refund_action = 'void'
         WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
        [voidedAt, voidTransactionId || transactionId, bookingId]
      );
      const releasedSeats = await releaseBookingSeatsTx(tx, { bookingId, items });
      return { ok: true, booking, releasedSeats };
    });
    if (!transition.ok || transition.alreadyVoided) return transition;
    const { booking, releasedSeats } = transition;

    await logPaymentEvent(bookingId, 'voided', source, { transactionId });
    await logAudit('booking_voided', 'booking', bookingId, { transactionId, source, releasedSeats });
    io.to('admin:receipts').emit('booking:voided', { bookingId, transactionId, releasedSeats });
    io.to('admin:receipts').emit('phd:updated', {
      ...(await getPhdInventoryForSession(booking.session_id)),
      perSession: await getPhdUsageBySession(),
    });
    sendRefundNotificationAsync({ bookingId, action: 'void', refundTransactionId: voidTransactionId || transactionId });
    io.to(`session:${booking.session_id}`).emit('seats:refresh', { sessionId: booking.session_id });
    return { ok: true, releasedSeats };
  }

  async function getBookingItemRefundAmount(itemId) {
    const item = await get('SELECT price FROM booking_items WHERE id = ?', [itemId]);
    if (!item) return null;
    const addons = await get('SELECT COALESCE(SUM(price), 0) as total FROM booking_addons WHERE booking_item_id = ?', [itemId]);
    const itemPrice = Number(item.price || 0);
    const addonTotal = Number(addons?.total || 0);
    return itemPrice + addonTotal;
  }

  async function markBookingItemRefunded({
    bookingId,
    bookingItemId,
    transactionId = null,
    refundTransactionId = null,
    amountCents = 0,
    action = 'refund',
    source = 'admin',
  }) {
    const refundedAt = new Date().toISOString();
    const transition = await withTransaction(async tx => {
      const booking = await tx.getForUpdate('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return { ok: false, error: 'booking_not_found' };
      if (!['paid', 'partially_refunded'].includes(booking.payment_status)) {
        return { ok: false, error: `cannot refund ticket in booking status '${booking.payment_status}'` };
      }
      const item = await tx.getForUpdate(
        'SELECT id, seat_id, first_name, last_name, reference_number, refund_status FROM booking_items WHERE id = ? AND booking_id = ?',
        [bookingItemId, bookingId]
      );
      if (!item) return { ok: false, error: 'booking_item_not_found' };
      if (item.refund_status === 'refunded') return { ok: true, alreadyRefunded: true, releasedSeats: 0 };
      await tx.getForUpdate('SELECT id FROM seats WHERE id = ?', [item.seat_id]);
      const updated = await tx.run(
        `UPDATE booking_items
         SET refund_status = 'refunded',
             refunded_at = ?,
             refund_transaction_id = ?,
             refund_amount = ?,
             refund_action = ?
         WHERE id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
        [refundedAt, refundTransactionId || transactionId, amountCents, action, bookingItemId]
      );
      if (updated.changes !== 1) return { ok: false, error: 'booking_item_state_changed' };
      const release = await tx.run(
        `UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM booking_items active_item
             JOIN bookings active_booking ON active_booking.id = active_item.booking_id
             WHERE active_item.seat_id = seats.id
               AND active_item.id != ?
               AND active_booking.payment_status IN ('paid', 'partially_refunded')
               AND COALESCE(active_item.refund_status, 'active') != 'refunded'
           )`,
        [item.seat_id, item.id]
      );
      const remainingRow = await tx.get(
        `SELECT COUNT(*) as count FROM booking_items
         WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
        [bookingId]
      );
      const remaining = Number(remainingRow?.count || 0);
      const nextStatus = remaining > 0 ? 'partially_refunded' : (action === 'void' ? 'voided' : 'refunded');
      await tx.run('UPDATE bookings SET payment_status = ? WHERE id = ?', [nextStatus, bookingId]);
      return { ok: true, booking, item, remaining, nextStatus, releasedSeats: Number(release.changes || 0) };
    });
    if (!transition.ok || transition.alreadyRefunded) return transition;
    const { booking, item, remaining, nextStatus, releasedSeats } = transition;

    await logPaymentEvent(bookingId, action === 'void' ? 'voided' : 'refunded', source, {
      transactionId,
      refundTransactionId: refundTransactionId || transactionId,
      bookingItemId,
      itemReference: item.reference_number,
      amountCents,
      partial: remaining > 0,
    });
    await logAudit('booking_item_refunded', 'booking_item', bookingItemId, {
      bookingId,
      transactionId,
      refundTransactionId: refundTransactionId || transactionId,
      source,
      action,
      amountCents,
      attendee: `${item.first_name} ${item.last_name}`,
      ticketReference: item.reference_number,
      releasedSeats,
      bookingStatus: nextStatus,
    });
    io.to(`session:${booking.session_id}`).emit('seats:refresh');
    io.to('admin:receipts').emit('booking:item_refunded', { bookingId, bookingItemId, transactionId, amountCents });
    io.to('admin:receipts').emit('phd:updated', {
      ...(await getPhdInventoryForSession(booking.session_id)),
      perSession: await getPhdUsageBySession(),
    });
    sendRefundNotificationAsync({
      bookingId,
      action,
      refundTransactionId: refundTransactionId || transactionId,
      bookingItemId,
    });
    io.to(`session:${booking.session_id}`).emit('seats:refresh', { sessionId: booking.session_id });
    return { ok: true, releasedSeats, remaining, bookingStatus: nextStatus };
  }

  // Loads a booking + related rows and fires the confirmation email.
  // Used by markBookingPaid; safe to call standalone for resends.
  async function sendBookingConfirmationEmail(bookingId, { toOverride = null } = {}) {
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) return;
    const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
    const items = await all('SELECT * FROM booking_items WHERE booking_id = ? ORDER BY id', [bookingId]);
    const addons = await all(`
      SELECT ba.*
      FROM booking_addons ba
      JOIN booking_items bi ON bi.id = ba.booking_item_id
      WHERE bi.booking_id = ?
    `, [bookingId]);

    const attendees = items.map(it => ({
      firstName: it.first_name,
      lastName: it.last_name,
      seatId: it.seat_id,
      packageId: it.package_id,
      packagePrice: it.price,
      addons: addons.filter(a => a.booking_item_id === it.id).map(a => ({
        packageId: a.package_id,
        quantity: a.quantity,
      })),
    }));

    const sessionPkgs = await all('SELECT * FROM session_packages WHERE session_id = ?', [booking.session_id]);
    const useSessionPkgs = sessionPkgs.length > 0;
    const packages = useSessionPkgs ? sessionPkgs : await all('SELECT * FROM packages WHERE is_active = 1');

    const seats = [];
    for (const it of items) {
      const s = await get('SELECT id, table_number, chair_number FROM seats WHERE id = ?', [it.seat_id]);
      seats.push(s || { id: it.seat_id, table_number: '?', chair_number: '?' });
    }

    return sendBookingConfirmation({
      to: toOverride || booking.email,
      booking: {
        referenceNumber: booking.reference_number,
        itemReferences: items.map(it => it.reference_number),
        ticketAccessToken: booking.ticket_access_token,
        totalAmount: booking.total_amount,
        totalFormatted: formatCurrency(booking.total_amount),
      },
      session,
      attendees,
      seats,
      packages,
    });
  }

  return {
    quarantineRejectedApprovedPayment,
    getSuperUserEmails,
    notifyPaymentReview,
    markBookingPaid,
    markBookingFailed,
    markBookingCancelled,
    cancelPendingBookingForEdit,
    releaseBookingSeatsTx,
    reconcileReversedBookingSeats,
    sendRefundNotificationAsync,
    markBookingRefunded,
    markBookingVoided,
    getBookingItemRefundAmount,
    markBookingItemRefunded,
    sendBookingConfirmationEmail,
  };
}
