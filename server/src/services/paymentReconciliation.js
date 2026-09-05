// Webhook-independent payment reconciliation.
//
// Why this exists: on 2026-09-04 Authorize.Net delivered six "payment
// captured" webhooks roughly an hour late. The booking flow had no other way
// to learn that a customer had paid, so by the time the webhook arrived the
// 20-minute seat hold had expired and the payment was quarantined - the
// customer was charged with no reservation, and two customers paid again.
//
// This service periodically (and on demand, from the customer's "confirming
// your payment" poll) asks the gateway which of our still-pending bookings
// have an approved transaction, and confirms them through the exact same
// markBookingPaid path the webhook uses. Everything here is idempotent: a
// webhook and a reconciliation run racing on the same booking both end in
// one 'paid' booking, because markBookingPaid locks the row and short-circuits
// on already-paid.
//
// Gateway cost: one getUnsettledTransactionList call per cycle, and only when
// at least one booking is actually waiting. Settled batches are scanned much
// less often, for the rare pending booking that slipped past a settlement.

import { all, get } from '../database.js';
import { logPaymentEvent } from './paymentEvents.js';

const APPROVED_STATUSES = new Set([
  'capturedPendingSettlement',
  'settledSuccessfully',
  'authorizedPendingCapture',
]);
// Statuses that mean the money is not (yet) ours - held for fraud review or
// reversed. We leave the booking pending; the webhook flow handles the rest.
const IGNORED_STATUSES = new Set([
  'FDSPendingReview',
  'FDSAuthorizedPendingReview',
  'voided',
  'declined',
  'generalError',
  'refundSettledSuccessfully',
  'refundPendingSettlement',
  'communicationError',
  'expired',
  'failedReview',
  'returnedItem',
  'couldNotVoid',
  'settlementError',
  'chargeback',
  'chargebackReversal',
  'authorizedPendingRelease',
]);

const DEFAULT_LOOKBACK_HOURS = 24 * 7;
const DEFAULT_MIN_AGE_SECONDS = 20;
const DEFAULT_SETTLED_SCAN_INTERVAL_MS = 30 * 60 * 1000;

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createPaymentReconciler({
  paymentServices,
  markBookingPaid,
  protectCheckouts = null,
  logger = console,
  now = () => Date.now(),
}) {
  let running = null;
  let lastRunAt = 0;
  let lastSettledScanAt = 0;
  const stats = { runs: 0, confirmed: 0, reviewed: 0, errors: 0, lastError: null, lastErrorAt: null, lastRunAt: null, consecutiveFailures: 0, degraded: false, lastProtection: null };

  // Two consecutive failures to reach the gateway means we are blind to
  // payments. Until we can see again, in-flight checkouts must keep their
  // seats (see checkoutGuards.protectInFlightCheckoutHolds); re-applied on
  // every failed cycle so the extension keeps rolling forward.
  async function noteGatewayFailure(reason) {
    stats.consecutiveFailures += 1;
    if (stats.consecutiveFailures < 2 || typeof protectCheckouts !== 'function') return;
    if (!stats.degraded) logger.error?.(`[reconcile] gateway unreachable ${stats.consecutiveFailures}x in a row - entering degraded mode, protecting in-flight checkout seats (${reason})`);
    stats.degraded = true;
    try {
      const protection = await protectCheckouts({ reason: `gateway_degraded: ${stats.lastError || reason}` });
      stats.lastProtection = { ...protection, at: new Date(now()).toISOString() };
      if (protection.extended || protection.reheld) {
        logger.warn?.(`[reconcile] degraded mode: extended ${protection.extended} hold(s), re-held ${protection.reheld} released seat(s) until ${protection.until}`);
      }
    } catch (err) {
      logger.error?.(`[reconcile] could not protect in-flight checkouts: ${err?.message || err}`);
    }
  }
  function noteGatewaySuccess() {
    if (stats.degraded) logger.info?.('[reconcile] gateway reachable again - leaving degraded mode');
    stats.consecutiveFailures = 0;
    stats.degraded = false;
  }

  async function loadPendingCandidates() {
    const lookbackHours = parseNumber(process.env.PAYMENT_RECONCILE_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);
    const minAgeSeconds = parseNumber(process.env.PAYMENT_RECONCILE_MIN_AGE_SECONDS, DEFAULT_MIN_AGE_SECONDS);
    const current = now();
    const since = new Date(current - lookbackHours * 3600 * 1000).toISOString();
    const notAfter = new Date(current - minAgeSeconds * 1000).toISOString();
    // hosted_token IS NOT NULL: the customer was actually sent to the card
    // form. A booking that never got that far cannot have a gateway charge.
    return all(
      `SELECT id, reference_number, total_amount, payment_attempted_at, created_at
       FROM bookings
       WHERE payment_status = 'pending'
         AND hosted_token IS NOT NULL
         AND COALESCE(payment_attempted_at, created_at) >= ?
         AND COALESCE(payment_attempted_at, created_at) <= ?
       ORDER BY COALESCE(payment_attempted_at, created_at) ASC
       LIMIT 200`,
      [since, notAfter]
    );
  }

  function indexByInvoice(transactions) {
    const byInvoice = new Map();
    for (const tx of transactions || []) {
      if (!tx?.invoiceNumber || !tx?.transId) continue;
      const key = String(tx.invoiceNumber).trim();
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key).push(tx);
    }
    return byInvoice;
  }

  async function confirmCandidate(candidate, tx, { source }) {
    // Re-read: a webhook may have completed this booking while we were
    // talking to the gateway. markBookingPaid guards this too, but skipping
    // the verify call keeps gateway traffic down.
    const fresh = await get('SELECT payment_status, transaction_id FROM bookings WHERE id = ?', [candidate.id]);
    if (!fresh || fresh.payment_status !== 'pending') return { skipped: true };

    const verify = await paymentServices.verifyTransaction(tx.transId);
    if (!verify.ok) {
      stats.errors += 1;
      await logPaymentEvent(candidate.id, 'reconcile_verify_error', source, { transId: tx.transId, error: verify.error || null });
      return { error: verify.error };
    }
    if (verify.invoiceNumber !== candidate.reference_number) {
      await logPaymentEvent(candidate.id, 'reconcile_invoice_mismatch', source, {
        transId: tx.transId, expected: candidate.reference_number, actual: verify.invoiceNumber || null,
      });
      return { skipped: true };
    }
    if (!verify.approved) {
      await logPaymentEvent(candidate.id, 'reconcile_not_approved', source, {
        transId: tx.transId, responseCode: verify.responseCode ?? null, status: verify.status || null,
      });
      return { skipped: true };
    }

    await logPaymentEvent(candidate.id, 'reconciled_from_gateway', source, {
      transId: tx.transId,
      gatewayStatus: verify.status || tx.status || null,
      submitTimeUTC: tx.submitTimeUTC || null,
      amountCents: verify.amountCents ?? null,
    });
    // Same entry point as the webhook. Amount mismatches, expired holds and
    // seat conflicts are all decided there (late payments can now reclaim a
    // seat that is still free; real conflicts still quarantine for review).
    const result = await markBookingPaid({
      bookingId: candidate.id,
      transactionId: tx.transId,
      authCode: verify.authCode,
      source,
      verifiedTransaction: verify,
    });
    if (result.ok) stats.confirmed += 1;
    else if (result.requiresReview) stats.reviewed += 1;
    return result;
  }

  async function runOnce({ reason = 'interval', includeSettled = false } = {}) {
    const source = 'gateway_reconciliation';
    const candidates = await loadPendingCandidates();
    if (candidates.length === 0) return { candidates: 0, confirmed: 0 };

    const unsettled = await paymentServices.listUnsettledTransactions();
    if (!unsettled.ok) {
      stats.errors += 1;
      stats.lastError = unsettled.error || 'unsettled_list_failed';
      stats.lastErrorAt = new Date(now()).toISOString();
      logger.warn?.(`[reconcile] unsettled transaction list failed (${reason}): ${stats.lastError}`);
      await noteGatewayFailure(reason);
      return { candidates: candidates.length, confirmed: 0, error: stats.lastError };
    }
    noteGatewaySuccess();

    let byInvoice = indexByInvoice(unsettled.transactions);
    let confirmed = 0;
    const unmatched = [];
    for (const candidate of candidates) {
      const matches = (byInvoice.get(candidate.reference_number) || [])
        .filter(tx => !IGNORED_STATUSES.has(String(tx.status || '')));
      if (matches.length === 0) { unmatched.push(candidate); continue; }
      // Newest approved transaction wins; markBookingPaid flags any second
      // charge on the same booking as a duplicate needing a refund.
      const approved = matches.filter(tx => APPROVED_STATUSES.has(String(tx.status || '')));
      const chosen = approved[0] || matches[0];
      const result = await confirmCandidate(candidate, chosen, { source });
      if (result?.ok) confirmed += 1;
    }

    // Settled-batch fallback: a booking still pending after the gateway
    // closed its daily batch will never show up in the unsettled list.
    const settledEvery = parseNumber(process.env.PAYMENT_RECONCILE_SETTLED_INTERVAL_MS, DEFAULT_SETTLED_SCAN_INTERVAL_MS);
    const oldestUnmatched = unmatched[0];
    const dueForSettledScan = includeSettled || (now() - lastSettledScanAt >= settledEvery);
    if (oldestUnmatched && dueForSettledScan && typeof paymentServices.listSettledTransactions === 'function') {
      lastSettledScanAt = now();
      const oldestAt = new Date(oldestUnmatched.payment_attempted_at || oldestUnmatched.created_at).getTime();
      const settled = await paymentServices.listSettledTransactions({
        firstSettlementDate: new Date(oldestAt - 6 * 3600 * 1000),
        lastSettlementDate: new Date(now()),
      });
      if (settled.ok) {
        byInvoice = indexByInvoice(settled.transactions);
        for (const candidate of unmatched) {
          const matches = (byInvoice.get(candidate.reference_number) || [])
            .filter(tx => APPROVED_STATUSES.has(String(tx.status || '')));
          if (matches.length === 0) continue;
          const result = await confirmCandidate(candidate, matches[0], { source: `${source}_settled` });
          if (result?.ok) confirmed += 1;
        }
      } else {
        stats.errors += 1;
        stats.lastError = settled.error || 'settled_list_failed';
        stats.lastErrorAt = new Date(now()).toISOString();
        logger.warn?.(`[reconcile] settled transaction scan failed: ${stats.lastError}`);
      }
    }

    if (confirmed > 0) {
      logger.info?.(`[reconcile] confirmed ${confirmed} pending booking(s) from the gateway (${reason})`);
    }
    return { candidates: candidates.length, confirmed };
  }

  // Serialised: overlapping timers / on-demand kicks share one run.
  function reconcilePendingPayments(options = {}) {
    if (running) return running;
    running = Promise.resolve()
      .then(() => runOnce(options))
      .catch(async err => {
        stats.errors += 1;
        stats.lastError = err?.message || String(err);
        stats.lastErrorAt = new Date(now()).toISOString();
        logger.error?.(`[reconcile] run failed: ${stats.lastError}`);
        await noteGatewayFailure('exception');
        return { candidates: 0, confirmed: 0, error: stats.lastError };
      })
      .finally(() => {
        running = null;
        lastRunAt = now();
        stats.runs += 1;
        stats.lastRunAt = new Date(lastRunAt).toISOString();
      });
    return running;
  }

  // On-demand kick from a waiting customer's status poll. Debounced so a
  // page polling every 2 seconds does not hammer the gateway.
  function requestReconciliation({ minGapMs = 15000, reason = 'status_poll' } = {}) {
    if (running) return running;
    if (now() - lastRunAt < minGapMs) return null;
    return reconcilePendingPayments({ reason });
  }

  return { reconcilePendingPayments, requestReconciliation, getStats: () => ({ ...stats }) };
}

export function startPaymentReconciliation(reconciler, { logger = console } = {}) {
  if (process.env.PAYMENT_RECONCILE_DISABLED === '1') {
    logger.warn?.('[reconcile] gateway reconciliation disabled by PAYMENT_RECONCILE_DISABLED=1');
    return null;
  }
  const intervalMs = Math.max(15000, parseNumber(process.env.PAYMENT_RECONCILE_INTERVAL_MS, 60000));
  const timer = setInterval(() => {
    reconciler.reconcilePendingPayments({ reason: 'interval' });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  // First pass shortly after boot so a deploy during a delayed-webhook
  // episode catches up immediately.
  const firstRun = setTimeout(() => reconciler.reconcilePendingPayments({ reason: 'startup', includeSettled: true }), 5000);
  if (typeof firstRun.unref === 'function') firstRun.unref();
  logger.info?.(`[reconcile] gateway payment reconciliation every ${Math.round(intervalMs / 1000)}s`);
  return timer;
}
