// Protection for checkouts that are "in flight": the customer has been sent to
// the card form (a hosted-payment token was issued) and the booking has not
// yet reached a final state. Money may be moving for these seats at any
// moment, so two things must never happen to them:
//
//   1. an admin action (disable seat, assign a promo ticket, move a ticket,
//      delete the session) taking the seat away underneath the customer;
//   2. the seat going back on sale while the gateway is degraded and we cannot
//      see whether the customer paid.
//
// Both were possible before 2026-09-05 and both end the same way as the
// Sept 4 incident: a charged customer with no seat.

import { v4 as uuid } from 'uuid';
import { all, run, saveDb } from '../database.js';
import { holdExpiresAt } from './holds.js';

const DEFAULT_WINDOW_MINUTES = 30;
const DEFAULT_PROTECT_MINUTES = 60;
const DEFAULT_PROTECT_LOOKBACK_HOURS = 24;

function positiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** How long after reaching the card form a checkout counts as in flight. */
export function inFlightWindowMinutes() {
  return positiveInt(process.env.CHECKOUT_INFLIGHT_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES, 240);
}

/**
 * Pending bookings that reached the card form recently, optionally narrowed to
 * a session or a set of seats. Each entry lists the seats the checkout holds.
 */
export async function findInFlightCheckouts({ sessionId = null, seatIds = null, windowMinutes = inFlightWindowMinutes() } = {}) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const params = [since];
  let where = `b.payment_status = 'pending'
      AND b.hosted_token IS NOT NULL
      AND COALESCE(b.payment_attempted_at, b.created_at) >= ?`;
  if (sessionId) { where += ' AND b.session_id = ?'; params.push(sessionId); }
  if (Array.isArray(seatIds) && seatIds.length > 0) {
    where += ` AND bi.seat_id IN (${seatIds.map(() => '?').join(',')})`;
    params.push(...seatIds);
  }
  const rows = await all(
    `SELECT b.id, b.reference_number, b.session_id, b.payment_attempted_at, bi.seat_id
     FROM bookings b
     JOIN booking_items bi ON bi.booking_id = b.id
     WHERE ${where}
     ORDER BY b.payment_attempted_at`,
    params
  );
  const byBooking = new Map();
  for (const row of rows) {
    const entry = byBooking.get(row.id) || { bookingId: row.id, referenceNumber: row.reference_number, sessionId: row.session_id, startedAt: row.payment_attempted_at, seatIds: [] };
    entry.seatIds.push(row.seat_id);
    byBooking.set(row.id, entry);
  }
  return [...byBooking.values()];
}

/** 409 body explaining why an admin action was refused. */
export function checkoutGuardResponse(inFlight, action) {
  const refs = inFlight.map(entry => entry.referenceNumber);
  return {
    error: 'checkout_in_progress',
    message: `${action}: ${inFlight.length} customer checkout${inFlight.length === 1 ? ' is' : 's are'} in progress on the affected seat(s) (${refs.join(', ')}). ` +
      `Wait for them to finish or expire (up to ${inFlightWindowMinutes()} minutes). A super user can override with ?force=1 if you are sure the customer is not paying.`,
    bookings: refs,
    retryAfterMinutes: inFlightWindowMinutes(),
  };
}

/** Super users may override a guard explicitly; the override is audit-logged by the caller. */
export function canOverrideCheckoutGuard(req) {
  return String(req.query?.force || '') === '1' && !!req.adminUser?.isSuperUser;
}

/**
 * Degraded-gateway protection. While we cannot ask the gateway which pending
 * checkouts were paid, keep every in-flight checkout's seats off the market:
 * push their holds out, and re-hold seats the sweeper already released. Seats
 * that someone else actively holds or has bought are left alone (the payment
 * state machine will quarantine such a payment for staff, as before).
 */
export async function protectInFlightCheckoutHolds({
  minutes = positiveInt(process.env.CHECKOUT_PROTECT_MINUTES, DEFAULT_PROTECT_MINUTES, 240),
  lookbackHours = DEFAULT_PROTECT_LOOKBACK_HOURS,
  reason = 'gateway_degraded',
} = {}) {
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  const target = holdExpiresAt(minutes);
  const rows = await all(
    `SELECT b.id AS booking_id, b.reference_number, b.checkout_holder_id,
            bi.seat_id, s.status, s.held_by, s.held_until, s.is_disabled
     FROM bookings b
     JOIN booking_items bi ON bi.booking_id = b.id
     JOIN seats s ON s.id = bi.seat_id
     WHERE b.payment_status = 'pending'
       AND b.hosted_token IS NOT NULL
       AND COALESCE(b.payment_attempted_at, b.created_at) >= ?`,
    [since]
  );

  let extended = 0;
  let reheld = 0;
  let skipped = 0;
  const touched = new Set();
  for (const row of rows) {
    const holder = String(row.checkout_holder_id || '').trim() || null;
    if (row.status === 'held' && (!holder || row.held_by === holder)) {
      if (!row.held_until || row.held_until < target) {
        const result = holder
          ? await run(`UPDATE seats SET held_until = ? WHERE id = ? AND status = 'held' AND held_by = ?`, [target, row.seat_id, holder])
          : await run(`UPDATE seats SET held_until = ? WHERE id = ? AND status = 'held'`, [target, row.seat_id]);
        if (Number(result?.changes || 0) > 0) { extended += 1; touched.add(row.reference_number); }
      }
    } else if (row.status === 'vacant' && holder && Number(row.is_disabled) !== 1) {
      const result = await run(
        `UPDATE seats SET status = 'held', held_by = ?, held_until = ? WHERE id = ? AND status = 'vacant'`,
        [holder, target, row.seat_id]
      );
      if (Number(result?.changes || 0) > 0) { reheld += 1; touched.add(row.reference_number); } else skipped += 1;
    } else {
      skipped += 1;
    }
  }

  if (extended > 0 || reheld > 0) {
    await saveDb();
    await run(
      `INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'gateway_degraded_holds_protected', 'payments', 'reconciler', ?, ?)`,
      [uuid(), JSON.stringify({ reason, minutes, extended, reheld, skipped, bookings: [...touched].slice(0, 50) }), new Date().toISOString()]
    );
  }
  return { extended, reheld, skipped, until: target };
}
