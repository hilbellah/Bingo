import { all, get, run, saveDb } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { refundTransaction, verifyTransaction, voidTransaction } from '../services/payments.js';
import { formatPrice } from '../utils/format.js';

export function registerAdminBookingRoutes(app, {
  io,
  logAudit,
  getBookingItemRefundAmount,
  markBookingItemRefunded,
  markBookingRefunded,
  markBookingVoided,
}) {
  app.get('/api/admin/bookings', adminAuth, (req, res) => {
    const { sessionId } = req.query;
    let whereClause = '';
    const params = [];
    if (sessionId) { whereClause = 'WHERE b.session_id = ?'; params.push(sessionId); }

    const rows = all(`
      SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at, b.email,
             b.customer_first_name, b.customer_last_name,
             s.date as session_date, s.time as session_time,
             bi.id as item_id, bi.first_name, bi.last_name, bi.price as item_price,
             bi.reference_number as item_reference_number, bi.refund_status,
             bi.refunded_at, bi.refund_transaction_id, bi.refund_amount, bi.refund_action,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      ${whereClause}
      ORDER BY b.created_at DESC, b.id, bi.id
    `, params);

    const bookings = {};
    for (const row of rows) {
      if (!bookings[row.id]) {
        bookings[row.id] = {
          id: row.id,
          referenceNumber: row.reference_number,
          totalAmount: row.total_amount,
          totalFormatted: '$' + formatPrice(row.total_amount),
          paymentStatus: row.payment_status,
          createdAt: row.created_at,
          email: row.email,
          customerFirstName: row.customer_first_name,
          customerLastName: row.customer_last_name,
          sessionDate: row.session_date,
          sessionTime: row.session_time,
          items: []
        };
      }

      const addons = all(`
        SELECT ba.*, COALESCE(p.name, sp.name) as package_name FROM booking_addons ba
        LEFT JOIN packages p ON p.id = ba.package_id
        LEFT JOIN session_packages sp ON sp.id = ba.package_id WHERE ba.booking_item_id = ?
      `, [row.item_id]).map(addon => ({
        packageName: addon.package_name,
        quantity: addon.quantity,
        price: addon.price,
        priceFormatted: '$' + formatPrice(addon.price)
      }));

      bookings[row.id].items.push({
        id: row.item_id,
        firstName: row.first_name,
        lastName: row.last_name,
        tableNumber: row.table_number,
        chairNumber: row.chair_number,
        referenceNumber: row.item_reference_number,
        packageName: row.package_name,
        packagePrice: row.package_price,
        packagePriceFormatted: '$' + formatPrice(row.package_price),
        refundStatus: row.refund_status || 'active',
        refundedAt: row.refunded_at,
        refundTransactionId: row.refund_transaction_id,
        refundAmount: row.refund_amount || 0,
        refundAmountFormatted: '$' + formatPrice(row.refund_amount || 0),
        refundAction: row.refund_action,
        addons
      });
    }
    res.json(Object.values(bookings));
  });

  app.get('/api/admin/bookings/export', adminAuth, (req, res) => {
    const { sessionId } = req.query;
    let whereClause = '';
    const params = [];
    if (sessionId) { whereClause = 'WHERE b.session_id = ?'; params.push(sessionId); }

    const rows = all(`
      SELECT COALESCE(bi.reference_number, b.reference_number) as ticket_reference, b.total_amount, b.payment_status, b.created_at,
             b.email, b.customer_first_name, b.customer_last_name,
             s.date as session_date, s.time as session_time,
             bi.first_name, bi.last_name,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      ${whereClause}
      ORDER BY b.created_at DESC
    `, params);

    let csv = 'Reference,Session Date,Session Time,Customer First Name,Customer Last Name,Email,First Name,Last Name,Table,Chair,Package,Package Price,Total Amount,Payment Status,Booked At\n';
    for (const row of rows) {
      csv += `${row.ticket_reference},${row.session_date},${row.session_time},${row.customer_first_name || ''},${row.customer_last_name || ''},${row.email || ''},${row.first_name},${row.last_name},${row.table_number},${row.chair_number},${row.package_name},$${formatPrice(row.package_price)},$${formatPrice(row.total_amount)},${row.payment_status},${row.created_at}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings-report.csv');
    res.send(csv);
  });

  app.post('/api/admin/bookings/:id/cancel', adminAuth, (req, res) => {
    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const items = all('SELECT bi.*, seats.table_number, seats.chair_number FROM booking_items bi JOIN seats ON seats.id = bi.seat_id WHERE bi.booking_id = ?', [req.params.id]);
    for (const item of items) {
      run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
    }
    run("UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?", [req.params.id]);

    logAudit('booking_cancelled', 'booking', req.params.id, {
      referenceNumber: booking.reference_number,
      sessionId: booking.session_id,
      totalAmount: booking.total_amount,
      attendees: items.map(item => ({
        name: `${item.first_name} ${item.last_name}`,
        table: item.table_number,
        chair: item.chair_number
      }))
    });

    io.to(`session:${booking.session_id}`).emit('seats:refresh');
    saveDb();
    res.json({ success: true });
  });

  app.post('/api/admin/bookings/clear-test-data', adminAuth, (req, res) => {
    if (process.env.ANET_ENV === 'production' || process.env.NODE_ENV !== 'production') {
      return res.status(403).json({
        error: 'clear_test_data_disabled',
        message: 'Bulk booking cleanup is only enabled on deployed sandbox services.',
      });
    }

    const summary = get(`
      SELECT
        COUNT(*) as booking_count,
        COALESCE(SUM(total_amount), 0) as total_amount
      FROM bookings
    `);
    const statuses = all(`
      SELECT payment_status, COUNT(*) as count
      FROM bookings
      GROUP BY payment_status
      ORDER BY payment_status
    `);
    const items = all('SELECT seat_id FROM booking_items');
    const sessionRows = all('SELECT DISTINCT session_id FROM bookings');

    for (const item of items) {
      run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
    }

    logAudit('booking_test_data_cleared', 'booking', 'sandbox_clear', {
      bookingCount: summary?.booking_count || 0,
      releasedSeats: items.length,
      totalAmount: summary?.total_amount || 0,
      statuses,
      clearedBy: req.adminUser?.email || null,
    });

    run('DELETE FROM payment_events');
    run('DELETE FROM email_verifications');
    run('DELETE FROM customers');
    run('DELETE FROM booking_addons');
    run('DELETE FROM booking_items');
    run('DELETE FROM bookings');

    for (const row of sessionRows) {
      io.to(`session:${row.session_id}`).emit('seats:refresh');
    }
    io.to('admin:receipts').emit('bookings:cleared');
    saveDb();

    res.json({
      ok: true,
      deletedBookings: summary?.booking_count || 0,
      releasedSeats: items.length,
      clearedAmountFormatted: '$' + formatPrice(summary?.total_amount || 0),
    });
  });

  app.delete('/api/admin/bookings/:id', adminAuth, (req, res) => {
    const identifier = req.params.id;
    const booking = get(
      'SELECT * FROM bookings WHERE id = ? OR reference_number = ?',
      [identifier, identifier]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const deletableStatuses = new Set(['pending', 'failed', 'cancelled']);
    if (!deletableStatuses.has(booking.payment_status)) {
      return res.status(409).json({
        error: 'booking_not_deletable',
        message: `Only pending, failed, or cancelled test bookings can be deleted. Booking ${booking.reference_number} is '${booking.payment_status}'. Use refund/void for paid transactions.`,
      });
    }

    const items = all('SELECT id, seat_id, first_name, last_name FROM booking_items WHERE booking_id = ?', [booking.id]);
    for (const item of items) {
      run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
    }

    logAudit('booking_deleted', 'booking', booking.id, {
      referenceNumber: booking.reference_number,
      sessionId: booking.session_id,
      paymentStatus: booking.payment_status,
      totalAmount: booking.total_amount,
      attendees: items.map(item => ({ firstName: item.first_name, lastName: item.last_name })),
    });

    run('DELETE FROM payment_events WHERE booking_id = ?', [booking.id]);
    run('DELETE FROM booking_addons WHERE booking_item_id IN (SELECT id FROM booking_items WHERE booking_id = ?)', [booking.id]);
    run('DELETE FROM booking_items WHERE booking_id = ?', [booking.id]);
    run('DELETE FROM bookings WHERE id = ?', [booking.id]);

    io.to(`session:${booking.session_id}`).emit('seats:refresh');
    saveDb();

    res.json({
      ok: true,
      deleted: booking.reference_number,
      releasedSeats: items.length,
    });
  });

  app.post('/api/admin/booking-items/:id/refund', adminAuth, async (req, res) => {
    const item = get(`
      SELECT bi.*, b.id as booking_id, b.reference_number as booking_reference,
             b.payment_status, b.transaction_id, b.total_amount
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.id = ?
    `, [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Ticket not found' });

    if (item.refund_status === 'refunded') {
      return res.status(400).json({ error: 'This ticket has already been refunded.' });
    }
    if (!['paid', 'partially_refunded'].includes(item.payment_status)) {
      return res.status(400).json({ error: `Cannot refund a ticket from booking status '${item.payment_status}'.` });
    }
    if (!item.transaction_id) {
      return res.status(400).json({
        error: 'This booking has no transaction_id (likely created before payment integration). Use Cancel for legacy bookings.'
      });
    }

    const amountCents = getBookingItemRefundAmount(item.id);
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'Could not determine the ticket refund amount.' });
    }

    const activeItems = get(`
      SELECT COUNT(*) as count
      FROM booking_items
      WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'
    `, [item.booking_id])?.count || 0;

    const verify = await verifyTransaction(item.transaction_id);
    if (!verify.ok) {
      return res.status(502).json({ error: `Could not verify transaction state: ${verify.error}` });
    }

    const txStatus = String(verify.status || '');
    let action;
    let result;

    if (txStatus === 'capturedPendingSettlement' || txStatus === 'authorizedPendingCapture') {
      if (activeItems > 1) {
        return res.status(400).json({
          error: 'This payment has not settled yet, so Authorize.Net can only void the full booking. Partial ticket refunds are available after settlement.'
        });
      }
      action = 'void';
      result = await voidTransaction(item.transaction_id);
    } else if (txStatus === 'settledSuccessfully' || txStatus === 'settlementError') {
      action = 'refund';
      if (!verify.last4) {
        return res.status(502).json({ error: 'Could not determine card last 4 for refund - Authorize.Net API did not return card details.' });
      }
      result = await refundTransaction({
        transId: item.transaction_id,
        amountCents,
        last4: verify.last4,
      });
    } else {
      return res.status(400).json({
        error: `Cannot refund: transaction is in status '${txStatus}'. It may already be refunded or voided.`
      });
    }

    if (!result.ok) {
      return res.status(502).json({ error: `${action} failed: ${result.error}` });
    }

    const markResult = markBookingItemRefunded({
      bookingId: item.booking_id,
      bookingItemId: item.id,
      transactionId: item.transaction_id,
      refundTransactionId: result.refundTransId || result.voidTransId,
      amountCents,
      action,
      source: 'admin',
    });
    if (!markResult.ok) {
      return res.status(500).json({ error: markResult.error || 'Refund was processed but ticket status could not be updated.' });
    }

    res.json({
      ok: true,
      action,
      refundTransId: result.refundTransId || result.voidTransId,
      amountCents,
      amountFormatted: '$' + formatPrice(amountCents),
      seatsReleased: markResult.releasedSeats || 0,
      bookingStatus: markResult.bookingStatus,
    });
  });

  app.post('/api/admin/bookings/:id/refund', adminAuth, async (req, res) => {
    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.payment_status !== 'paid') {
      return res.status(400).json({ error: `Cannot refund a booking with status '${booking.payment_status}'. Only 'paid' bookings can be refunded.` });
    }
    if (!booking.transaction_id) {
      return res.status(400).json({
        error: 'This booking has no transaction_id (likely created via the legacy /api/bookings endpoint before payment integration). Use Cancel instead.'
      });
    }

    const verify = await verifyTransaction(booking.transaction_id);
    if (!verify.ok) {
      return res.status(502).json({ error: `Could not verify transaction state: ${verify.error}` });
    }

    const txStatus = String(verify.status || '');
    let action;
    let result;
    let markResult;

    if (txStatus === 'capturedPendingSettlement' || txStatus === 'authorizedPendingCapture') {
      action = 'void';
      result = await voidTransaction(booking.transaction_id);
      if (result.ok) {
        markResult = markBookingVoided({
          bookingId: booking.id,
          transactionId: booking.transaction_id,
          voidTransactionId: result.voidTransId,
          source: 'admin',
        });
      }
    } else if (txStatus === 'settledSuccessfully' || txStatus === 'settlementError') {
      action = 'refund';
      if (!verify.last4) {
        return res.status(502).json({ error: 'Could not determine card last 4 for refund - Authorize.Net API did not return card details.' });
      }
      result = await refundTransaction({
        transId: booking.transaction_id,
        amountCents: booking.total_amount,
        last4: verify.last4,
      });
      if (result.ok) {
        markResult = markBookingRefunded({
          bookingId: booking.id,
          transactionId: booking.transaction_id,
          refundTransactionId: result.refundTransId,
          source: 'admin',
        });
      }
    } else {
      return res.status(400).json({
        error: `Cannot refund: transaction is in status '${txStatus}'. It may already be refunded or voided.`
      });
    }

    if (!result.ok) {
      return res.status(502).json({ error: `${action} failed: ${result.error}` });
    }

    res.json({
      ok: true,
      action,
      refundTransId: result.refundTransId || result.voidTransId,
      seatsReleased: markResult?.releasedSeats || 0,
    });
  });
}
