import { all, get, run, saveDb } from '../database.js';
import { logger } from '../logger.js';

export const DEFAULT_SESSION_HOLD_MINUTES = 20;
export const MAX_SESSION_HOLD_MINUTES = 20;
export const DEFAULT_PAYMENT_FAILURE_HOLD_MINUTES = 5;
export const MAX_PAYMENT_FAILURE_HOLD_MINUTES = 5;

function parsePositiveMinutes(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function resolveHoldConfig(env = process.env) {
  const configuredHoldMinutes = parsePositiveMinutes(
    env.SESSION_HOLD_MINUTES,
    DEFAULT_SESSION_HOLD_MINUTES
  );
  const configuredPaymentFailureHoldMinutes = parsePositiveMinutes(
    env.PAYMENT_FAILURE_HOLD_MINUTES,
    DEFAULT_PAYMENT_FAILURE_HOLD_MINUTES
  );

  return {
    configuredHoldMinutes,
    holdMinutes: Math.min(configuredHoldMinutes, MAX_SESSION_HOLD_MINUTES),
    maxHoldMinutes: MAX_SESSION_HOLD_MINUTES,
    configuredPaymentFailureHoldMinutes,
    paymentFailureHoldMinutes: Math.min(
      configuredPaymentFailureHoldMinutes,
      MAX_PAYMENT_FAILURE_HOLD_MINUTES
    ),
    maxPaymentFailureHoldMinutes: MAX_PAYMENT_FAILURE_HOLD_MINUTES,
  };
}

export function holdExpiresAt(minutes, now = Date.now()) {
  return new Date(now + minutes * 60 * 1000).toISOString();
}

export async function clearExpiredHolds() {
  const now = new Date().toISOString();
  return run(
    `UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL
     WHERE status = 'held' AND held_until < ?`,
    [now]
  );
}

export async function releaseExpiredHolds(io) {
  const result = await clearExpiredHolds();

  if (result.changes > 0) {
    logger.info('Released expired seat holds', { seats_released: result.changes });
    io.emit('seats:refresh');
  }
}

export async function shortenBookingSeatHolds({ bookingId, minutes, io }) {
  const { paymentFailureHoldMinutes } = resolveHoldConfig();
  const releaseAt = holdExpiresAt(minutes || paymentFailureHoldMinutes);
  const booking = await get('SELECT id, session_id FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { changedSeats: 0, releaseAt };

  const seats = await all(`
    SELECT s.id
    FROM seats s
    JOIN booking_items bi ON bi.seat_id = s.id
    WHERE bi.booking_id = ?
      AND s.status = 'held'
      AND (s.held_until IS NULL OR s.held_until > ?)
  `, [bookingId, releaseAt]);

  for (const seat of seats) {
    await run('UPDATE seats SET held_until = ? WHERE id = ?', [releaseAt, seat.id]);
  }

  if (seats.length > 0 && io) {
    io.to(`session:${booking.session_id}`).emit('seats:refresh', { sessionId: booking.session_id });
  }

  return { changedSeats: seats.length, releaseAt };
}

export async function shortenRequestedSeatHolds({ holderId, attendees, minutes, io }) {
  const { paymentFailureHoldMinutes } = resolveHoldConfig();
  const cleanHolderId = String(holderId || '').trim();
  const seatIds = [...new Set((attendees || []).map(att => String(att?.seatId || '').trim()).filter(Boolean))];
  const releaseAt = holdExpiresAt(minutes || paymentFailureHoldMinutes);
  if (!cleanHolderId || seatIds.length === 0) return { changedSeats: 0, releaseAt };

  try {
    const placeholders = seatIds.map(() => '?').join(',');
    const seats = await all(
      `SELECT id, session_id
       FROM seats
       WHERE id IN (${placeholders})
         AND status = 'held'
         AND held_by = ?
         AND (held_until IS NULL OR held_until > ?)`,
      [...seatIds, cleanHolderId, releaseAt]
    );

    const touchedSessions = new Set();
    for (const seat of seats) {
      await run('UPDATE seats SET held_until = ? WHERE id = ?', [releaseAt, seat.id]);
      if (seat.session_id) touchedSessions.add(seat.session_id);
    }

    if (seats.length > 0 && io) {
      for (const sessionId of touchedSessions) {
        io.to(`session:${sessionId}`).emit('seats:refresh', { sessionId });
      }
    }
    if (seats.length > 0) await saveDb();
    return { changedSeats: seats.length, releaseAt };
  } catch (err) {
    logger.error('Failed to shorten requested seat holds', { error: err?.message || String(err) });
    return { changedSeats: 0, releaseAt, error: err?.message || String(err) };
  }
}
