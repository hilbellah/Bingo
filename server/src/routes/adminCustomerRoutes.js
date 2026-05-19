import { all } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { formatPrice } from '../utils/format.js';

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function getCustomerRows(search = '') {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const params = [];
  let whereClause = '';
  if (normalizedSearch) {
    whereClause = `
      WHERE LOWER(c.email) LIKE ?
         OR LOWER(COALESCE(c.first_name, '')) LIKE ?
         OR LOWER(COALESCE(c.last_name, '')) LIKE ?
    `;
    const like = `%${normalizedSearch}%`;
    params.push(like, like, like);
  }

  return all(`
    SELECT
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.email_verified_at,
      c.first_booking_at,
      c.last_booking_at,
      c.created_at,
      c.updated_at,
      COUNT(b.id) as booking_count,
      SUM(CASE WHEN b.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_booking_count,
      COALESCE(SUM(CASE WHEN b.payment_status = 'paid' THEN b.total_amount ELSE 0 END), 0) as total_spent
    FROM customers c
    LEFT JOIN bookings b ON LOWER(b.email) = c.email
    ${whereClause}
    GROUP BY c.id
    ORDER BY COALESCE(c.last_booking_at, c.updated_at, c.created_at) DESC
  `, params);
}

export function registerAdminCustomerRoutes(app) {
  app.get('/api/admin/customers', adminAuth, (req, res) => {
    const rows = getCustomerRows(req.query.search);
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
      totalSpent: row.total_spent || 0,
      totalSpentFormatted: '$' + formatPrice(row.total_spent || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  });

  app.get('/api/admin/customers/export', adminAuth, (req, res) => {
    const rows = getCustomerRows(req.query.search);
    const header = [
      'First Name',
      'Last Name',
      'Email',
      'Paid Bookings',
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
        row.booking_count || 0,
        '$' + formatPrice(row.total_spent || 0),
        row.first_booking_at || '',
        row.last_booking_at || '',
        row.email_verified_at || '',
      ].map(csvCell).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers-report.csv');
    res.send(lines.join('\n'));
  });
}
