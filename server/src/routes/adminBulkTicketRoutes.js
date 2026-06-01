import { all, run, saveDb } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { sessionTypeSql } from '../services/sessionPackages.js';
import { formatPrice } from '../utils/format.js';

const BULK_PRINT_SESSION_TYPES = ['regular_bingo', 'special_bingo', 'event'];

function parseRequestedDepartments(value) {
  const rawValues = String(value || 'all')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (rawValues.length === 0 || rawValues.includes('all')) return BULK_PRINT_SESSION_TYPES;
  const selected = rawValues.filter(value => BULK_PRINT_SESSION_TYPES.includes(value));
  return selected.length > 0 ? [...new Set(selected)] : BULK_PRINT_SESSION_TYPES;
}

export function registerAdminBulkTicketRoutes(app, { logAudit }) {
  app.get('/api/admin/bookings/bulk-tickets', adminAuth, async (req, res) => {
    try {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom) return res.status(400).json({ error: 'dateFrom query parameter required' });

    const endDate = dateTo || dateFrom;
    const requestedDepartments = parseRequestedDepartments(req.query.department);

    let hasSpecialEvent = false;
    try {
      await all('SELECT is_special_event FROM sessions LIMIT 1');
      hasSpecialEvent = true;
    } catch (e) {
      // Older databases without event columns cannot return template tickets.
    }

    const specialCols = hasSpecialEvent ? `, s.is_special_event, s.event_title, ${sessionTypeSql('s')} as session_type` : '';
    const departmentPlaceholders = requestedDepartments.map(() => '?').join(',');
    const rows = await all(`
      SELECT b.id as booking_id, b.reference_number, b.total_amount, b.payment_status,
             s.id as session_id, s.date as session_date, s.time as session_time
             ${specialCols},
             bi.first_name, bi.last_name, bi.price as item_price,
             bi.id as booking_item_id,
             bi.reference_number as item_reference_number,
             bi.printed_at as item_printed_at,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      WHERE s.date >= ? AND s.date <= ? AND b.payment_status = 'paid'
        ${hasSpecialEvent ? `AND ${sessionTypeSql('s')} IN (${departmentPlaceholders})` : 'AND 1 = 0'}
      ORDER BY s.date ASC, s.time ASC, b.reference_number, seats.table_number, seats.chair_number
    `, hasSpecialEvent ? [dateFrom, endDate, ...requestedDepartments] : [dateFrom, endDate]);

    const sessions = {};
    for (const row of rows) {
      if (!sessions[row.session_id]) {
        sessions[row.session_id] = {
          sessionId: row.session_id,
          sessionDate: row.session_date,
          sessionTime: row.session_time,
          isSpecialEvent: !!(row.is_special_event),
          sessionType: row.session_type || (row.is_special_event ? 'special_bingo' : 'regular_bingo'),
          eventTitle: row.event_title || null,
          bookings: {}
        };
      }
      const session = sessions[row.session_id];
      if (!session.bookings[row.booking_id]) {
        session.bookings[row.booking_id] = {
          referenceNumber: row.reference_number,
          totalAmount: row.total_amount,
          totalFormatted: '$' + formatPrice(row.total_amount),
          tickets: []
        };
      }
      session.bookings[row.booking_id].tickets.push({
        id: row.booking_item_id,
        firstName: row.first_name,
        lastName: row.last_name,
        tableNumber: row.table_number,
        chairNumber: row.chair_number,
        referenceNumber: row.item_reference_number,
        printedAt: row.item_printed_at || null,
        packageName: row.package_name,
        packagePrice: row.package_price,
        packagePriceFormatted: '$' + formatPrice(row.package_price)
      });
    }

    const result = Object.values(sessions).map(session => ({
      ...session,
      bookings: Object.values(session.bookings)
    }));
    const totalTickets = result.reduce((sum, session) => sum + session.bookings.reduce((bookingSum, booking) => bookingSum + booking.tickets.length, 0), 0);

    res.json({
      dateFrom,
      dateTo: endDate,
      printMode: 'template',
      departments: requestedDepartments,
      sessions: result,
      totalTickets
    });
    } catch (err) {
      console.error('GET /api/admin/bookings/bulk-tickets failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/bookings/bulk-tickets/mark-printed', adminAuth, async (req, res) => {
    try {
    const ticketIds = Array.isArray(req.body?.ticketIds)
      ? req.body.ticketIds.map(id => String(id || '').trim()).filter(Boolean)
      : [];

    if (ticketIds.length === 0) {
      return res.status(400).json({ error: 'ticketIds array required' });
    }

    const uniqueIds = [...new Set(ticketIds)].slice(0, 1000);
    const placeholders = uniqueIds.map(() => '?').join(',');
    const now = new Date().toISOString();
    const result = await run(
      `UPDATE booking_items
       SET printed_at = ?
       WHERE id IN (${placeholders})
         AND booking_id IN (
           SELECT b.id
           FROM bookings b
           JOIN sessions s ON s.id = b.session_id
           WHERE b.payment_status = 'paid'
             AND ${sessionTypeSql('s')} IN ('regular_bingo', 'special_bingo', 'event')
             AND s.deleted_at IS NULL
         )`,
      [now, ...uniqueIds]
    );

    await logAudit('template_tickets_marked_printed', 'booking_items', 'bulk', {
      requested: uniqueIds.length,
      updated: result.changes,
    });

    await saveDb();
    res.json({ success: true, printedAt: now, updated: result.changes });
    } catch (err) {
      console.error('POST /api/admin/bookings/bulk-tickets/mark-printed failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
