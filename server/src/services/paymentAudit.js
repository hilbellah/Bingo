// Gateway-vs-bookings audit.
//
// The reconciler (paymentReconciliation.js) works from OUR side: it takes
// pending bookings and asks the gateway whether they were paid. This audit
// works from the GATEWAY's side: it takes every transaction Authorize.Net
// captured in the window and checks that each one is accounted for by a
// booking in a money-consistent state. That catches what the reconciler
// cannot see — a charge against a booking that had already been cancelled or
// failed, a second charge that was never flagged as a duplicate, a charge
// whose invoice number matches nothing at all.
//
// Anything wrong is emailed to super users and recorded in audit_log; the
// last result is exposed on /health/payments for external monitoring.

import { all, get, run } from '../database.js';
import { v4 as uuid } from 'uuid';

const APPROVED_STATUSES = new Set(['capturedPendingSettlement', 'settledSuccessfully', 'authorizedPendingCapture']);
const MONEY_ACCOUNTED_STATUSES = new Set(['paid', 'partially_refunded', 'refunded', 'voided', 'payment_review']);
const DEFAULT_WINDOW_HOURS = 24 * 7;
// A quarantined payment nobody has acted on for this long is itself an
// incident: it gets emailed again and turns /health/payments red.
export const REVIEW_ESCALATION_HOURS = Number(process.env.REVIEW_ESCALATION_HOURS || 2);
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Anomaly kinds, most severe first. "critical" means money was taken and no
// seat or review exists for it — exactly the 2026-09-04 failure.
export const CRITICAL_ANOMALIES = new Set(['charge_on_unconfirmed_booking', 'charge_without_booking', 'unrecorded_second_charge']);

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createGatewayAuditor({ paymentServices, sendAlert, getRecipients, logger = console, now = () => Date.now() }) {
  const state = { lastRunAt: null, lastError: null, lastErrorAt: null, anomalies: [], transactionsChecked: 0, runs: 0, staleReviewCount: 0 };
  let running = null;

  async function collectGatewayTransactions(windowHours) {
    const since = new Date(now() - windowHours * 3600 * 1000);
    const unsettled = await paymentServices.listUnsettledTransactions();
    if (!unsettled.ok) throw new Error(`unsettled list: ${unsettled.error || 'failed'}`);
    const settled = await paymentServices.listSettledTransactions({ firstSettlementDate: since, lastSettlementDate: new Date(now()) });
    if (!settled.ok) throw new Error(`settled list: ${settled.error || 'failed'}`);
    const seen = new Map();
    for (const tx of [...(unsettled.transactions || []), ...(settled.transactions || [])]) {
      if (!tx?.transId) continue;
      seen.set(String(tx.transId), tx);
    }
    return [...seen.values()];
  }

  async function auditOnce({ reason = 'interval' } = {}) {
    const windowHours = parseNumber(process.env.PAYMENT_AUDIT_WINDOW_HOURS, DEFAULT_WINDOW_HOURS);
    const transactions = await collectGatewayTransactions(windowHours);
    const anomalies = [];

    for (const tx of transactions) {
      if (!APPROVED_STATUSES.has(String(tx.status || ''))) continue;
      const invoice = String(tx.invoiceNumber || '').trim();
      if (!invoice) continue; // non-booking transactions (manual terminal sales etc.)
      const base = { transId: tx.transId, invoiceNumber: invoice, submitTimeUTC: tx.submitTimeUTC || null, gatewayStatus: tx.status || null };
      const booking = await get(
        'SELECT id, reference_number, payment_status, transaction_id, total_amount, customer_first_name, customer_last_name, email, payment_completed_at FROM bookings WHERE reference_number = ?',
        [invoice]
      );
      if (!booking) {
        if (/^BNG-/i.test(invoice)) anomalies.push({ kind: 'charge_without_booking', ...base });
        continue;
      }
      const who = { bookingId: booking.id, customer: [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(' '), email: booking.email, bookingStatus: booking.payment_status, amountCents: booking.total_amount };
      if (!MONEY_ACCOUNTED_STATUSES.has(booking.payment_status)) {
        // Money captured, booking still pending/failed/cancelled: the customer
        // has no seat and nobody has been told. The reconciler should have
        // picked a pending one up; this is the backstop for everything else.
        anomalies.push({ kind: 'charge_on_unconfirmed_booking', ...base, ...who });
        continue;
      }
      if (booking.transaction_id && String(booking.transaction_id) !== String(tx.transId)) {
        // A different approved charge on a booking that is already paid by
        // another transaction. markBookingPaid records these as duplicates;
        // if no event mentions this transId, the second charge is invisible.
        const flagged = await get(
          "SELECT id FROM payment_events WHERE booking_id = ? AND raw_payload LIKE ? AND event_type IN ('duplicate_payment_requires_review', 'stale_payment_requires_review', 'duplicate_payment_resolved', 'refunded', 'voided')",
          [booking.id, `%${tx.transId}%`]
        );
        const refundedItem = await get('SELECT id FROM booking_items WHERE booking_id = ? AND refund_transaction_id = ?', [booking.id, String(tx.transId)]);
        if (!flagged && !refundedItem) anomalies.push({ kind: 'unrecorded_second_charge', ...base, ...who, originalTransactionId: booking.transaction_id });
        continue;
      }
      if (booking.payment_status === 'payment_review') {
        const waitingMs = booking.payment_completed_at ? now() - new Date(booking.payment_completed_at).getTime() : 0;
        anomalies.push({ kind: 'awaiting_staff_review', ...base, ...who, waitingHours: Math.round(waitingMs / 36e5 * 10) / 10 });
      }
    }

    const critical = anomalies.filter(a => CRITICAL_ANOMALIES.has(a.kind));
    const staleReviews = anomalies.filter(a => a.kind === 'awaiting_staff_review' && a.waitingHours >= REVIEW_ESCALATION_HOURS);
    state.lastRunAt = new Date(now()).toISOString();
    state.anomalies = anomalies;
    state.transactionsChecked = transactions.length;
    state.lastError = null;
    state.runs += 1;

    await run(
      `INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'gateway_payment_audit', 'payments', 'scheduled_audit', ?, ?)`,
      [uuid(), JSON.stringify({ reason, windowHours, transactionsChecked: transactions.length, anomalyCount: anomalies.length, criticalCount: critical.length, staleReviewCount: staleReviews.length, anomalies: anomalies.slice(0, 50) }), state.lastRunAt]
    );

    const alwaysEmail = process.env.PAYMENT_AUDIT_ALWAYS_EMAIL === '1';
    state.staleReviewCount = staleReviews.length;
    if ((critical.length > 0 || staleReviews.length > 0 || alwaysEmail) && typeof sendAlert === 'function') {
      try {
        const recipients = typeof getRecipients === 'function' ? await getRecipients() : [];
        await sendAlert({ anomalies, critical, staleReviews, transactionsChecked: transactions.length, windowHours, recipients });
      } catch (err) {
        logger.error?.(`[audit] alert email failed: ${err?.message || err}`);
      }
    }
    if (critical.length > 0) {
      logger.error?.(`[audit] ${critical.length} critical payment anomaly(ies): ${critical.map(a => `${a.kind}:${a.invoiceNumber}/${a.transId}`).join(', ')}`);
    } else {
      logger.info?.(`[audit] gateway payment audit clean: ${transactions.length} transaction(s) checked, ${anomalies.length} awaiting staff review`);
    }
    return { transactionsChecked: transactions.length, anomalies, critical };
  }

  function runGatewayAudit(options = {}) {
    if (running) return running;
    running = Promise.resolve()
      .then(() => auditOnce(options))
      .catch(err => {
        state.lastError = err?.message || String(err);
        state.lastErrorAt = new Date(now()).toISOString();
        logger.error?.(`[audit] gateway payment audit failed: ${state.lastError}`);
        return { transactionsChecked: 0, anomalies: [], critical: [], error: state.lastError };
      })
      .finally(() => { running = null; });
    return running;
  }

  return { runGatewayAudit, getState: () => ({ ...state, criticalCount: state.anomalies.filter(a => CRITICAL_ANOMALIES.has(a.kind)).length }) };
}

export function startGatewayAudit(auditor, { logger = console } = {}) {
  if (process.env.PAYMENT_AUDIT_DISABLED === '1') {
    logger.warn?.('[audit] gateway payment audit disabled by PAYMENT_AUDIT_DISABLED=1');
    return null;
  }
  const intervalMs = Math.max(15 * 60 * 1000, parseNumber(process.env.PAYMENT_AUDIT_INTERVAL_MS, DEFAULT_INTERVAL_MS));
  const timer = setInterval(() => auditor.runGatewayAudit({ reason: 'interval' }), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  const first = setTimeout(() => auditor.runGatewayAudit({ reason: 'startup' }), 90 * 1000);
  if (typeof first.unref === 'function') first.unref();
  logger.info?.(`[audit] gateway payment audit every ${Math.round(intervalMs / 60000)} min`);
  return timer;
}
