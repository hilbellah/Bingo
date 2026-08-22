import { get, run } from '../database.js';
import { holdExpiresAt } from '../services/holds.js';
import { getSessionBookingStatus } from '../services/sessionBookingStatus.js';
import { getLiveEventCapacity, withSessionCapacityLock } from '../services/liveEventCapacity.js';

export function registerSeatRoutes(app, { bookingLimiter, holdMinutes, io }) {
  app.post('/api/seats/:seatId/lock', bookingLimiter, async (req, res) => {
    try {
      const { seatId } = req.params;
      const { holderId } = req.body;

      if (!holderId) return res.status(400).json({ error: 'holderId required' });

      const initialSeat = await get('SELECT * FROM seats WHERE id = ?', [seatId]);
      if (!initialSeat) return res.status(404).json({ error: 'Seat not found' });
      const result = await withSessionCapacityLock(initialSeat.session_id, async () => {
        const seat = await get('SELECT * FROM seats WHERE id = ?', [seatId]);
        const session = await get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL', [seat.session_id]);
        const bookingStatus = getSessionBookingStatus(session);
        if (bookingStatus.booking_closed) return { status: 409, body: { error: bookingStatus.booking_closed_message, bookingClosed: true, reason: bookingStatus.booking_closed_reason } };
        if (seat.is_disabled) return { status: 400, body: { error: 'Seat is disabled' } };
        if (seat.status === 'sold') return { status: 409, body: { error: 'Seat already sold' } };
        if (seat.status === 'held' && seat.held_by !== holderId && new Date(seat.held_until) > new Date()) {
          return { status: 409, body: { error: 'Seat held by another user' } };
        }
        const alreadyHeldByCustomer = seat.status === 'held' && seat.held_by === holderId && new Date(seat.held_until) > new Date();
        const capacity = await getLiveEventCapacity(session);
        if (!alreadyHeldByCustomer && capacity && capacity.remaining < 1) {
          return { status: 409, body: { error: 'This live event has reached its ticket limit.', bookingClosed: true, reason: 'sold_out' } };
        }
        const holdUntil = holdExpiresAt(holdMinutes);
        // Guarded write: markBookingPaid flips seats to 'sold' outside this
        // capacity lock, so re-assert the preconditions in the UPDATE itself
        // or a lock racing a payment could drag a sold seat back to 'held'.
        const locked = await run(
          `UPDATE seats SET status = 'held', held_by = ?, held_until = ?
           WHERE id = ? AND is_disabled = 0 AND status != 'sold'
             AND (status = 'vacant' OR held_by = ? OR held_until IS NULL OR held_until <= ?)`,
          [holderId, holdUntil, seatId, holderId, new Date().toISOString()]
        );
        if (locked.changes !== 1) {
          return { status: 409, body: { error: 'Seat is no longer available' } };
        }
        return { status: 200, body: { success: true, holdUntil }, seat, holdUntil };
      });
      if (result.status !== 200) return res.status(result.status).json(result.body);

      io.to(`session:${result.seat.session_id}`).emit('seat:locked', {
        seatId, holderId, holdUntil: result.holdUntil, sessionId: result.seat.session_id
      });

      res.json(result.body);
    } catch (err) {
      console.error('POST /api/seats/:seatId/lock failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/seats/:seatId/unlock', bookingLimiter, async (req, res) => {
    try {
      const { seatId } = req.params;
      const { holderId } = req.body;

      if (!holderId) return res.status(400).json({ error: 'holderId required' });
      const initialSeat = await get('SELECT id, session_id FROM seats WHERE id = ?', [seatId]);
      if (!initialSeat) return res.status(404).json({ error: 'Seat not found' });
      const result = await withSessionCapacityLock(initialSeat.session_id, async () => {
        const seat = await get('SELECT * FROM seats WHERE id = ?', [seatId]);
        if (!seat) return { status: 404, body: { error: 'Seat not found' } };
        const unlocked = await run(
          `UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL
           WHERE id = ? AND status = 'held' AND held_by = ?`,
          [seatId, holderId]
        );
        if (unlocked.changes !== 1) {
          return { status: 403, body: { error: 'Cannot unlock a seat you do not currently hold' } };
        }
        return { status: 200, body: { success: true }, seat };
      });
      if (result.status !== 200) return res.status(result.status).json(result.body);

      io.to(`session:${result.seat.session_id}`).emit('seat:unlocked', { seatId, sessionId: result.seat.session_id });

      res.json(result.body);
    } catch (err) {
      console.error('POST /api/seats/:seatId/unlock failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
