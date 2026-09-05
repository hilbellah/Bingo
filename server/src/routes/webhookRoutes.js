// Authorize.Net webhook: the signed, gateway-initiated notification that a
// payment was captured, refunded, voided or declined. Verified against the
// HMAC-SHA512 signature, cross-checked with getTransactionDetails, then fed
// into the payment state machine in services/bookingPayments.js. Also the
// deferred re-verification used when the gateway is briefly unreachable.
//
// Moved verbatim out of server/src/index.js on 2026-09-05 (Phase 3, step 3).
// registerWebhookRoutes() receives the index.js-scoped values the code used.

import { get } from '../database.js';
import { logPaymentEvent } from '../services/paymentEvents.js';
import { verifyTransaction, verifyWebhookSignature } from '../services/payments.js';

export function registerWebhookRoutes(app, {
  io,
  testablePaymentServices,
  markBookingPaid,
  markBookingFailed,
  markBookingRefunded,
  markBookingVoided,
}) {
  // ============ AUTHORIZE.NET WEBHOOK ============
  //
  // Authorize.Net posts payment lifecycle events to this URL. This is the
  // AUTHORITATIVE source of truth for marking a booking 'paid' — not the
  // browser redirect at /payment/return. The webhook fires regardless of
  // what the customer's browser does and is signed with HMAC-SHA512.
  //
  // CRITICAL: this route uses express.raw() (not express.json()) because
  // signature verification requires the unmodified body bytes. Once verified,
  // we parse JSON ourselves.
  //
  // Webhook URL to register in Authorize.Net dashboard (Stage 9 task):
  //   Sandbox:     https://bingo-jk2h.onrender.com/api/webhooks/authorize-net  (with sandbox creds in Render env)
  //   Production:  same URL once ANET_ENV=production in Render env
  //
  // Events to subscribe in dashboard:
  //   net.authorize.payment.authcapture.created   — payment captured (success)
  //   net.authorize.payment.refund.created        — refund processed
  //   net.authorize.payment.void.created          — pre-settlement void
  //   net.authorize.payment.fraud.declined        — Authorize.Net's fraud rule rejected
  //   net.authorize.payment.fraud.held            — held for manual fraud review

  function scheduleDeferredWebhookVerification({
    bookingId,
    transactionId,
    eventType,
    notificationId,
    invoiceNumber,
    attempt = 1,
  }) {
    const retryDelaysMs = [30000, 120000, 300000];
    const delayMs = retryDelaysMs[attempt - 1];
    if (!delayMs) return;

    const timer = setTimeout(async () => {
      try {
        const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (!booking || booking.payment_status === 'paid') return;

        const verify = await verifyTransaction(transactionId);
        if (!verify.ok) {
          console.error(`[webhooks] deferred verification attempt ${attempt} failed for booking=${bookingId} transId=${transactionId}: ${verify.error || 'unknown error'}`);
          await logPaymentEvent(bookingId, 'webhook_verify_retry_error', 'authorize_net_webhook', {
            eventType,
            notificationId,
            transId: transactionId,
            invoiceNumber,
            attempt,
            error: verify.error || null,
          });
          scheduleDeferredWebhookVerification({
            bookingId,
            transactionId,
            eventType,
            notificationId,
            invoiceNumber,
            attempt: attempt + 1,
          });
          return;
        }

        if (verify.invoiceNumber !== booking.reference_number || verify.amountCents !== booking.total_amount) {
          await logPaymentEvent(bookingId, 'webhook_verify_retry_mismatch', 'authorize_net_webhook', {
            eventType,
            notificationId,
            transId: transactionId,
            expectedInvoiceNumber: booking.reference_number,
            actualInvoiceNumber: verify.invoiceNumber,
            expectedAmountCents: booking.total_amount,
            actualAmountCents: verify.amountCents,
          });
          return;
        }

        if (verify.approved) {
          await markBookingPaid({
            bookingId,
            transactionId,
            authCode: verify.authCode,
            source: 'authorize_net_webhook_deferred',
            verifiedTransaction: verify,
          });
          return;
        }

        if (['2', '3'].includes(String(verify.responseCode))) {
          await markBookingFailed({
            bookingId,
            reason: verify.error || `Authorize.Net response code ${verify.responseCode}`,
            source: 'authorize_net_webhook_deferred',
          });
        }
      } catch (err) {
        console.error('[webhooks] deferred verification timer failed:', err?.message || err);
      }
    }, delayMs);

    if (typeof timer.unref === 'function') timer.unref();
  }

  async function processAuthorizeNetWebhook({ rawBody, sigHeader, event }) {
    const { eventType, payload, notificationId } = event || {};
    const transId = payload?.id;
    let invoiceNumber = payload?.merchantReferenceId || payload?.invoiceNumber;
    const signatureValid = verifyWebhookSignature(rawBody, sigHeader);

    // Log the verification result before invoice lookup. Authorize.Net's
    // diagnostic ping does not include a merchant invoice number, so logging
    // only after booking resolution made signature tests inconclusive.
    console.log(
      `[webhooks] signature ${signatureValid ? 'valid' : 'invalid'} eventType=${eventType || 'unknown'} ` +
      `notificationId=${notificationId || 'none'} rawBytes=${rawBody?.length || 0}`
    );

    if (!invoiceNumber && signatureValid && transId) {
      const verify = await verifyTransaction(transId);
      if (verify.ok && verify.invoiceNumber) {
        invoiceNumber = verify.invoiceNumber;
        console.log(`[webhooks] resolved missing invoiceNumber from transaction details for ${eventType}: ${invoiceNumber}`);
      } else {
        console.warn(`[webhooks] could not resolve invoiceNumber for ${eventType} transId=${transId}: ${verify.error || 'no invoiceNumber'}`);
      }
    }

    if (!invoiceNumber) {
      console.warn(`[webhooks] event has no invoiceNumber: ${eventType}`);
      return;
    }

    // We set Authorize.Net's invoiceNumber to our reference_number when
    // creating the hosted page, so we can look up the booking from it.
    const booking = await get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
    if (!booking) {
      console.warn(`[webhooks] booking not found for invoiceNumber=${invoiceNumber} eventType=${eventType}`);
      return;
    }

    if (!signatureValid) {
      console.warn(`[webhooks] signature invalid for booking=${booking.id} ref=${invoiceNumber} eventType=${eventType}`);
      await logPaymentEvent(booking.id, 'webhook_signature_invalid', 'authorize_net_webhook', {
        eventType,
        notificationId,
        transId,
        invoiceNumber,
      });

      if (eventType !== 'net.authorize.payment.authcapture.created' || !transId) {
        return;
      }

      try {
        if (booking.payment_status === 'paid' && booking.transaction_id === transId) {
          return;
        }

        const verify = await verifyTransaction(transId);
        if (!verify.ok) {
          console.error(`[webhooks] invalid-signature fallback verification failed for ${eventType}: ${verify.error || 'unknown error'}`);
          await logPaymentEvent(booking.id, 'webhook_signature_invalid_verify_error', 'authorize_net_webhook', {
            eventType,
            notificationId,
            transId,
            invoiceNumber,
            error: verify.error || null,
          });
          return;
        }

        const verifiedMatch = verify.ok &&
          verify.approved &&
          verify.invoiceNumber === booking.reference_number &&
          verify.amountCents === booking.total_amount;

        if (!verifiedMatch) {
          await logPaymentEvent(booking.id, 'webhook_signature_invalid_rejected', 'authorize_net_webhook', {
            eventType,
            notificationId,
            transId,
            invoiceNumber,
            verifyOk: !!verify.ok,
            verifyApproved: !!verify.approved,
            verifyInvoiceNumber: verify.invoiceNumber || null,
            verifyAmountCents: verify.amountCents ?? null,
            error: verify.error || null,
          });
          return;
        }

        await logPaymentEvent(booking.id, 'webhook_signature_invalid_verified', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId,
          invoiceNumber,
        });
        await markBookingPaid({
          bookingId: booking.id,
          transactionId: transId,
          authCode: verify.authCode,
          source: 'authorize_net_webhook_verified_transaction',
          verifiedTransaction: verify,
        });
        return;
      } catch (err) {
        console.error(`[webhooks] invalid-signature fallback failed for ${eventType}:`, err?.message || err);
        await logPaymentEvent(booking.id, 'webhook_error', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId,
          invoiceNumber,
          error: err?.message || String(err),
        });
        return;
      }
    }

    // Always log the inbound event for audit / debugging.
    await logPaymentEvent(booking.id, 'webhook', 'authorize_net_webhook', {
      eventType, notificationId, transId, invoiceNumber,
    });

    console.log(`[webhooks] ${eventType} booking=${booking.id} ref=${invoiceNumber} transId=${transId}`);

    try {
      if (eventType === 'net.authorize.payment.authcapture.created') {
        // Idempotent — a second webhook for the SAME transaction is a no-op.
        // A different transaction id on an already-paid booking is a real
        // duplicate charge and must fall through to markBookingPaid, whose
        // duplicate branch logs and surfaces it without touching the booking.
        if (booking.payment_status === 'paid'
          && (!transId || !booking.transaction_id || booking.transaction_id === transId)) {
          return;
        }
        // Verify the transaction with Authorize.Net before flipping. Defence
        // in depth: the signature proves the payload is from Authorize.Net,
        // but a redundant API lookup also confirms the transaction approved.
        const verify = await verifyTransaction(transId);
        if (!verify.ok) {
          console.error(`[webhooks] transaction verification deferred for booking=${booking.id} transId=${transId}: ${verify.error || 'unknown error'}`);
          await logPaymentEvent(booking.id, 'webhook_verify_deferred', 'authorize_net_webhook', {
            eventType,
            notificationId,
            transId,
            invoiceNumber,
            error: verify.error || null,
          });
          scheduleDeferredWebhookVerification({
            bookingId: booking.id,
            transactionId: transId,
            eventType,
            notificationId,
            invoiceNumber,
          });
          return;
        }
        if (verify.approved) {
          await markBookingPaid({
            bookingId: booking.id,
            transactionId: transId,
            authCode: verify.authCode,
            source: 'authorize_net_webhook',
            verifiedTransaction: verify,
          });
        } else {
          await markBookingFailed({
            bookingId: booking.id,
            reason: verify.error || 'transaction not approved at verify step',
            source: 'authorize_net_webhook',
          });
        }
      } else if (eventType === 'net.authorize.payment.refund.created') {
        // transId is the REFUND transaction's id, not the original charge.
        // Refunds issued through the admin approval flow are already recorded
        // on booking_items before this webhook arrives — treating the echo as
        // a new full refund used to escalate partial refunds into full ones,
        // releasing seats the customer still paid for.
        const alreadyRecorded = await get(
          'SELECT id FROM booking_items WHERE booking_id = ? AND refund_transaction_id = ?',
          [booking.id, transId]
        );
        if (alreadyRecorded) {
          await logPaymentEvent(booking.id, 'webhook_refund_already_recorded', 'authorize_net_webhook', {
            eventType, notificationId, transId, invoiceNumber,
          });
          return;
        }
        if (['refunded', 'voided'].includes(booking.payment_status)) {
          return;
        }

        // Unknown refund transaction — issued directly in the Authorize.Net
        // dashboard, or our own record failed after the gateway succeeded.
        // Verify the refunded amount before deciding what it covers.
        const verify = await testablePaymentServices.verifyTransaction(transId);
        if (!verify.ok) {
          console.error(`[webhooks] refund verification failed for booking=${booking.id} refundTransId=${transId}: ${verify.error || 'unknown error'}`);
          await logPaymentEvent(booking.id, 'webhook_refund_verify_failed', 'authorize_net_webhook', {
            eventType, notificationId, transId, invoiceNumber,
            error: verify.error || null,
          });
          return;
        }
        const refundedRow = await get(
          `SELECT COALESCE(SUM(refund_amount), 0) as total FROM booking_items
           WHERE booking_id = ? AND COALESCE(refund_status, 'active') = 'refunded'`,
          [booking.id]
        );
        const outstandingCents = Math.max(0, Number(booking.total_amount || 0) - Number(refundedRow?.total || 0));
        const refundCents = Number(verify.amountCents || 0);
        if (outstandingCents > 0 && refundCents >= outstandingCents) {
          await markBookingRefunded({
            bookingId: booking.id,
            transactionId: booking.transaction_id || transId,
            refundTransactionId: transId,
            source: 'authorize_net_webhook',
          });
        } else {
          // A partial external refund can't be attributed to a specific ticket
          // from here — record it for reconciliation instead of guessing.
          // NOTE for admins: refund the ticket from the admin panel, never from
          // the Authorize.Net dashboard, or the money moves without the seat.
          console.warn(`[webhooks] external partial refund for booking=${booking.id} ref=${invoiceNumber} amount=${refundCents} outstanding=${outstandingCents} — flagged for manual reconciliation`);
          await logPaymentEvent(booking.id, 'webhook_external_partial_refund', 'authorize_net_webhook', {
            eventType, notificationId, transId, invoiceNumber,
            refundAmountCents: refundCents,
            outstandingCents,
          });
          io.to('admin:receipts').emit('booking:external_partial_refund', {
            bookingId: booking.id,
            bookingReference: booking.reference_number,
            refundTransactionId: transId,
            amountCents: refundCents,
          });
        }
      } else if (eventType === 'net.authorize.payment.void.created') {
        await markBookingVoided({
          bookingId: booking.id,
          transactionId: transId,
          source: 'authorize_net_webhook',
        });
      } else if (eventType === 'net.authorize.payment.fraud.declined') {
        await markBookingFailed({
          bookingId: booking.id,
          reason: 'fraud_declined',
          source: 'authorize_net_webhook',
        });
      } else if (eventType === 'net.authorize.payment.fraud.held') {
        // Authorize.Net is holding this for manual fraud review. Don't flip
        // anything yet — wait for the follow-up event (approved or declined).
        console.log(`[webhooks] booking ${booking.id} held by Authorize.Net for fraud review`);
      } else {
        console.log(`[webhooks] unhandled eventType: ${eventType}`);
      }
    } catch (err) {
      console.error(`[webhooks] handler error for ${eventType}:`, err?.message || err);
      await logPaymentEvent(booking.id, 'webhook_error', 'authorize_net_webhook', {
        eventType,
        notificationId,
        transId,
        invoiceNumber,
        error: err?.message || String(err),
      });
    }
  }

  app.post('/api/webhooks/authorize-net',
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.rawBody)
        ? req.rawBody
        : Buffer.isBuffer(req.body)
          ? req.body
          : null;
      const sigHeader = req.get('X-ANET-Signature');

      if (!Buffer.isBuffer(rawBody)) {
        console.warn('[webhooks] missing raw request body');
        return res.status(400).end();
      }

      let event;
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch (err) {
        console.error('[webhooks] malformed JSON:', err?.message || err);
        return res.status(400).end();
      }

      // Authorize.Net disables webhooks after repeated non-200 deliveries.
      // Acknowledge receipt before database/API/email processing.
      res.status(200).end();

      processAuthorizeNetWebhook({ rawBody, sigHeader, event }).catch((err) => {
        console.error('[webhooks] async handler failed:', err?.message || err);
      });
    }
  );

  return { processAuthorizeNetWebhook };
}
