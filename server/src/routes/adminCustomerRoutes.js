import { all } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { formatPrice } from '../utils/format.js';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function getCustomerRows(search = '') {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const params = [];
  let whereClause = '';
  if (normalizedSearch) {
    whereClause = `
      AND (
        LOWER(TRIM(b.email)) LIKE ?
        OR LOWER(COALESCE(bi.first_name, '')) LIKE ?
        OR LOWER(COALESCE(bi.last_name, '')) LIKE ?
        OR LOWER(COALESCE(b.customer_first_name, '')) LIKE ?
        OR LOWER(COALESCE(b.customer_last_name, '')) LIKE ?
      )
    `;
    const like = `%${normalizedSearch}%`;
    params.push(like, like, like, like, like);
  }

  return await all(`
    WITH paid_items AS (
      SELECT
        b.id as booking_id,
        LOWER(TRIM(b.email)) as email,
        COALESCE(NULLIF(TRIM(bi.first_name), ''), NULLIF(TRIM(b.customer_first_name), ''), '') as first_name,
        COALESCE(NULLIF(TRIM(bi.last_name), ''), NULLIF(TRIM(b.customer_last_name), ''), '') as last_name,
        COALESCE(b.email_verified_at, cb.email_verified_at) as email_verified_at,
        b.created_at,
        COALESCE(b.payment_completed_at, b.created_at) as booking_at,
        COALESCE(b.total_amount, 0) as booking_total,
        COALESCE(bi.price, 0) as item_price,
        COALESCE(addons.addon_total, 0) as addon_total,
        COUNT(bi.id) OVER (PARTITION BY b.id) as booking_item_count,
        SUM(COALESCE(bi.price, 0) + COALESCE(addons.addon_total, 0)) OVER (PARTITION BY b.id) as booking_item_subtotal
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      LEFT JOIN (
        SELECT booking_item_id, SUM(COALESCE(price, 0)) as addon_total
        FROM booking_addons
        GROUP BY booking_item_id
      ) addons ON addons.booking_item_id = bi.id
      LEFT JOIN (
        SELECT LOWER(TRIM(email)) as email, MIN(email_verified_at) as email_verified_at
        FROM customers
        WHERE email IS NOT NULL AND TRIM(email) <> ''
        GROUP BY LOWER(TRIM(email))
      ) cb ON cb.email = LOWER(TRIM(b.email))
      WHERE b.payment_status = 'paid'
        AND b.email IS NOT NULL
        AND TRIM(b.email) <> ''
        AND COALESCE(bi.refund_status, 'active') != 'refunded'
        ${whereClause}
    ),
    allocated_items AS (
      SELECT
        *,
        item_price + addon_total +
          CASE
            WHEN booking_total > booking_item_subtotal AND booking_item_count > 0
              THEN ROUND((booking_total - booking_item_subtotal) / booking_item_count)
            ELSE 0
          END as item_total
      FROM paid_items
    )
    SELECT
      LOWER(email || '|' || first_name || '|' || last_name) as id,
      email,
      first_name,
      last_name,
      MIN(email_verified_at) as email_verified_at,
      MIN(created_at) as first_booking_at,
      MAX(booking_at) as last_booking_at,
      MIN(created_at) as created_at,
      MAX(booking_at) as updated_at,
      COUNT(DISTINCT booking_id) as booking_count,
      COUNT(DISTINCT booking_id) as paid_booking_count,
      COUNT(*) as ticket_count,
      COALESCE(SUM(item_total), 0) as total_spent
    FROM allocated_items
    GROUP BY email, first_name, last_name
    ORDER BY MAX(booking_at) DESC, last_name ASC, first_name ASC
  `, params);
}

export function registerAdminCustomerRoutes(app) {
  app.get('/api/admin/customers', adminAuth, async (req, res) => {
    try {
    const rows = await getCustomerRows(req.query.search);
    res.json(rows.map(row => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: [row.first_name, row.last_name].filter(Boolean).join(' ') || '(no name)',
      emailVerifiedAt: row.email_verified_at,
      firstBookingAt: row.first_booking_at,
      lastBookingAt: row.last_booking_at,
      bookingCount: row.booking_count || 0,
      paidBookingCount: row.paid_booking_count || 0,
      ticketCount: row.ticket_count || 0,
      totalSpent: Math.round(Number(row.total_spent || 0)),
      totalSpentFormatted: '$' + formatPrice(Math.round(Number(row.total_spent || 0))),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
    } catch (err) {
      console.error('GET /api/admin/customers failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/customers/export', adminAuth, async (req, res) => {
    try {
    const rows = await getCustomerRows(req.query.search);
    const header = [
      'First Name',
      'Last Name',
      'Email',
      'Paid Bookings',
      'Tickets',
      'All Bookings',
      'Total Spent',
      'First Booking',
      'Last Booking',
      'Email Verified At',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([
        row.first_name || '',
        row.last_name || '',
        row.email || '',
        row.paid_booking_count || 0,
        row.ticket_count || 0,
        row.booking_count || 0,
        '$' + formatPrice(Math.round(Number(row.total_spent || 0))),
        row.first_booking_at || '',
        row.last_booking_at || '',
        row.email_verified_at || '',
      ].map(csvCell).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers-report.csv');
    res.send(lines.join('\n'));
    } catch (err) {
      console.error('GET /api/admin/customers/export failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
