// Customer checkout: create a pending booking, send the customer to the
// Authorize.Net hosted card form, and turn the result (browser return,
// embedded-form callback, cancel) into a booking state via the payment state
// machine in services/bookingPayments.js. Also the status poll the customer's
// browser uses while waiting, which doubles as the seat-hold heartbeat and the
// on-demand trigger for gateway reconciliation.
//
// Moved verbatim out of server/src/index.js on 2026-09-05 (Phase 3, step 2).
// registerCheckoutRoutes() receives the index.js-scoped values the code used.

import { all, get, run, saveDb, withTransaction } from '../database.js';
import { formatCurrency } from '../utils/format.js';
import { logPaymentEvent } from '../services/paymentEvents.js';
import { holdExpiresAt, shortenRequestedSeatHolds } from '../services/holds.js';
import { validatePhdInventory } from '../services/phdInventory.js';
import { createHostedPaymentPage, getHostedPaymentRedirectUrl } from '../services/payments.js';

export function registerCheckoutRoutes(app, {
  io,
  adminAuth,
  bookingLimiter,
  HOLD_MINUTES,
  PAYMENT_FAILURE_HOLD_MINUTES,
  CHECKOUT_SERVICE_FEE_CENTS,
  CHECKOUT_HEARTBEAT_MAX_MINUTES,
  logAudit,
  validateBookingRequest,
  insertBookingRecord,
  buildBookingLineItems,
  getBookingInitiationKey,
  withBookingInitiationLock,
  getCheckoutServiceFeeCents,
  testablePaymentServices,
  paymentReconciler,
  markBookingPaid,
  markBookingFailed,
  markBookingCancelled,
  cancelPendingBookingForEdit,
}) {
  function sortedSeatIds(attendees) {
    return (attendees || [])
      .map(att => String(att?.seatId || '').trim())
      .filter(Boolean)
      .sort();
  }

  function sameSeatSet(left, right) {
    if (left.length !== right.length) return false;
    return left.every((seatId, index) => seatId === right[index]);
  }

  function buildInitiateResponse({
    bookingId,
    refNumber,
    totalAmount,
    itemRefs,
    ticketAccessToken,
    email,
    customerFirstName,
    customerLastName,
    token,
    serviceFeeAmount = CHECKOUT_SERVICE_FEE_CENTS,
    serviceFeeQuantity = 1,
    salesTaxAmount = 0,
    duplicate = false,
  }) {
    return {
      bookingId,
      referenceNumber: refNumber,
      itemReferences: itemRefs,
      totalAmount,
      totalFormatted: formatCurrency(totalAmount),
      serviceFeeAmount,
      serviceFeeFormatted: formatCurrency(serviceFeeAmount),
      serviceFeeUnitAmount: CHECKOUT_SERVICE_FEE_CENTS,
      serviceFeeUnitFormatted: formatCurrency(CHECKOUT_SERVICE_FEE_CENTS),
      serviceFeeQuantity,
      salesTaxAmount,
      salesTaxFormatted: formatCurrency(salesTaxAmount),
      salesTaxLabel: 'HST (15%)',
      email,
      customerFirstName,
      customerLastName,
      redirectUrl: getHostedPaymentRedirectUrl(),
      token,
      ticketAccessToken,
      duplicate,
    };
  }

  async function findReusablePendingBooking({ sessionId, holderId, attendees, email }) {
    const requestedSeatIds = sortedSeatIds(attendees);
    if (!sessionId || !holderId || requestedSeatIds.length === 0) return null;

    const candidates = await all(
      `SELECT id, reference_number, total_amount, hosted_token, ticket_access_token,
              email, customer_first_name, customer_last_name, payment_attempted_at
       FROM bookings
       WHERE session_id = ?
         AND payment_status = 'pending'
         AND LOWER(COALESCE(email, '')) = LOWER(?)
       ORDER BY created_at DESC
       LIMIT 20`,
      [sessionId, email || '']
    );

    for (const booking of candidates) {
      const itemRows = await all(
        'SELECT seat_id, reference_number FROM booking_items WHERE booking_id = ? ORDER BY id',
        [booking.id]
      );
      const bookingSeatIds = itemRows.map(row => String(row.seat_id || '').trim()).sort();
      if (!sameSeatSet(requestedSeatIds, bookingSeatIds)) continue;

      const placeholders = requestedSeatIds.map(() => '?').join(',');
      const heldSeats = await all(
        `SELECT id
         FROM seats
         WHERE id IN (${placeholders})
           AND status = 'held'
           AND held_by = ?
           AND (held_until IS NULL OR held_until > ?)`,
        [...requestedSeatIds, holderId, new Date().toISOString()]
      );
      if (heldSeats.length !== requestedSeatIds.length) continue;

      return {
        bookingId: booking.id,
        refNumber: booking.reference_number,
        totalAmount: booking.total_amount,
        itemRefs: itemRows.map(row => row.reference_number).filter(Boolean),
        itemReferenceBySeat: new Map(itemRows.map(row => [String(row.seat_id || '').trim(), row.reference_number]).filter(([seatId, ref]) => seatId && ref)),
        ticketAccessToken: booking.ticket_access_token,
        email: booking.email,
        customerFirstName: booking.customer_first_name,
        customerLastName: booking.customer_last_name,
        token: booking.hosted_token,
        inProgress: !booking.hosted_token,
      };
    }

    return null;
  }

  // ============ BOOKINGS — CUSTOMER PATHS ============

  // Legacy/admin path: creates a booking and marks it 'paid' IMMEDIATELY without
  // a real payment processor. Originally the only path; now reserved for admin
  // comp/staff bookings or any flow where money was collected elsewhere.
  // Customer-facing UI should hit POST /api/bookings/initiate instead.
  app.post('/api/bookings', adminAuth, async (req, res) => {
    try {
      const validation = await validateBookingRequest(req.body, { requireEmailVerification: false, requireCustomerDetails: false });
      if (!validation.ok) return res.status(validation.statusCode).json({ error: validation.error });
      const {
        sessionId,
        holderId,
        attendees,
        trimmedEmail,
        customerFirstName,
        customerLastName,
        emailVerifiedAt,
        useSessionPkgs,
        sessionPkgs,
        requiredPkg,
        requiredPkgs,
        sessionType
      } = validation.data;

      const phdCheck = await validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg, sessionType, requiredPkgs);
      if (!phdCheck.ok) return res.status(400).json({ error: phdCheck.error });

      const { bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken } = await insertBookingRecord({
        sessionId,
        attendees,
        requiredPkg,
        requiredPkgs,
        sessionPkgs,
        useSessionPkgs,
        email: trimmedEmail,
        customerFirstName,
        customerLastName,
        emailVerifiedAt,
        holderId,
        sessionType
      });

      // No payment processor in this path — flip directly to 'paid'.
      // markBookingPaid handles seat flips, sockets, audit, and email.
      await markBookingPaid({ bookingId, source: 'instant_legacy' });

      res.json({
        bookingId,
        referenceNumber: refNumber,
        itemReferences: itemRefs,
        totalAmount,
        totalFormatted: formatCurrency(totalAmount),
        email: trimmedEmail,
        customerFirstName,
        customerLastName,
        ticketAccessToken,
      });
    } catch (err) {
      console.error('POST /api/bookings failed:', err);
      res.status(500).json({ error: 'Booking failed' });
    }
  });

  // Customer-facing path: creates a 'pending' booking, calls Authorize.Net for a
  // hosted-payment-page token, returns it to the client. The client then POSTs
  // the token to redirectUrl (Authorize.Net's hosted page domain), the customer
  // enters their card, Authorize.Net redirects back to /payment/return, and
  // /payment/return (or the webhook) calls markBookingPaid().
  //
  // Seats are NOT flipped to 'sold' here — they remain 'held' with a refreshed
  // held_until so they survive the time the customer spends on the hosted page.
  app.post('/api/bookings/initiate', bookingLimiter, async (req, res) => {
    let failureHoldContext = {
      holderId: req.body?.holderId,
      attendees: req.body?.attendees,
    };
    let bookingIdForFailure = null;
    try {
      const validation = await validateBookingRequest(req.body, { requireEmailVerification: false, requireEmail: true });
      if (!validation.ok) {
        await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
        return res.status(validation.statusCode).json({ error: validation.error });
      }
      const {
        sessionId,
        holderId,
        attendees,
        trimmedEmail,
        customerFirstName,
        customerLastName,
        emailVerifiedAt,
        useSessionPkgs,
        sessionPkgs,
        requiredPkg,
        requiredPkgs,
        sessionType
      } = validation.data;
      failureHoldContext = { holderId, attendees };

      const phdCheck = await validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg, sessionType, requiredPkgs);
      if (!phdCheck.ok) {
        await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
        return res.status(400).json({ error: phdCheck.error });
      }

      const initiationKey = getBookingInitiationKey({ sessionId, holderId, attendees });
      const initiation = await withBookingInitiationLock(initiationKey, async () => {
        const reusable = await findReusablePendingBooking({
          sessionId,
          holderId,
          attendees,
          email: trimmedEmail,
        });
        if (reusable?.inProgress) {
          return {
            statusCode: 409,
            body: {
              error: 'Booking initiation already in progress. Please wait a moment and try again.',
              bookingId: reusable.bookingId,
              referenceNumber: reusable.refNumber,
            },
          };
        }
        if (reusable) {
          const refreshedHoldUntil = holdExpiresAt(HOLD_MINUTES);
          for (const att of attendees) {
            await run('UPDATE seats SET held_until = ? WHERE id = ?', [refreshedHoldUntil, att.seatId]);
          }
          const rebuiltBooking = await buildBookingLineItems({
            bookingId: reusable.bookingId,
            attendees,
            requiredPkg,
            requiredPkgs,
            sessionPkgs,
            useSessionPkgs,
            sessionType,
            itemReferenceBySeat: reusable.itemReferenceBySeat,
          });

          const result = await testablePaymentServices.createHostedPaymentPage({
            bookingId: reusable.bookingId,
            amountCents: rebuiltBooking.totalAmount,
            email: trimmedEmail,
            firstName: customerFirstName,
            lastName: customerLastName,
            refNumber: reusable.refNumber,
          });

          if (!result.ok) {
            await markBookingFailed({ bookingId: reusable.bookingId, reason: result.error, source: 'server' });
            console.error(`[bookings] /initiate failed to refresh hosted page token: ${result.error}`);
            return { statusCode: 502, body: { error: 'Could not start payment. Please try again.' } };
          }

          // Atomic rebuild: a payment webhook landing mid-rebuild must never
          // observe the booking with zero items. Also stamp the CURRENT
          // holder id — the reused booking may have been created from another
          // device, and markBookingPaid rejects (quarantines) a paid booking
          // whose seats are held by a different holder than the one recorded.
          // The booking is locked and re-confirmed 'pending' INSIDE the
          // transaction: the hosted-token gateway call above takes seconds, and
          // the previous payment can complete during it — rebuilding a paid
          // booking would change its items/total after money already moved.
          const rebuildResult = await withTransaction(async tx => {
            const lockedBooking = await tx.getForUpdate(
              'SELECT id, payment_status FROM bookings WHERE id = ?',
              [reusable.bookingId]
            );
            if (!lockedBooking || lockedBooking.payment_status !== 'pending') {
              return { ok: false, paymentStatus: lockedBooking?.payment_status || 'missing' };
            }
            await tx.run(
              `DELETE FROM booking_addons
               WHERE booking_item_id IN (SELECT id FROM booking_items WHERE booking_id = ?)`,
              [reusable.bookingId]
            );
            await tx.run('DELETE FROM booking_items WHERE booking_id = ?', [reusable.bookingId]);
            for (const itemRow of rebuiltBooking.itemRows) {
              await tx.run('INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', itemRow);
            }
            for (const addonRow of rebuiltBooking.addonRows) {
              await tx.run('INSERT INTO booking_addons (id, booking_item_id, package_id, quantity, price) VALUES (?, ?, ?, ?, ?)', addonRow);
            }
            const finalized = await tx.run(
              `UPDATE bookings
               SET hosted_token = ?, payment_attempted_at = ?, customer_first_name = ?, customer_last_name = ?, total_amount = ?, checkout_holder_id = ?
               WHERE id = ? AND payment_status = 'pending'`,
              [result.token, new Date().toISOString(), customerFirstName, customerLastName, rebuiltBooking.totalAmount, holderId, reusable.bookingId]
            );
            if (finalized.changes !== 1) {
              throw Object.assign(new Error('booking_no_longer_pending'), { rebuildConflict: true });
            }
            return { ok: true };
          }).catch(err => {
            if (err?.rebuildConflict) return { ok: false, paymentStatus: 'changed' };
            throw err;
          });
          if (!rebuildResult.ok) {
            const statusNow = rebuildResult.paymentStatus === 'changed'
              ? (await get('SELECT payment_status FROM bookings WHERE id = ?', [reusable.bookingId]))?.payment_status || 'missing'
              : rebuildResult.paymentStatus;
            console.warn(`[bookings] /initiate rebuild aborted: booking ${reusable.bookingId} is '${statusNow}', not pending`);
            await logPaymentEvent(reusable.bookingId, 'initiate_rebuild_aborted_not_pending', 'server', {
              paymentStatus: statusNow,
            });
            // Only claim the payment completed when it actually did — the
            // booking may equally have failed, been cancelled, or vanished.
            const completedStates = ['paid', 'partially_refunded', 'refunded', 'voided', 'payment_review'];
            if (completedStates.includes(statusNow)) {
              return {
                statusCode: 409,
                body: {
                  error: 'Your earlier payment for these seats has already completed. Check your email for the confirmation — do not pay again.',
                  bookingId: reusable.bookingId,
                  referenceNumber: reusable.refNumber,
                  alreadyCompleted: true,
                },
              };
            }
            return {
              statusCode: 409,
              body: {
                error: 'This checkout is no longer active. Please refresh the page and start a new booking.',
                bookingId: reusable.bookingId,
                referenceNumber: reusable.refNumber,
              },
            };
          }
          await saveDb();
          await logPaymentEvent(reusable.bookingId, 'initiated', 'server', {
            totalAmount: rebuiltBooking.totalAmount,
            refNumber: reusable.refNumber,
            refreshed: true,
          });

          return {
            statusCode: 200,
            body: buildInitiateResponse({
              ...reusable,
              totalAmount: rebuiltBooking.totalAmount,
              itemRefs: rebuiltBooking.itemRefs,
              customerFirstName,
              customerLastName,
              token: result.token,
              serviceFeeAmount: getCheckoutServiceFeeCents(attendees, sessionType),
              serviceFeeQuantity: attendees.length,
              salesTaxAmount: rebuiltBooking.salesTaxAmount,
              duplicate: true,
            }),
          };
        }

        let bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken, salesTaxAmount;
        try {
          ({ bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken, salesTaxAmount } = await insertBookingRecord({
            sessionId,
            attendees,
            requiredPkg,
            requiredPkgs,
            sessionPkgs,
            useSessionPkgs,
            email: trimmedEmail,
            customerFirstName,
            customerLastName,
            emailVerifiedAt,
            holderId,
            sessionType
          }));
          bookingIdForFailure = bookingId;

          // Refresh held_until so seats survive the hosted-page detour.
          // This gives the customer a fresh hold window from clicking Confirm.
          const newHoldUntil = holdExpiresAt(HOLD_MINUTES);
          for (const att of attendees) {
            await run('UPDATE seats SET held_until = ? WHERE id = ?', [newHoldUntil, att.seatId]);
          }
          await run('UPDATE bookings SET payment_attempted_at = ? WHERE id = ?',
            [new Date().toISOString(), bookingId]);

          await saveDb();
          await logPaymentEvent(bookingId, 'initiated', 'server', { totalAmount, refNumber });
        } catch (err) {
          console.error('Initiate booking insert error:', err);
          await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
          return { statusCode: 500, body: { error: 'Booking initiation failed' } };
        }

        // Get hosted-page token from Authorize.Net.
        const result = await createHostedPaymentPage({
          bookingId,
          amountCents: totalAmount,
          email: trimmedEmail,
          firstName: customerFirstName,
          lastName: customerLastName,
          refNumber,
        });

        if (!result.ok) {
          await markBookingFailed({ bookingId, reason: result.error, source: 'server' });
          console.error(`[bookings] /initiate failed to get hosted page token: ${result.error}`);
          return { statusCode: 502, body: { error: 'Could not start payment. Please try again.' } };
        }

        await run('UPDATE bookings SET hosted_token = ? WHERE id = ?', [result.token, bookingId]);
        await saveDb();

        return {
          statusCode: 200,
          body: buildInitiateResponse({
            bookingId,
            refNumber,
            totalAmount,
            itemRefs,
            ticketAccessToken,
            email: trimmedEmail,
            customerFirstName,
            customerLastName,
            token: result.token,
            serviceFeeAmount: getCheckoutServiceFeeCents(attendees, sessionType),
            serviceFeeQuantity: attendees.length,
            salesTaxAmount,
          }),
        };
      });

      return res.status(initiation.statusCode).json(initiation.body);
    } catch (err) {
      console.error('POST /api/bookings/initiate failed:', err);
      if (bookingIdForFailure) {
        await markBookingFailed({ bookingId: bookingIdForFailure, reason: err?.message || 'unexpected initiate error', source: 'server' });
      } else {
        await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/bookings/:id/edit', bookingLimiter, async (req, res) => {
    try {
      const result = await cancelPendingBookingForEdit({ bookingId: req.params.id });
      if (!result.ok) {
        const statusCode = result.error === 'refund_required' ? 409 : result.error === 'booking_not_found' ? 404 : 400;
        return res.status(statusCode).json({ error: result.error });
      }
      res.json({ success: true, heldUntil: result.heldUntil || null });
    } catch (err) {
      console.error('POST /api/bookings/:id/edit failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Status polling — used by the client processing page to check booking state
  // while waiting for /payment/return or the webhook to flip it to paid/failed.
  app.get('/api/bookings/:id/status', async (req, res) => {
    try {
      const booking = await get(
        `SELECT id, reference_number, payment_status, total_amount, payment_failure_reason, ticket_access_token,
                checkout_holder_id, payment_attempted_at, created_at, hosted_token
         FROM bookings WHERE id = ?`,
        [req.params.id]
      );
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.payment_status === 'pending') {
        // The customer is still on the card form or waiting for confirmation:
        // keep their seats held, and ask the gateway directly whether the
        // payment already went through instead of waiting for the webhook.
        try {
          await keepCheckoutHoldAlive(booking);
        } catch (err) {
          console.error('[bookings] hold heartbeat failed:', err?.message || err);
        }
        if (booking.hosted_token) {
          paymentReconciler.requestReconciliation({ reason: 'status_poll', minGapMs: 20000 });
        }
      }
      res.json({
        bookingId: booking.id,
        referenceNumber: booking.reference_number,
        status: booking.payment_status,
        totalAmount: booking.total_amount,
        totalFormatted: formatCurrency(booking.total_amount),
        failureReason: booking.payment_failure_reason,
        ticketAccessToken: booking.payment_status === 'paid' ? booking.ticket_access_token : undefined,
      });
    } catch (err) {
      console.error('GET /api/bookings/:id/status failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============ PAYMENT RETURN / CANCEL ============
  //
  // Authorize.Net redirects the customer's browser to one of these URLs after
  // the hosted payment page finishes. Depending on the showReceipt setting,
  // Authorize.Net uses either GET (showReceipt:true → user clicked Continue on
  // their receipt page) or POST (showReceipt:false → browser submits form data
  // with transaction details). We handle both with app.all.
  //
  // The webhook is still the primary payment signal, but the browser return can
  // safely reconcile a payment when Authorize.Net includes a transaction id. The
  // browser return is not trusted by itself; we verify server-to-server and only
  // mark paid when invoice number and amount match our pending booking.

  function firstString(...values) {
    for (const value of values) {
      const candidate = Array.isArray(value) ? value[0] : value;
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return '';
  }

  async function findBookingForPaymentReturn(req) {
    const body = req.body || {};
    const bookingId = firstString(req.query.bookingId, body.bookingId, body.booking_id);
    const invoiceNumber = firstString(
      req.query.invoiceNumber,
      req.query.invoice,
      req.query.refNumber,
      body.invoiceNumber,
      body.invoice,
      body.refNumber,
      body.x_invoice_num,
      body.merchantReferenceId
    );

    if (bookingId) {
      const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      if (booking) return booking;
    }

    if (invoiceNumber) {
      const booking = await get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
      if (booking) return booking;
    }

    return null;
  }

  function getReturnTransactionId(req) {
    const body = req.body || {};
    return firstString(
      req.query.transId,
      req.query.transactionId,
      req.query.transaction_id,
      body.transId,
      body.transactionId,
      body.transaction_id,
      body.x_trans_id
    );
  }

  async function reconcilePaymentReturn(booking, transactionId) {
    if (!transactionId) return;
    // Same-transaction return on a paid booking is the normal idempotent case;
    // a DIFFERENT transaction id must proceed so the duplicate charge is
    // verified and flagged rather than silently ignored.
    if (booking.payment_status === 'paid'
      && (!booking.transaction_id || booking.transaction_id === transactionId)) return;

    const verify = await testablePaymentServices.verifyTransaction(transactionId);
    if (!verify.ok) {
      await logPaymentEvent(booking.id, 'return_verify_error', 'authorize_net_browser', {
        transactionId,
        error: verify.error,
      });
      return;
    }

    if (verify.invoiceNumber !== booking.reference_number) {
      await logPaymentEvent(booking.id, 'return_verify_mismatch', 'authorize_net_browser', {
        transactionId,
        expectedInvoiceNumber: booking.reference_number,
        actualInvoiceNumber: verify.invoiceNumber,
      });
      return;
    }

    if (verify.amountCents !== booking.total_amount) {
      await logPaymentEvent(booking.id, 'return_verify_mismatch', 'authorize_net_browser', {
        transactionId,
        expectedAmountCents: booking.total_amount,
        actualAmountCents: verify.amountCents,
      });
      return;
    }

    if (verify.approved) {
      await markBookingPaid({
        bookingId: booking.id,
        transactionId,
        authCode: verify.authCode,
        source: 'authorize_net_browser_verified',
        verifiedTransaction: verify,
      });
      return;
    }

    if (['2', '3'].includes(String(verify.responseCode))) {
      await markBookingFailed({
        bookingId: booking.id,
        reason: verify.error || `Authorize.Net response code ${verify.responseCode}`,
        source: 'authorize_net_browser_verified',
      });
    }
  }

  app.all('/payment/return', async (req, res) => {
    try {
      const booking = await findBookingForPaymentReturn(req);
      const transactionId = getReturnTransactionId(req);
      const bookingId = booking?.id;
      if (!bookingId) {
        console.warn('[payments] /payment/return called without a matching booking', {
          method: req.method,
          bodyKeys: Object.keys(req.body || {}),
        });
        return res.redirect('/');
      }
      await logPaymentEvent(bookingId, 'returned', 'authorize_net_browser', {
        method: req.method,
        transactionId: transactionId || null,
        bodyKeys: Object.keys(req.body || {}),
      });
      try {
        await reconcilePaymentReturn(booking, transactionId);
      } catch (err) {
        console.error('[payments] browser return reconciliation failed:', err?.message || err);
        await logPaymentEvent(bookingId, 'return_verify_error', 'authorize_net_browser', {
          transactionId: transactionId || null,
          error: err?.message || String(err),
        });
      }
      return res.redirect(`/booking/${encodeURIComponent(bookingId)}/processing`);
    } catch (err) {
      console.error('ALL /payment/return failed:', err);
      return res.redirect('/');
    }
  });

  // Card form reported success inside the embedded iframe. The client sends the
  // transaction id here (keepalive fetch) before it navigates, so confirmation
  // does not depend on the follow-up /payment/return navigation completing or
  // on the webhook. Nothing is trusted from the browser: the id is verified
  // server-to-server against the gateway before the booking changes.
  app.post('/api/bookings/:id/payment-result', bookingLimiter, async (req, res) => {
    try {
      const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      const transactionId = firstString(req.body?.transId, req.body?.transactionId);
      await logPaymentEvent(booking.id, 'returned', 'authorize_net_iframe', {
        method: 'POST',
        transactionId: transactionId || null,
      });
      if (transactionId) {
        try {
          await reconcilePaymentReturn(booking, transactionId);
        } catch (err) {
          console.error('[payments] iframe payment-result reconciliation failed:', err?.message || err);
          await logPaymentEvent(booking.id, 'return_verify_error', 'authorize_net_iframe', {
            transactionId,
            error: err?.message || String(err),
          });
        }
      } else if (booking.hosted_token) {
        // No transaction id in the gateway message: fall back to asking the
        // gateway directly rather than waiting for the webhook.
        paymentReconciler.requestReconciliation({ reason: 'payment_result', minGapMs: 0 });
      }
      const updated = await get('SELECT payment_status FROM bookings WHERE id = ?', [booking.id]);
      res.json({ bookingId: booking.id, status: updated?.payment_status || booking.payment_status });
    } catch (err) {
      console.error('POST /api/bookings/:id/payment-result failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.all('/payment/cancel', async (req, res) => {
    try {
      const booking = await findBookingForPaymentReturn(req);
      if (booking?.id) {
        const result = await markBookingCancelled({ bookingId: booking.id, source: 'customer' });
        if (!result.ok && result.error === 'refund_required') {
          return res.redirect(`/booking/${encodeURIComponent(booking.id)}/processing`);
        }
      }
      // Client-side route — shows "Payment cancelled" with a "Try Again" button.
      // Seats remain 'held' so the customer can retry without losing them.
      return res.redirect(`/booking/${encodeURIComponent(booking?.id || '')}/cancelled`);
    } catch (err) {
      console.error('ALL /payment/cancel failed:', err);
      return res.redirect('/');
    }
  });

  // Keep the seats of an in-flight checkout held while the customer is still
  // on the page. Called from the status poll (every 2s per waiting customer);
  // writes only when the hold has less than HOLD_MINUTES - 1 left, so it costs
  // one UPDATE a minute per checkout at most.
  async function keepCheckoutHoldAlive(booking) {
    const startedAt = new Date(booking.payment_attempted_at || booking.created_at || 0).getTime();
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > CHECKOUT_HEARTBEAT_MAX_MINUTES * 60 * 1000) {
      return { extended: 0, capped: true };
    }
    const nowIso = new Date().toISOString();
    const target = holdExpiresAt(HOLD_MINUTES);
    const refreshBelow = holdExpiresAt(Math.max(1, HOLD_MINUTES - 1));
    const holderId = String(booking.checkout_holder_id || '').trim();
    const holderClause = holderId ? 'AND held_by = ?' : '';
    const params = holderId ? [target, booking.id, nowIso, refreshBelow, holderId] : [target, booking.id, nowIso, refreshBelow];
    const result = await run(
      `UPDATE seats SET held_until = ?
       WHERE id IN (SELECT seat_id FROM booking_items WHERE booking_id = ?)
         AND status = 'held'
         AND held_until IS NOT NULL
         AND held_until > ?
         AND held_until < ?
         ${holderClause}`,
      params
    );
    return { extended: Number(result?.changes || 0) };
  }

  return { keepCheckoutHoldAlive, reconcilePaymentReturn, findBookingForPaymentReturn, firstString };
}
