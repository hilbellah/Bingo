import { all, get } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { getNextPhdSessionId, getPhdInventoryForSession } from '../services/phdInventory.js';
import { getSalesReportCutoff, setSalesReportCutoff } from '../services/salesReporting.js';
import { sessionTypeSql } from '../services/sessionPackages.js';
import { clearExpiredHolds } from '../services/holds.js';
import { formatLocalDate, formatPrice } from '../utils/format.js';

async function addSalesCutoff(where, params, expression) {
  const cutoff = await getSalesReportCutoff();
  if (cutoff) {
    where.push(`datetime(${expression}) >= datetime(?)`);
    params.push(cutoff);
  }
  return cutoff;
}

export function registerAdminReportRoutes(app) {
  app.get('/api/admin/dashboard', adminAuth, async (req, res) => {
    try {
      await clearExpiredHolds();
      const today = formatLocalDate(new Date());
      const dateFrom = req.query.dateFrom || req.query.date || today;
      const dateTo = req.query.dateTo || dateFrom;
      const cutoff = await getSalesReportCutoff();
      const bookingCutoffSql = cutoff ? " AND datetime(COALESCE(b.payment_completed_at, b.created_at)) >= datetime(?)" : '';
      const bookingCutoffParams = cutoff ? [cutoff] : [];
      const todayBookings = await get(
        `SELECT COUNT(DISTINCT b.id) as count
         FROM bookings b
         JOIN sessions s ON b.session_id = s.id
         WHERE s.date >= ? AND s.date <= ?
           AND b.payment_status IN ('paid', 'partially_refunded')
           ${bookingCutoffSql}`, [dateFrom, dateTo, ...bookingCutoffParams]
      );
      const todayRevenue = await get(
        `SELECT COALESCE(SUM(bi.price + COALESCE(addons.addon_total, 0)), 0) as total
         FROM bookings b
         JOIN sessions s ON b.session_id = s.id
         JOIN booking_items bi ON bi.booking_id = b.id
         LEFT JOIN (
           SELECT booking_item_id, SUM(price) as addon_total
           FROM booking_addons
           GROUP BY booking_item_id
         ) addons ON addons.booking_item_id = bi.id
         WHERE s.date >= ? AND s.date <= ?
           AND b.payment_status IN ('paid', 'partially_refunded')
           AND COALESCE(bi.refund_status, 'active') != 'refunded'
           ${bookingCutoffSql}`, [dateFrom, dateTo, ...bookingCutoffParams]
      );
      const upcomingSessions = await all(
        `SELECT s.*,
          (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'vacant' AND is_disabled = 0) as available,
          (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'sold') as sold,
          (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'held') as held,
          (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND is_disabled = 0) as total
        FROM sessions s WHERE s.date >= ? AND s.deleted_at IS NULL ORDER BY s.date ASC LIMIT 7`, [today]
      );

      const seatMetrics = await get(
        `SELECT
          COUNT(DISTINCT CASE WHEN st.is_disabled = 0 THEN st.table_number END) as totalTables,
          COUNT(CASE WHEN st.is_disabled = 0 THEN 1 END) as totalChairs,
          COUNT(CASE WHEN st.status = 'vacant' AND st.is_disabled = 0 THEN 1 END) as availableChairs,
          COUNT(CASE WHEN st.status = 'sold' THEN 1 END) as soldChairs,
          COUNT(CASE WHEN st.status = 'held' THEN 1 END) as heldChairs
        FROM seats st
        JOIN sessions s ON st.session_id = s.id
        WHERE s.date >= ? AND s.date <= ? AND s.deleted_at IS NULL`, [dateFrom, dateTo]
      );

      const tableBreakdown = await all(
        `SELECT st.table_number,
          COUNT(CASE WHEN st.status = 'vacant' AND st.is_disabled = 0 THEN 1 END) as vacant,
          COUNT(CASE WHEN st.status = 'sold' THEN 1 END) as sold,
          COUNT(CASE WHEN st.status = 'held' THEN 1 END) as held,
          COUNT(CASE WHEN st.is_disabled = 0 THEN 1 END) as total
        FROM seats st
        JOIN sessions s ON st.session_id = s.id
        WHERE s.date >= ? AND s.date <= ? AND s.deleted_at IS NULL AND st.is_disabled = 0
        GROUP BY st.session_id, st.table_number`, [dateFrom, dateTo]
      );

      let availableTables = 0;
      let partialTables = 0;
      let fullTables = 0;
      for (const table of tableBreakdown) {
        if (table.sold === 0 && table.held === 0) availableTables++;
        else if (table.vacant === 0) fullTables++;
        else partialTables++;
      }

      const personsCount = await get(
        `SELECT COUNT(*) as count FROM booking_items bi
         JOIN bookings b ON bi.booking_id = b.id
         JOIN sessions s ON b.session_id = s.id
         WHERE s.date >= ? AND s.date <= ?
           AND b.payment_status IN ('paid', 'partially_refunded')
           AND COALESCE(bi.refund_status, 'active') != 'refunded'
           ${bookingCutoffSql}`, [dateFrom, dateTo, ...bookingCutoffParams]
      );

      const phdSessionRow = await get(
        `SELECT id FROM sessions
         WHERE date >= ? AND is_available = 1 AND deleted_at IS NULL
         ORDER BY date ASC, time ASC
         LIMIT 1`,
        [dateFrom]
      );
      const phdSessionId = phdSessionRow?.id || await getNextPhdSessionId();
      const phdInventory = await getPhdInventoryForSession(phdSessionId);

      res.json({
        dateFrom,
        dateTo,
        todayBookings: todayBookings?.count || 0,
        todayRevenue: todayRevenue?.total || 0,
        todayRevenueFormatted: '$' + formatPrice(todayRevenue?.total || 0),
        salesReportCutoffAt: cutoff,
        upcomingSessions,
        totalTables: seatMetrics?.totalTables || 0,
        totalChairs: seatMetrics?.totalChairs || 0,
        availableChairs: seatMetrics?.availableChairs || 0,
        soldChairs: seatMetrics?.soldChairs || 0,
        heldChairs: seatMetrics?.heldChairs || 0,
        availableTables,
        partialTables,
        fullTables,
        totalPersons: personsCount?.count || 0,
        phdInventory,
      });
    } catch (err) {
      console.error('GET /api/admin/dashboard failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/daily-sales', adminAuth, async (req, res) => {
    try {
      const date = req.query.date || formatLocalDate(new Date());
      const search = (req.query.search || '').trim().toLowerCase();
      const cutoff = await getSalesReportCutoff();
      const cutoffSql = cutoff ? "AND datetime(COALESCE(b.payment_completed_at, b.created_at)) >= datetime(?)" : '';
      const cutoffParams = cutoff ? [cutoff] : [];
      const rows = await all(`
        SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at,
               b.email, b.customer_first_name, b.customer_last_name,
               s.date as session_date, s.time as session_time,
               s.is_special_event, s.event_title,
               bi.id as item_id, bi.first_name, bi.last_name, bi.price as item_price,
               bi.reference_number as item_reference_number, bi.refund_status,
               bi.refunded_at, bi.refund_transaction_id, bi.refund_amount, bi.refund_action,
               seats.table_number, seats.chair_number,
               COALESCE(p.name, sp.name) as package_name
        FROM bookings b
        JOIN sessions s ON b.session_id = s.id
        JOIN booking_items bi ON bi.booking_id = b.id
        JOIN seats ON seats.id = bi.seat_id
        LEFT JOIN packages p ON p.id = bi.package_id
        LEFT JOIN session_packages sp ON sp.id = bi.package_id
        WHERE s.date = ?
          AND b.payment_status IN ('paid', 'partially_refunded')
          AND COALESCE(bi.refund_status, 'active') != 'refunded'
          ${cutoffSql}
        ORDER BY b.created_at ASC, b.id, bi.id
      `, [date, ...cutoffParams]);

      const allAddons = await all(`
        SELECT ba.booking_item_id, ba.quantity, ba.price,
               COALESCE(p.name, sp.name) as package_name
        FROM booking_addons ba
        LEFT JOIN packages p ON p.id = ba.package_id
        LEFT JOIN session_packages sp ON sp.id = ba.package_id
        JOIN booking_items bi ON bi.id = ba.booking_item_id
        JOIN bookings b ON b.id = bi.booking_id
        JOIN sessions s ON s.id = b.session_id
        WHERE s.date = ?
          AND b.payment_status IN ('paid', 'partially_refunded')
          AND COALESCE(bi.refund_status, 'active') != 'refunded'
          ${cutoffSql}
      `, [date, ...cutoffParams]);
      const addonsByItem = {};
      for (const addon of allAddons) {
        if (!addonsByItem[addon.booking_item_id]) addonsByItem[addon.booking_item_id] = [];
        addonsByItem[addon.booking_item_id].push({
          packageName: addon.package_name,
          quantity: addon.quantity,
          price: addon.price,
          priceFormatted: '$' + formatPrice(addon.price)
        });
      }

      const bookingSubtotals = await all(`
        SELECT b.id as booking_id, b.total_amount,
               COUNT(bi.id) as ticket_count,
               COALESCE(SUM(bi.price + COALESCE(addons.addon_total, 0)), 0) as item_subtotal
        FROM bookings b
        JOIN sessions s ON s.id = b.session_id
        JOIN booking_items bi ON bi.booking_id = b.id
        LEFT JOIN (
          SELECT booking_item_id, SUM(price) as addon_total
          FROM booking_addons
          GROUP BY booking_item_id
        ) addons ON addons.booking_item_id = bi.id
        WHERE s.date = ?
          AND b.payment_status IN ('paid', 'partially_refunded')
          ${cutoffSql}
        GROUP BY b.id, b.total_amount
      `, [date, ...cutoffParams]);
      const serviceChargeByBooking = {};
      const ticketCountByBooking = {};
      for (const booking of bookingSubtotals) {
        const ticketCount = Number(booking.ticket_count) || 0;
        ticketCountByBooking[booking.booking_id] = ticketCount;
        serviceChargeByBooking[booking.booking_id] = Math.max(
          0,
          (Number(booking.total_amount) || 0) - (Number(booking.item_subtotal) || 0)
        );
      }

      const filtered = search
        ? rows.filter(row => {
            const fullName = `${row.first_name} ${row.last_name}`.toLowerCase();
            return fullName.includes(search) || row.reference_number.toLowerCase().includes(search);
          })
        : rows;

      const items = filtered.map((row, index) => {
        const addons = addonsByItem[row.item_id] || [];
        const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
        const itemTotal = row.item_price + addonTotal;
        return {
          rowNum: index + 1,
          id: row.item_id,
          bookingId: row.id,
          referenceNumber: row.item_reference_number || row.reference_number,
          firstName: row.first_name,
          lastName: row.last_name,
          tableNumber: row.table_number,
          chairNumber: row.chair_number,
          packageName: row.package_name,
          description: row.is_special_event && row.event_title ? row.event_title : `Bingo Session ${row.session_time}`,
          sessionDate: row.session_date,
          sessionTime: row.session_time,
          itemPrice: row.item_price,
          itemPriceFormatted: '$' + formatPrice(row.item_price),
          totalAmount: itemTotal,
          totalFormatted: '$' + formatPrice(itemTotal),
          addons,
          createdAt: row.created_at
        };
      });

      const uniqueBookings = new Set(filtered.map(row => row.id));
      const selectedTicketsByBooking = filtered.reduce((acc, row) => {
        acc[row.id] = (acc[row.id] || 0) + 1;
        return acc;
      }, {});
      const packageSubtotal = items.reduce((sum, item) => sum + item.itemPrice, 0);
      const addonSubtotal = items.reduce((sum, item) => sum + (item.addons ? item.addons.reduce((addonSum, addon) => addonSum + addon.price, 0) : 0), 0);
      const subtotalWithoutServiceCharges = packageSubtotal + addonSubtotal;
      const serviceChargeSubtotal = Array.from(uniqueBookings).reduce((sum, bookingId) => {
        const serviceCharge = serviceChargeByBooking[bookingId] || 0;
        const ticketCount = ticketCountByBooking[bookingId] || 0;
        const selectedTicketCount = selectedTicketsByBooking[bookingId] || 0;
        if (serviceCharge <= 0 || ticketCount <= 0 || selectedTicketCount <= 0) return sum;
        if (selectedTicketCount >= ticketCount) return sum + serviceCharge;
        return sum + Math.round((serviceCharge * selectedTicketCount) / ticketCount);
      }, 0);
      const grandTotal = subtotalWithoutServiceCharges + serviceChargeSubtotal;

      res.json({
        date,
        salesReportCutoffAt: cutoff,
        items,
        totalTickets: items.length,
        totalBookings: uniqueBookings.size,
        grandTotal,
        grandTotalFormatted: '$' + formatPrice(grandTotal),
        subtotalWithoutServiceCharges,
        subtotalWithoutServiceChargesFormatted: '$' + formatPrice(subtotalWithoutServiceCharges),
        serviceChargeSubtotal,
        serviceChargeSubtotalFormatted: '$' + formatPrice(serviceChargeSubtotal),
        totalWithServiceCharges: grandTotal,
        totalWithServiceChargesFormatted: '$' + formatPrice(grandTotal),
        packageSubtotal,
        packageSubtotalFormatted: '$' + formatPrice(packageSubtotal),
        addonSubtotal,
        addonSubtotalFormatted: '$' + formatPrice(addonSubtotal)
      });
    } catch (err) {
      console.error('GET /api/admin/daily-sales failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/transactions', adminAuth, async (req, res) => {
    try {
      const status = String(req.query.status || 'all').trim().toLowerCase();
      const dateFrom = String(req.query.dateFrom || '').trim();
      const dateTo = String(req.query.dateTo || '').trim();
      const search = String(req.query.search || '').trim().toLowerCase();

      const where = [];
      const params = [];
      const cutoff = await addSalesCutoff(where, params, 'transaction_at');
      if (dateFrom) {
        where.push('substr(transaction_at, 1, 10) >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        where.push('substr(transaction_at, 1, 10) <= ?');
        params.push(dateTo);
      }
      if (status && status !== 'all') {
        if (status === 'refunds') {
          where.push("payment_status IN ('refunded', 'voided', 'partially_refunded')");
        } else if (status === 'paid') {
          where.push("payment_status IN ('paid', 'partially_refunded')");
        } else {
          where.push('payment_status = ?');
          params.push(status);
        }
      }
      if (search) {
        where.push(`(
          LOWER(reference_number) LIKE ?
          OR LOWER(COALESCE(email, '')) LIKE ?
          OR LOWER(COALESCE(customer_first_name, '')) LIKE ?
          OR LOWER(COALESCE(customer_last_name, '')) LIKE ?
          OR LOWER(COALESCE(transaction_id, '')) LIKE ?
          OR LOWER(COALESCE(event_title, '')) LIKE ?
        )`);
        const like = `%${search}%`;
        params.push(like, like, like, like, like, like);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await all(`
        WITH payment_event_rollup AS (
          SELECT
            booking_id,
            MAX(created_at) as latest_event_at,
            SUM(CASE WHEN event_type = 'refunded' THEN 1 ELSE 0 END) as refund_events,
            SUM(CASE WHEN event_type = 'voided' THEN 1 ELSE 0 END) as void_events
          FROM payment_events
          GROUP BY booking_id
        ),
        transaction_rows AS (
          SELECT
            b.id,
            b.reference_number,
            b.total_amount,
            b.payment_status,
            b.created_at,
            b.email,
            b.customer_first_name,
            b.customer_last_name,
            b.transaction_id,
            b.payment_completed_at,
            s.date as session_date,
            s.time as session_time,
            s.is_special_event,
            s.event_title,
            ${sessionTypeSql('s')} as session_type,
            COALESCE(per.latest_event_at, b.payment_completed_at, b.created_at) as transaction_at,
            per.latest_event_at,
            per.refund_events,
            per.void_events,
            (
              SELECT pe.event_type
              FROM payment_events pe
              WHERE pe.booking_id = b.id
              ORDER BY pe.created_at DESC
              LIMIT 1
            ) as latest_event_type
          FROM bookings b
          JOIN sessions s ON s.id = b.session_id
          LEFT JOIN payment_event_rollup per ON per.booking_id = b.id
        )
        SELECT *
        FROM transaction_rows
        ${whereClause}
        ORDER BY transaction_at DESC, created_at DESC
        LIMIT 1000
      `, params);

      const rowBookingIds = new Set(rows.map(row => row.id));
      const partialRefundByBooking = {};
      const refundedEvents = await all(`
        SELECT booking_id, raw_payload
        FROM payment_events
        WHERE event_type = 'refunded'
      `);
      const partialRefundEvents = refundedEvents.reduce((sum, event) => {
        if (!rowBookingIds.has(event.booking_id)) return sum;
        try {
          const payload = event.raw_payload ? JSON.parse(event.raw_payload) : null;
          if (!payload?.partial) return sum;
          const amount = Number(payload.amountCents || 0);
          partialRefundByBooking[event.booking_id] = (partialRefundByBooking[event.booking_id] || 0) + amount;
          return sum + amount;
        } catch {
          return sum;
        }
      }, 0);
      const paidStatuses = new Set(['paid', 'partially_refunded', 'refunded', 'voided']);
      const refundStatuses = new Set(['refunded', 'voided']);
      const grossSales = rows.reduce((sum, row) => paidStatuses.has(row.payment_status) ? sum + row.total_amount : sum, 0);
      const refunds = rows.reduce((sum, row) => refundStatuses.has(row.payment_status) ? sum + row.total_amount : sum, 0) + partialRefundEvents;
      const pendingAmount = rows.reduce((sum, row) => row.payment_status === 'pending' ? sum + row.total_amount : sum, 0);
      const failedAmount = rows.reduce((sum, row) => ['failed', 'cancelled'].includes(row.payment_status) ? sum + row.total_amount : sum, 0);
      const statusCounts = rows.reduce((counts, row) => {
        counts[row.payment_status] = (counts[row.payment_status] || 0) + 1;
        return counts;
      }, {});

      const items = rows.map(row => {
        const isRefund = refundStatuses.has(row.payment_status);
        const isPaid = row.payment_status === 'paid' || row.payment_status === 'partially_refunded';
        const partialRefundAmount = partialRefundByBooking[row.id] || 0;
        const amountEffect = isRefund ? -row.total_amount : row.payment_status === 'partially_refunded' ? -partialRefundAmount : isPaid ? row.total_amount : 0;
        const customerName = [row.customer_first_name, row.customer_last_name].filter(Boolean).join(' ');
        const description = row.session_type === 'event' && row.event_title
          ? row.event_title
          : row.is_special_event && row.event_title
            ? row.event_title
            : `${row.session_date} - ${row.session_time}`;

        return {
          id: row.id,
          referenceNumber: row.reference_number,
          status: row.payment_status,
          transactionType: isRefund ? (row.payment_status === 'voided' ? 'Void' : 'Refund') : row.payment_status === 'partially_refunded' ? 'Partial Refund' : isPaid ? 'Payment' : row.payment_status,
          totalAmount: row.total_amount,
          totalFormatted: '$' + formatPrice(row.total_amount),
          partialRefundAmount,
          partialRefundFormatted: '$' + formatPrice(partialRefundAmount),
          amountEffect,
          amountEffectFormatted: `${amountEffect < 0 ? '-' : ''}$${formatPrice(Math.abs(amountEffect))}`,
          transactionAt: row.transaction_at,
          createdAt: row.created_at,
          paymentCompletedAt: row.payment_completed_at,
          latestEventAt: row.latest_event_at,
          latestEventType: row.latest_event_type,
          transactionId: row.transaction_id,
          email: row.email,
          customerFirstName: row.customer_first_name,
          customerLastName: row.customer_last_name,
          customerName: customerName || row.email || '(no name)',
          sessionDate: row.session_date,
          sessionTime: row.session_time,
          sessionType: row.session_type,
          description,
        };
      });

      res.json({
        filters: { dateFrom, dateTo, status, search },
        salesReportCutoffAt: cutoff,
        summary: {
          totalTransactions: rows.length,
          paidCount: (statusCounts.paid || 0) + (statusCounts.partially_refunded || 0),
          refundCount: (statusCounts.refunded || 0) + (statusCounts.voided || 0) + (statusCounts.partially_refunded || 0),
          pendingCount: statusCounts.pending || 0,
          failedCount: (statusCounts.failed || 0) + (statusCounts.cancelled || 0),
          grossSales,
          grossSalesFormatted: '$' + formatPrice(grossSales),
          refunds,
          refundsFormatted: '$' + formatPrice(refunds),
          netTotal: grossSales - refunds,
          netTotalFormatted: '$' + formatPrice(grossSales - refunds),
          pendingAmount,
          pendingAmountFormatted: '$' + formatPrice(pendingAmount),
          failedAmount,
          failedAmountFormatted: '$' + formatPrice(failedAmount),
        },
        items,
      });
    } catch (err) {
      console.error('GET /api/admin/transactions failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/booking-sales', adminAuth, async (req, res) => {
    try {
      const cutoff = await getSalesReportCutoff();
      const bookingCutoffSql = cutoff ? " AND datetime(COALESCE(b.payment_completed_at, b.created_at)) >= datetime(?)" : '';
      const rows = await all(`
        SELECT s.id, s.date, s.time, s.is_special_event, s.event_title, ${sessionTypeSql('s')} as session_type,
          COUNT(bi.id) as quantity,
          COUNT(DISTINCT b.id) as booking_count,
          COALESCE(SUM(bi.price + COALESCE(addons.addon_total, 0)), 0) as total_amount
        FROM sessions s
        LEFT JOIN bookings b ON b.session_id = s.id AND b.payment_status IN ('paid', 'partially_refunded') ${bookingCutoffSql}
        LEFT JOIN booking_items bi ON bi.booking_id = b.id AND COALESCE(bi.refund_status, 'active') != 'refunded'
        LEFT JOIN (
          SELECT booking_item_id, SUM(price) as addon_total
          FROM booking_addons
          GROUP BY booking_item_id
        ) addons ON addons.booking_item_id = bi.id
        WHERE s.deleted_at IS NULL
        GROUP BY s.id
        ORDER BY s.date ASC, s.time ASC
      `, cutoff ? [cutoff] : []);
      res.json(rows.map(row => ({
        id: row.id,
        date: row.date,
        time: row.time,
        description: row.session_type === 'event' && row.event_title ? row.event_title : row.is_special_event && row.event_title ? row.event_title : `${row.date} - ${row.time}`,
        sessionType: row.session_type,
        isSpecialEvent: !!row.is_special_event,
        eventTitle: row.event_title,
        quantity: row.quantity,
        bookingCount: row.booking_count,
        totalAmount: row.total_amount,
        totalFormatted: '$' + formatPrice(row.total_amount)
      })));
    } catch (err) {
      console.error('GET /api/admin/booking-sales failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/sales-reporting/reset', adminAuth, async (req, res) => {
    try {
      if (req.body?.confirm !== 'RESET SALES TOTALS') {
        return res.status(400).json({
          error: 'confirmation_required',
          message: 'Type RESET SALES TOTALS to reset sales reporting totals.',
        });
      }
      const cutoffAt = await setSalesReportCutoff();
      res.json({
        ok: true,
        cutoffAt,
        message: 'Sales reports now count only bookings and transactions after this reset time.',
      });
    } catch (err) {
      console.error('POST /api/admin/sales-reporting/reset failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
