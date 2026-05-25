import { get, run } from '../database.js';
import { holdExpiresAt } from '../services/holds.js';
import { getSessionBookingStatus } from '../services/sessionBookingStatus.js';

export function registerSeatRoutes(app, { bookingLimiter, holdMinutes, io }) {
  app.post('/api/seats/:seatId/lock', bookingLimiter, async (req, res) => {
    try {
      const { seatId } = req.params;
      const { holderId } = req.body;

      if (!holderId) return res.status(400).json({ error: 'holderId required' });

      const seat = await get('SELECT * FROM seats WHERE id = ?', [seatId]);
      if (!seat) return res.status(404).json({ error: 'Seat not found' });
      const session = await get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL', [seat.session_id]);
      const bookingStatus = getSessionBookingStatus(session);
      if (bookingStatus.booking_closed) {
        return res.status(409).json({
          error: bookingStatus.booking_closed_message,
          bookingClosed: true,
          reason: bookingStatus.booking_closed_reason,
        });
      }
      if (seat.is_disabled) return res.status(400).json({ error: 'Seat is disabled' });
      if (seat.status === 'sold') return res.status(409).json({ error: 'Seat already sold' });
      if (seat.status === 'held' && seat.held_by !== holderId) {
        if (new Date(seat.held_until) > new Date()) {
          return res.status(409).json({ error: 'Seat held by another user' });
        }
      }

      const holdUntil = holdExpiresAt(holdMinutes);
      await run(`UPDATE seats SET status = 'held', held_by = ?, held_until = ? WHERE id = ?`,
        [holderId, holdUntil, seatId]);

      io.to(`session:${seat.session_id}`).emit('seat:locked', {
        seatId, holderId, holdUntil, sessionId: seat.session_id
      });

      res.json({ success: true, holdUntil });
    } catch (err) {
      console.error('POST /api/seats/:seatId/lock failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/seats/:seatId/unlock', async (req, res) => {
    try {
      const { seatId } = req.params;
      const { holderId } = req.body;

      const seat = await get('SELECT * FROM seats WHERE id = ?', [seatId]);
      if (!seat) return res.status(404).json({ error: 'Seat not found' });
      if (seat.status !== 'held' || seat.held_by !== holderId) {
        return res.status(403).json({ error: 'Cannot unlock seat you do not hold' });
      }

      await run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [seatId]);

      io.to(`session:${seat.session_id}`).emit('seat:unlocked', { seatId, sessionId: seat.session_id });

      res.json({ success: true });
    } catch (err) {
      console.error('POST /api/seats/:seatId/unlock failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
