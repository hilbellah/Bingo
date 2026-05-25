import { v4 as uuid } from 'uuid';
import { get, run } from '../database.js';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function normalizeCustomerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isValidCustomerName(value) {
  const name = normalizeCustomerName(value);
  return name.length >= 1 && name.length <= 80;
}

export async function hasPriorPaidBooking(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = await get(
    `SELECT id FROM bookings
     WHERE LOWER(email) = ?
       AND payment_status IN ('paid', 'refunded', 'voided')
     LIMIT 1`,
    [normalized]
  );
  return !!row;
}

export async function verifyBookingEmail({ email, verificationId, requireVerification }) {
  const normalized = normalizeEmail(email);
  const now = new Date().toISOString();

  if (!requireVerification) {
    return { ok: true, trusted: false, verifiedAt: null };
  }

  if (await hasPriorPaidBooking(normalized)) {
    return { ok: true, trusted: true, verifiedAt: now, alreadyVerified: true };
  }

  if (!verificationId) {
    return { ok: false, statusCode: 403, error: 'Please verify your email before continuing to payment.' };
  }

  const verification = await get(
    `SELECT * FROM email_verifications
     WHERE id = ? AND LOWER(email) = ?
     LIMIT 1`,
    [verificationId, normalized]
  );

  if (!verification || !verification.verified_at) {
    return { ok: false, statusCode: 403, error: 'Please verify your email before continuing to payment.' };
  }

  if (verification.expires_at <= now) {
    return { ok: false, statusCode: 403, error: 'That verification code expired. Please send a new code.' };
  }

  return { ok: true, trusted: true, verifiedAt: verification.verified_at };
}

export async function upsertCustomerFromBooking(booking) {
  const email = normalizeEmail(booking?.email);
  if (!email || !isValidEmail(email)) return;

  const now = new Date().toISOString();
  const firstName = normalizeCustomerName(booking.customer_first_name) || null;
  const lastName = normalizeCustomerName(booking.customer_last_name) || null;
  const bookingAt = booking.payment_completed_at || now;

  await run(
    `INSERT INTO customers
      (id, email, first_name, last_name, email_verified_at, first_booking_at, last_booking_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       first_name = COALESCE(excluded.first_name, customers.first_name),
       last_name = COALESCE(excluded.last_name, customers.last_name),
       email_verified_at = COALESCE(customers.email_verified_at, excluded.email_verified_at),
       first_booking_at = COALESCE(customers.first_booking_at, excluded.first_booking_at),
       last_booking_at = excluded.last_booking_at,
       updated_at = excluded.updated_at`,
    [
      uuid(),
      email,
      firstName,
      lastName,
      booking.email_verified_at || now,
      booking.created_at || bookingAt,
      bookingAt,
      now,
      now,
    ]
  );
}
