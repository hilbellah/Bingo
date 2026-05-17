import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { getDb, all, get, run, saveDb } from './database.js';
import { migrate } from './migrate.js';
import { logger } from './logger.js';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { adminAuth, requireSuperUser, isSuperUser } from './middleware/adminAuth.js';
import { releaseExpiredHolds } from './services/holds.js';
import {
  cleanupOldData,
  ensureFutureSessions,
  getScheduleSummary,
  openWeeklySessions,
  listRecurringSchedules,
  getAutoGenerateConfig,
  updateAutoGenerateConfig,
  DAY_LABELS
} from './services/scheduler.js';
import { createUploadMiddleware } from './uploads.js';
import { formatLocalDate, formatPrice, generateRef } from './utils/format.js';
import { sendBookingConfirmation, sendBookingRefundNotification, sendEmailVerificationCode } from './services/email.js';
import { createHostedPaymentPage, verifyTransaction, verifyWebhookSignature, refundTransaction, voidTransaction } from './services/payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const server = createServer(app);
app.set('trust proxy', 1);

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.PUBLIC_BASE_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  'https://bingo-jk2h.onrender.com',
]);
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://localhost:3001');
}

function corsOrigin(origin, callback) {
  if (!origin || allowedOrigins.has(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'));
}

const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-ANET-Signature'],
};

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;
const HOLD_MINUTES = parseInt(process.env.SESSION_HOLD_MINUTES || '10');
const startTime = Date.now();

const { uploadsDir, upload, saveUploadedImage } = createUploadMiddleware(__dirname);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if ((req.originalUrl || '').split('?')[0] === '/api/webhooks/authorize-net') {
      req.rawBody = Buffer.from(buf);
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_GENERAL || 600),
  standardHeaders: true,
  legacyHeaders: false,
});
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_BOOKING || 30),
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_ADMIN_LOGIN || 10),
  standardHeaders: true,
  legacyHeaders: false,
});
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_WEBHOOK || 120),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', generalLimiter);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Serve static build in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
  try {
    const db = await getDb();
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: 'disconnected',
      error: error.message
    });
  }
});

// ============ AUDIT HELPER ============

function logAudit(action, entityType, entityId, details) {
  run('INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), action, entityType, entityId, typeof details === 'string' ? details : JSON.stringify(details), new Date().toISOString()]);
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function normalizePackageDrafts(pkgs = []) {
  return Array.isArray(pkgs)
    ? pkgs
      .map((pkg, index) => ({
        ...pkg,
        name: normalizeCustomerName(pkg?.name),
        price: Number(pkg?.price || 0),
        type: pkg?.type === 'optional' ? 'optional' : 'required',
        max_quantity: Math.max(1, parseInt(pkg?.max_quantity || 1, 10)),
        sort_order: Number.isFinite(Number(pkg?.sort_order)) ? Number(pkg.sort_order) : index,
        is_phd: pkg?.is_phd ? 1 : 0,
      }))
      .filter(pkg => pkg.name && pkg.price > 0)
    : [];
}

function validateSpecialEventPackageDrafts(pkgs = []) {
  const normalized = normalizePackageDrafts(pkgs);
  const required = normalized.filter(pkg => pkg.type === 'required');
  const optional = normalized.filter(pkg => pkg.type === 'optional');

  if (required.length !== 1) {
    return { ok: false, error: 'Special bingo requires exactly one per-person admission package with a price.' };
  }

  if (!required[0].is_phd) {
    return { ok: false, error: 'Special bingo admission must include 1 PHD unit.' };
  }

  const nonPhdOptional = optional.filter(pkg => !pkg.is_phd);
  if (nonPhdOptional.length > 0) {
    return { ok: false, error: 'Special bingo optional add-ons are limited to PHD units.' };
  }

  const phdOptional = optional.filter(pkg => pkg.is_phd);
  if (phdOptional.length > 1) {
    return { ok: false, error: 'Special bingo can only have one PHD add-on package.' };
  }

  return { ok: true, packages: normalized };
}

const DEFAULT_SPECIAL_BINGO_CONFIG = {
  admissionName: 'Special Bingo Admission (includes 1 PHD)',
  admissionPrice: 7500,
  additionalPhdName: 'Additional PHD Unit',
  additionalPhdPrice: 5000,
  additionalPhdMaxQuantity: 1,
};

function getSpecialBingoConfig() {
  const row = get("SELECT value FROM settings WHERE key = 'special_bingo_config'");
  if (!row) return DEFAULT_SPECIAL_BINGO_CONFIG;
  try {
    return { ...DEFAULT_SPECIAL_BINGO_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_SPECIAL_BINGO_CONFIG;
  }
}

function getDefaultSpecialBingoPackages() {
  const config = getSpecialBingoConfig();
  return [
    {
      name: config.admissionName,
      price: Number(config.admissionPrice || DEFAULT_SPECIAL_BINGO_CONFIG.admissionPrice),
      type: 'required',
      max_quantity: 1,
      sort_order: 0,
      is_phd: true,
    },
    {
      name: config.additionalPhdName,
      price: Number(config.additionalPhdPrice || 0),
      type: 'optional',
      max_quantity: Math.max(1, parseInt(config.additionalPhdMaxQuantity || DEFAULT_SPECIAL_BINGO_CONFIG.additionalPhdMaxQuantity, 10)),
      sort_order: 1,
      is_phd: true,
    },
  ];
}

function normalizeSessionType(value, isSpecialEvent = false) {
  if (value === 'event') return 'event';
  if (value === 'special_bingo' || isSpecialEvent) return 'special_bingo';
  return 'regular_bingo';
}

function sessionTypeSql(alias = 's') {
  return `COALESCE(NULLIF(${alias}.session_type, ''), CASE WHEN ${alias}.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END)`;
}

function validateEventPackageDrafts(pkgs = []) {
  const normalized = normalizePackageDrafts(pkgs);
  const required = normalized.filter(pkg => pkg.type === 'required');
  const optional = normalized.filter(pkg => pkg.type === 'optional');

  if (required.length !== 1) {
    return { ok: false, error: 'Events require exactly one per-person admission package with a price.' };
  }

  if (optional.length > 0) {
    return { ok: false, error: 'Events do not allow add-ons.' };
  }

  return { ok: true, packages: normalized };
}

function validateSessionPackagesForType(sessionType, pkgs = []) {
  if (sessionType === 'event') return validateEventPackageDrafts(pkgs);
  if (sessionType === 'special_bingo') return validateSpecialEventPackageDrafts(pkgs);
  return { ok: true, packages: normalizePackageDrafts(pkgs) };
}

// ============ BOOKING + PAYMENT HELPERS ============
//
// Shared building blocks for:
//   POST /api/bookings           — legacy/admin instant-paid path
//   POST /api/bookings/initiate  — customer-facing path that returns a hosted-page token
//   GET  /payment/return         — handles browser redirect from Authorize.Net (Stage 4)
//   POST /api/webhooks/authorize-net — handles webhook events (Stage 5)
//   POST /api/admin/bookings/:id/refund — admin refund (Stage 8)
//
// Convention: all helpers return either { ok: true, ... } or { ok: false, error, statusCode? }.
// Helpers never throw on logic errors (DB exceptions still propagate as runtime errors).

// Insert a single row in the payment_events audit table. Best-effort; never throws.
function logPaymentEvent(bookingId, eventType, source, payload) {
  try {
    run('INSERT INTO payment_events (id, booking_id, event_type, source, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), bookingId, eventType, source, JSON.stringify(payload || {}), new Date().toISOString()]);
  } catch (err) {
    console.error('[payments] logPaymentEvent failed:', err?.message || err);
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizeCustomerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isValidCustomerName(value) {
  const name = normalizeCustomerName(value);
  return name.length >= 1 && name.length <= 80;
}

function hasPriorPaidBooking(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = get(
    `SELECT id FROM bookings
     WHERE LOWER(email) = ?
       AND payment_status IN ('paid', 'refunded', 'voided')
     LIMIT 1`,
    [normalized]
  );
  return !!row;
}

function verifyBookingEmail({ email, verificationId, requireVerification }) {
  const normalized = normalizeEmail(email);
  const now = new Date().toISOString();

  if (!requireVerification) {
    return { ok: true, trusted: false, verifiedAt: null };
  }

  if (hasPriorPaidBooking(normalized)) {
    return { ok: true, trusted: true, verifiedAt: now, alreadyVerified: true };
  }

  if (!verificationId) {
    return { ok: false, statusCode: 403, error: 'Please verify your email before continuing to payment.' };
  }

  const verification = get(
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

function upsertCustomerFromBooking(booking) {
  const email = normalizeEmail(booking?.email);
  if (!email || !isValidEmail(email)) return;

  const now = new Date().toISOString();
  const firstName = normalizeCustomerName(booking.customer_first_name) || null;
  const lastName = normalizeCustomerName(booking.customer_last_name) || null;
  const bookingAt = booking.payment_completed_at || now;

  run(
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

// Validate the shape and integrity of a booking request body.
// Returns { ok, data: { sessionId, holderId, attendees, trimmedEmail, session,
//   useSessionPkgs, sessionPkgs, requiredPkg } } on success, or
// { ok: false, statusCode, error } on failure.
function validateBookingRequest(body, { requireEmailVerification = true, requireCustomerDetails = true } = {}) {
  const { sessionId, holderId, attendees, email, customerFirstName, customerLastName, emailVerificationId } = body || {};

  if (!sessionId || !holderId || !attendees?.length) {
    return { ok: false, statusCode: 400, error: 'Missing required fields' };
  }

  // Email required for confirmation. Permissive regex — just catches typos.
  const trimmedEmail = (email || '').trim();
  if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
    return { ok: false, statusCode: 400, error: 'A valid email address is required for the booking confirmation.' };
  }
  const normalizedEmail = normalizeEmail(trimmedEmail);

  let trimmedCustomerFirstName = normalizeCustomerName(customerFirstName);
  let trimmedCustomerLastName = normalizeCustomerName(customerLastName);
  if (!requireCustomerDetails) {
    trimmedCustomerFirstName ||= normalizeCustomerName(attendees?.[0]?.firstName);
    trimmedCustomerLastName ||= normalizeCustomerName(attendees?.[0]?.lastName);
  }
  if (requireCustomerDetails && (!isValidCustomerName(trimmedCustomerFirstName) || !isValidCustomerName(trimmedCustomerLastName))) {
    return { ok: false, statusCode: 400, error: 'Customer first and last name are required.' };
  }

  const emailCheck = verifyBookingEmail({
    email: normalizedEmail,
    verificationId: emailVerificationId,
    requireVerification: requireEmailVerification,
  });
  if (!emailCheck.ok) return emailCheck;

  const session = get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return { ok: false, statusCode: 404, error: 'Session not found' };
  const currentSessionType = normalizeSessionType(session.session_type, session.is_special_event);
  if (currentSessionType === 'event' && attendees.some(att => (att.addons || []).some(addon => addon.quantity > 0))) {
    return { ok: false, statusCode: 400, error: 'Events do not allow add-ons.' };
  }

  // Session-specific packages override the global package list when present.
  const sessionPkgs = all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [sessionId]);
  const useSessionPkgs = sessionPkgs.length > 0;
  const requiredPkg = useSessionPkgs
    ? sessionPkgs.find(p => p.type === 'required')
    : get("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 LIMIT 1");
  if (!requiredPkg) return { ok: false, statusCode: 500, error: 'No required package configured' };

  // Every seat must currently be held by THIS holder. Prevents booking seats
  // that someone else has held, or seats that aren't held at all.
  for (const att of attendees) {
    const seat = get('SELECT * FROM seats WHERE id = ?', [att.seatId]);
    if (!seat || seat.status !== 'held' || seat.held_by !== holderId) {
      return { ok: false, statusCode: 409, error: 'Seat not held by you' };
    }
  }

  return {
    ok: true,
    data: {
      sessionId,
      holderId,
      attendees,
      trimmedEmail: normalizedEmail,
      customerFirstName: trimmedCustomerFirstName,
      customerLastName: trimmedCustomerLastName,
      emailVerifiedAt: emailCheck.verifiedAt || null,
      session,
      sessionType: currentSessionType,
      useSessionPkgs,
      sessionPkgs,
      requiredPkg
    }
  };
}

// Enforce PHD (Personal Handheld Device) per-player limit and total stock.
// Returns { ok: true, phdPkgIds, phdConfig } or { ok: false, error }.
function getPhdConfig() {
  const phdSettingsRow = get("SELECT value FROM settings WHERE key = 'phd_inventory'");
  return phdSettingsRow ? JSON.parse(phdSettingsRow.value) : { totalStock: 200, perPlayerLimit: 2 };
}

function getPhdUsedForSession(sessionId) {
  if (!sessionId) return 0;
  const usedRow = get(`
    SELECT
      COALESCE((
        SELECT COUNT(*)
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE b.payment_status = 'paid'
          AND b.session_id = ?
          AND (
            bi.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
            OR bi.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
          )
      ), 0)
      +
      COALESCE((
        SELECT SUM(ba.quantity)
        FROM booking_addons ba
        JOIN booking_items bi ON bi.id = ba.booking_item_id
        JOIN bookings b ON b.id = bi.booking_id
        WHERE b.payment_status = 'paid'
          AND b.session_id = ?
          AND (
            ba.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
            OR ba.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
          )
      ), 0) as total_used
  `, [sessionId, sessionId]);
  return usedRow?.total_used || 0;
}

function getPhdInventoryForSession(sessionId) {
  const config = getPhdConfig();
  const totalUsed = getPhdUsedForSession(sessionId);
  return {
    sessionId: sessionId || null,
    totalStock: config.totalStock,
    totalUsed,
    remaining: Math.max(0, config.totalStock - totalUsed),
    perPlayerLimit: config.perPlayerLimit,
  };
}

function getPhdUsageBySession() {
  return all(`
    SELECT * FROM (
      SELECT s.id, s.date, s.time, s.event_title, s.is_special_event,
        COALESCE((
          SELECT COUNT(*)
          FROM booking_items bi
          JOIN bookings b ON b.id = bi.booking_id
          WHERE b.payment_status = 'paid'
            AND b.session_id = s.id
            AND (
              bi.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
              OR bi.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
            )
        ), 0)
        +
        COALESCE((
          SELECT SUM(ba.quantity)
          FROM booking_addons ba
          JOIN booking_items bi ON bi.id = ba.booking_item_id
          JOIN bookings b ON b.id = bi.booking_id
          WHERE b.payment_status = 'paid'
            AND b.session_id = s.id
            AND (
              ba.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
              OR ba.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
            )
        ), 0) as phd_count
      FROM sessions s
      WHERE s.deleted_at IS NULL
    )
    WHERE phd_count > 0
    ORDER BY date DESC
  `);
}

function getNextPhdSessionId() {
  const today = formatLocalDate(new Date());
  const row = get(
    `SELECT id FROM sessions
     WHERE date >= ? AND is_available = 1 AND deleted_at IS NULL
     ORDER BY date ASC, time ASC
     LIMIT 1`,
    [today]
  );
  return row?.id || null;
}

function validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg) {
  const phdConfig = getPhdConfig();

  const phdPkgIds = new Set();
  if (useSessionPkgs) {
    sessionPkgs.filter(p => p.is_phd).forEach(p => phdPkgIds.add(p.id));
  } else {
    all('SELECT id FROM packages WHERE is_phd = 1 AND is_active = 1').forEach(p => phdPkgIds.add(p.id));
  }

  if (phdPkgIds.size === 0) return { ok: true, phdPkgIds, phdConfig };
  const includedPhdPerPlayer = requiredPkg?.is_phd ? 1 : 0;

  // Per-player limit
  for (const att of attendees) {
    let playerPhdQty = includedPhdPerPlayer;
    for (const addon of att.addons || []) {
      if (phdPkgIds.has(addon.packageId)) playerPhdQty += addon.quantity;
    }
    if (playerPhdQty > phdConfig.perPlayerLimit) {
      return { ok: false, error: `Each player can only add up to ${phdConfig.perPlayerLimit} handheld devices.` };
    }
  }

  // PHD stock resets per session. Example: a 5/15 session has its own 200,
  // and the 5/16 session also has its own 200.
  let totalPhdInBooking = includedPhdPerPlayer * attendees.length;
  for (const att of attendees) {
    for (const addon of att.addons || []) {
      if (phdPkgIds.has(addon.packageId)) totalPhdInBooking += addon.quantity;
    }
  }

  if (totalPhdInBooking > 0) {
    const totalUsed = getPhdUsedForSession(sessionId);
    const remaining = phdConfig.totalStock - totalUsed;

    if (totalPhdInBooking > remaining) {
      return { ok: false, error: `Only ${remaining} handheld device${remaining !== 1 ? 's' : ''} remaining in stock. You requested ${totalPhdInBooking}.` };
    }
  }

  return { ok: true, phdPkgIds, phdConfig };
}

// Insert a booking + its items + addons. Always 'pending' status.
// Does NOT flip seats and does NOT emit any sockets — that happens in markBookingPaid.
// Returns { bookingId, refNumber, totalAmount, itemRefs }. Throws on DB error.
function insertBookingRecord({
  sessionId,
  attendees,
  requiredPkg,
  sessionPkgs,
  useSessionPkgs,
  email,
  customerFirstName,
  customerLastName,
  emailVerifiedAt
}) {
  let totalAmount = 0;
  const bookingId = uuid();
  const refNumber = generateRef();
  const itemRefs = [];

  for (const att of attendees) {
    const itemId = uuid();
    const itemRef = generateRef();
    itemRefs.push(itemRef);
    totalAmount += requiredPkg.price;

    run('INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [itemId, bookingId, att.firstName, att.lastName, att.seatId, requiredPkg.id, requiredPkg.price, itemRef]);

    if (att.addons) {
      for (const addon of att.addons) {
        const pkg = useSessionPkgs
          ? sessionPkgs.find(p => p.id === addon.packageId)
          : get('SELECT * FROM packages WHERE id = ? AND is_active = 1', [addon.packageId]);
        if (pkg) {
          const addonPrice = pkg.price * addon.quantity;
          totalAmount += addonPrice;
          run('INSERT INTO booking_addons (id, booking_item_id, package_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
            [uuid(), itemId, addon.packageId, addon.quantity, addonPrice]);
        }
      }
    }
  }

  run(
    `INSERT INTO bookings
      (id, session_id, reference_number, total_amount, payment_status, created_at, email,
       customer_first_name, customer_last_name, email_verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bookingId,
      sessionId,
      refNumber,
      totalAmount,
      'pending',
      new Date().toISOString(),
      email,
      customerFirstName,
      customerLastName,
      emailVerifiedAt,
    ]
  );

  // Preserve the original 'booking_created' audit event so any admin filters
  // / dashboards watching for it keep working after the refactor.
  logAudit('booking_created', 'booking', bookingId, {
    referenceNumber: refNumber,
    sessionId,
    totalAmount,
    customerFirstName,
    customerLastName,
    email,
    attendees: attendees.map(a => ({ firstName: a.firstName, lastName: a.lastName, seatId: a.seatId }))
  });

  return { bookingId, refNumber, totalAmount, itemRefs };
}

// Idempotently transition a booking from 'pending' to 'paid'. Performs the
// side effects that used to live inline in POST /api/bookings:
//   - flip booked seats from 'held' to 'sold' + emit seat:sold
//   - update bookings row with transaction_id, auth_code, payment_completed_at
//   - emit receipt data to admin auto-print room
//   - emit PHD inventory update if booking had PHD addons
//   - log payment_event 'approved' + audit_log 'booking_paid'
//   - fire confirmation email (setImmediate, never blocks caller)
//
// Returns { ok, alreadyPaid? }. Safe to call multiple times — second+ calls
// short-circuit. This is what makes /payment/return and the webhook safe to
// both fire for the same booking.
function markBookingPaid({ bookingId, transactionId = null, authCode = null, source = 'instant' }) {
  const booking = get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    console.error(`[bookings] markBookingPaid: booking ${bookingId} not found`);
    return { ok: false, error: 'booking_not_found' };
  }
  if (booking.payment_status === 'paid') {
    console.log(`[bookings] markBookingPaid: ${bookingId} already paid, idempotent skip`);
    return { ok: true, alreadyPaid: true };
  }

  const session = get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
  const items = all('SELECT * FROM booking_items WHERE booking_id = ?', [bookingId]);

  // Update booking row
  run(`UPDATE bookings SET
    payment_status = 'paid',
    transaction_id = ?,
    auth_code = ?,
    payment_completed_at = ?
    WHERE id = ?`,
    [transactionId, authCode, new Date().toISOString(), bookingId]);

  upsertCustomerFromBooking({
    ...booking,
    payment_status: 'paid',
    transaction_id: transactionId,
    auth_code: authCode,
    payment_completed_at: new Date().toISOString(),
  });

  // Flip seats to sold + emit per-seat for live seat-map updates
  for (const it of items) {
    run(`UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?`, [it.seat_id]);
    io.to(`session:${booking.session_id}`).emit('seat:sold', { seatId: it.seat_id, sessionId: booking.session_id });
  }

  // Build receipt data and emit to admin auto-print room
  const receiptItems = all(`
    SELECT bi.id, bi.first_name, bi.last_name, bi.price, bi.reference_number,
           seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name,
           COALESCE(p.price, sp.price) as package_price
    FROM booking_items bi
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    WHERE bi.booking_id = ?
    ORDER BY bi.id
  `, [bookingId]);
  const receiptAddons = all(`
    SELECT ba.booking_item_id, ba.quantity, ba.price,
           COALESCE(p.name, sp.name) as package_name
    FROM booking_addons ba
    LEFT JOIN packages p ON p.id = ba.package_id
    LEFT JOIN session_packages sp ON sp.id = ba.package_id
    JOIN booking_items bi ON bi.id = ba.booking_item_id
    WHERE bi.booking_id = ?
  `, [bookingId]);
  io.to('admin:receipts').emit('booking:new', {
    referenceNumber: booking.reference_number,
    sessionDate: session?.date,
    sessionTime: session?.time,
    totalAmount: booking.total_amount,
    totalFormatted: '$' + formatPrice(booking.total_amount),
    createdAt: new Date().toISOString(),
    items: receiptItems.map(item => ({
      firstName: item.first_name,
      lastName: item.last_name,
      tableNumber: item.table_number,
      chairNumber: item.chair_number,
      referenceNumber: item.reference_number,
      packageName: item.package_name,
      packagePrice: item.package_price,
      packagePriceFormatted: '$' + formatPrice(item.package_price),
      addons: receiptAddons
        .filter(a => a.booking_item_id === item.id)
        .map(a => ({ packageName: a.package_name, quantity: a.quantity, price: a.price, priceFormatted: '$' + formatPrice(a.price) }))
    }))
  });

  // PHD inventory update emit — included PHD packages and PHD add-ons both count.
  const phdInBooking = get(`
    SELECT
      COALESCE((
        SELECT COUNT(*)
        FROM booking_items bi
        WHERE bi.booking_id = ?
          AND (
            bi.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
            OR bi.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
          )
      ), 0)
      +
      COALESCE((
        SELECT SUM(ba.quantity)
        FROM booking_addons ba
        JOIN booking_items bi ON bi.id = ba.booking_item_id
        WHERE bi.booking_id = ?
          AND (
            ba.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
            OR ba.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
          )
      ), 0) as cnt
  `, [bookingId, bookingId]);
  if (phdInBooking && phdInBooking.cnt > 0) {
    const phdInventory = getPhdInventoryForSession(booking.session_id);
    io.to('admin:receipts').emit('phd:updated', {
      ...phdInventory,
      perSession: getPhdUsageBySession(),
    });
  }

  // Flush to disk — critical write
  saveDb();

  logPaymentEvent(bookingId, 'approved', source, { transactionId, authCode });
  logAudit('booking_paid', 'booking', bookingId, {
    referenceNumber: booking.reference_number,
    sessionId: booking.session_id,
    totalAmount: booking.total_amount,
    transactionId,
    authCode,
    source
  });

  // Fire confirmation email asynchronously so we don't block the caller.
  setImmediate(() => sendBookingConfirmationEmail(bookingId).catch(err => {
    console.error('[email] unexpected error:', err);
  }));

  return { ok: true };
}

// Idempotently mark a 'pending' booking as 'failed' (decline / error path).
// Does not flip seats — they remain 'held' until the hold expires naturally,
// freeing them for a retry by the same customer or for other buyers.
function markBookingFailed({ bookingId, reason, source = 'server' }) {
  const booking = get('SELECT id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'paid') return { ok: false, error: 'already_paid' };
  if (booking.payment_status === 'failed') return { ok: true, alreadyFailed: true };

  run(`UPDATE bookings SET payment_status = 'failed', payment_failure_reason = ? WHERE id = ?`,
    [String(reason || 'unknown').slice(0, 500), bookingId]);
  saveDb();

  logPaymentEvent(bookingId, 'declined', source, { reason });
  return { ok: true };
}

// Idempotently mark a 'pending' booking as 'cancelled' (customer clicked Cancel
// on the Authorize.Net hosted page). Does not flip seats — they remain 'held'
// so the customer can retry within the hold window without losing their spot.
function markBookingCancelled({ bookingId, source = 'customer' }) {
  const booking = get('SELECT id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'paid') return { ok: false, error: 'already_paid' };
  if (booking.payment_status === 'cancelled') return { ok: true, alreadyCancelled: true };

  run(`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?`, [bookingId]);
  saveDb();

  logPaymentEvent(bookingId, 'cancelled', source, {});
  return { ok: true };
}

function releaseBookingSeats({ bookingId, sessionId }) {
  const items = all('SELECT seat_id FROM booking_items WHERE booking_id = ?', [bookingId]);
  for (const it of items) {
    run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [it.seat_id]);
    io.to(`session:${sessionId}`).emit('seat:unlocked', { seatId: it.seat_id, sessionId });
  }
  io.to(`session:${sessionId}`).emit('seats:refresh', { sessionId });
  return items.length;
}

function reconcileReversedBookingSeats() {
  const seatsToRelease = all(`
    SELECT DISTINCT s.id, s.session_id
    FROM seats s
    JOIN booking_items reversed_item ON reversed_item.seat_id = s.id
    JOIN bookings reversed_booking ON reversed_booking.id = reversed_item.booking_id
    WHERE s.status = 'sold'
      AND reversed_booking.payment_status IN ('refunded', 'voided')
      AND NOT EXISTS (
        SELECT 1
        FROM booking_items paid_item
        JOIN bookings paid_booking ON paid_booking.id = paid_item.booking_id
        WHERE paid_item.seat_id = s.id
          AND paid_booking.payment_status = 'paid'
      )
  `);

  for (const seat of seatsToRelease) {
    run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [seat.id]);
  }

  if (seatsToRelease.length > 0) {
    saveDb();
    logger.info('Released seats from reversed bookings', { count: seatsToRelease.length });
  }

  return seatsToRelease.length;
}

function sendRefundNotificationAsync({ bookingId, action, refundTransactionId }) {
  setImmediate(() => {
    try {
      const booking = get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return;
      const session = get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
      sendBookingRefundNotification({
        to: booking.email,
        booking,
        session,
        action,
        refundTransactionId,
      }).catch(err => {
        console.error('[email] refund notification unexpected error:', err);
      });
    } catch (err) {
      console.error('[email] refund notification setup failed:', err?.message || err);
    }
  });
}

// Idempotently mark a 'paid' booking as 'refunded' (post-settlement reversal).
// Releases seats, refreshes public seat maps, and emails the customer plus
// EMAIL_BCC recipients.
function markBookingRefunded({ bookingId, transactionId = null, refundTransactionId = null, source = 'admin' }) {
  const booking = get('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'refunded') return { ok: true, alreadyRefunded: true };
  if (booking.payment_status !== 'paid') {
    return { ok: false, error: `cannot refund booking in status '${booking.payment_status}'` };
  }

  run(`UPDATE bookings SET payment_status = 'refunded' WHERE id = ?`, [bookingId]);
  const releasedSeats = releaseBookingSeats({ bookingId, sessionId: booking.session_id });
  saveDb();

  logPaymentEvent(bookingId, 'refunded', source, { transactionId });
  logAudit('booking_refunded', 'booking', bookingId, { transactionId, source, releasedSeats });
  io.to('admin:receipts').emit('booking:refunded', { bookingId, transactionId, releasedSeats });
  io.to('admin:receipts').emit('phd:updated', {
    ...getPhdInventoryForSession(booking.session_id),
    perSession: getPhdUsageBySession(),
  });
  sendRefundNotificationAsync({ bookingId, action: 'refund', refundTransactionId: refundTransactionId || transactionId });
  return { ok: true, releasedSeats };
}

// Idempotently mark a 'paid' booking as 'voided' (pre-settlement reversal).
// Same semantics as markBookingRefunded but distinguished in audit logs so
// admins can tell which type of reversal happened.
function markBookingVoided({ bookingId, transactionId = null, voidTransactionId = null, source = 'admin' }) {
  const booking = get('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'voided') return { ok: true, alreadyVoided: true };
  if (booking.payment_status !== 'paid') {
    return { ok: false, error: `cannot void booking in status '${booking.payment_status}'` };
  }

  run(`UPDATE bookings SET payment_status = 'voided' WHERE id = ?`, [bookingId]);
  const releasedSeats = releaseBookingSeats({ bookingId, sessionId: booking.session_id });
  saveDb();

  logPaymentEvent(bookingId, 'voided', source, { transactionId });
  logAudit('booking_voided', 'booking', bookingId, { transactionId, source, releasedSeats });
  io.to('admin:receipts').emit('booking:voided', { bookingId, transactionId, releasedSeats });
  io.to('admin:receipts').emit('phd:updated', {
    ...getPhdInventoryForSession(booking.session_id),
    perSession: getPhdUsageBySession(),
  });
  sendRefundNotificationAsync({ bookingId, action: 'void', refundTransactionId: voidTransactionId || transactionId });
  return { ok: true, releasedSeats };
}

// Loads a booking + related rows and fires the confirmation email.
// Used by markBookingPaid; safe to call standalone for resends.
async function sendBookingConfirmationEmail(bookingId) {
  const booking = get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return;
  const session = get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
  const items = all('SELECT * FROM booking_items WHERE booking_id = ? ORDER BY id', [bookingId]);
  const addons = all(`
    SELECT ba.*
    FROM booking_addons ba
    JOIN booking_items bi ON bi.id = ba.booking_item_id
    WHERE bi.booking_id = ?
  `, [bookingId]);

  const attendees = items.map(it => ({
    firstName: it.first_name,
    lastName: it.last_name,
    seatId: it.seat_id,
    addons: addons.filter(a => a.booking_item_id === it.id).map(a => ({
      packageId: a.package_id,
      quantity: a.quantity,
    })),
  }));

  const sessionPkgs = all('SELECT * FROM session_packages WHERE session_id = ?', [booking.session_id]);
  const useSessionPkgs = sessionPkgs.length > 0;
  const packages = useSessionPkgs ? sessionPkgs : all('SELECT * FROM packages WHERE is_active = 1');

  const seats = items.map(it => {
    const s = get('SELECT id, table_number, chair_number FROM seats WHERE id = ?', [it.seat_id]);
    return s || { id: it.seat_id, table_number: '?', chair_number: '?' };
  });

  return sendBookingConfirmation({
    to: booking.email,
    booking: {
      referenceNumber: booking.reference_number,
      itemReferences: items.map(it => it.reference_number),
      totalAmount: booking.total_amount,
      totalFormatted: '$' + formatPrice(booking.total_amount),
    },
    session,
    attendees,
    seats,
    packages,
  });
}

// ============ API ROUTES ============

// --- Sessions ---
app.get('/api/sessions', (req, res) => {
  const today = formatLocalDate(new Date());
  const sessions = all(
    `SELECT s.*,
      COALESCE(SUM(CASE WHEN st.status = 'vacant' AND st.is_disabled = 0 THEN 1 ELSE 0 END), 0) as available_seats,
      COALESCE(SUM(CASE WHEN st.status = 'sold' THEN 1 ELSE 0 END), 0) as sold_seats,
      COALESCE(SUM(CASE WHEN st.status = 'held' THEN 1 ELSE 0 END), 0) as held_seats,
      COALESCE(SUM(CASE WHEN st.is_disabled = 0 THEN 1 ELSE 0 END), 0) as total_seats
    FROM sessions s
    LEFT JOIN seats st ON st.session_id = s.id
    WHERE s.date >= ? AND s.is_available = 1 AND s.deleted_at IS NULL
    GROUP BY s.id
    ORDER BY s.date ASC, s.time ASC`, [today]
  );
  res.json(sessions);
});

// --- Session-specific packages (public) ---
app.get('/api/sessions/:sessionId/packages', (req, res) => {
  // If the session has its own override list (special events use this), return it as-is.
  const sessionPkgs = all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [req.params.sessionId]);
  if (sessionPkgs.length > 0) {
    return res.json(sessionPkgs);
  }
  // Otherwise fall back to the global active package list, including PHD packages.
  // PHD availability is enforced per session by /api/phd-inventory?sessionId=...
  // and the booking validator, so every session gets its own stock pool.
  const globalPkgs = all('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC');
  res.json(globalPkgs);
});

// --- PHD Inventory status (public) ---
app.get('/api/phd-inventory', (req, res) => {
  const sessionId = String(req.query.sessionId || '').trim();
  res.json(getPhdInventoryForSession(sessionId));
});

// --- Theme settings (public) ---
app.get('/api/theme', (req, res) => {
  const row = get("SELECT value FROM settings WHERE key = 'theme_config'");
  if (!row) return res.json({ value: null });
  try { res.json({ value: JSON.parse(row.value) }); }
  catch { res.json({ value: null }); }
});

// --- Announcements (public) ---
app.get('/api/announcements', (req, res) => {
  const today = formatLocalDate(new Date());
  const announcements = all(
    `SELECT * FROM announcements
     WHERE is_active = 1
       AND (start_date IS NULL OR start_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY sort_order ASC, created_at DESC`, [today, today]
  );
  res.json(announcements);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// --- Seats ---
app.get('/api/sessions/:sessionId/seats', (req, res) => {
  const seats = all(`
    SELECT s.id, s.table_number, s.chair_number, s.status, s.is_disabled, s.held_by, s.held_until,
           bi.first_name as booked_name
    FROM seats s
    LEFT JOIN (
      SELECT bi.seat_id, bi.first_name
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE b.payment_status = 'paid'
    ) bi ON bi.seat_id = s.id
    WHERE s.session_id = ?
    ORDER BY s.table_number ASC, s.chair_number ASC
  `, [req.params.sessionId]);
  res.json(seats);
});

// --- Packages ---
app.get('/api/packages', (req, res) => {
  res.json(all('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC'));
});

// --- Seat Lock ---
app.post('/api/seats/:seatId/lock', bookingLimiter, (req, res) => {
  const { seatId } = req.params;
  const { holderId } = req.body;

  if (!holderId) return res.status(400).json({ error: 'holderId required' });

  const seat = get('SELECT * FROM seats WHERE id = ?', [seatId]);
  if (!seat) return res.status(404).json({ error: 'Seat not found' });
  if (seat.is_disabled) return res.status(400).json({ error: 'Seat is disabled' });
  if (seat.status === 'sold') return res.status(409).json({ error: 'Seat already sold' });
  if (seat.status === 'held' && seat.held_by !== holderId) {
    if (new Date(seat.held_until) > new Date()) {
      return res.status(409).json({ error: 'Seat held by another user' });
    }
  }

  const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  run(`UPDATE seats SET status = 'held', held_by = ?, held_until = ? WHERE id = ?`,
    [holderId, holdUntil, seatId]);

  io.to(`session:${seat.session_id}`).emit('seat:locked', {
    seatId, holderId, holdUntil, sessionId: seat.session_id
  });

  res.json({ success: true, holdUntil });
});

// --- Seat Unlock ---
app.post('/api/seats/:seatId/unlock', (req, res) => {
  const { seatId } = req.params;
  const { holderId } = req.body;

  const seat = get('SELECT * FROM seats WHERE id = ?', [seatId]);
  if (!seat) return res.status(404).json({ error: 'Seat not found' });
  if (seat.status !== 'held' || seat.held_by !== holderId) {
    return res.status(403).json({ error: 'Cannot unlock seat you do not hold' });
  }

  run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [seatId]);

  io.to(`session:${seat.session_id}`).emit('seat:unlocked', { seatId, sessionId: seat.session_id });

  res.json({ success: true });
});

app.post('/api/email-verifications/send', bookingLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const customerFirstName = normalizeCustomerName(req.body?.customerFirstName);
  const customerLastName = normalizeCustomerName(req.body?.customerLastName);

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!isValidCustomerName(customerFirstName) || !isValidCustomerName(customerLastName)) {
    return res.status(400).json({ error: 'Customer first and last name are required.' });
  }

  if (hasPriorPaidBooking(email)) {
    return res.json({
      ok: true,
      alreadyVerified: true,
      message: 'This email has already completed a paid booking.',
    });
  }

  try {
    run('DELETE FROM email_verifications WHERE expires_at < ?', [new Date().toISOString()]);

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const verificationId = uuid();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    run(
      `INSERT INTO email_verifications
        (id, email, code_hash, customer_first_name, customer_last_name, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [verificationId, email, codeHash, customerFirstName, customerLastName, expiresAt, new Date().toISOString()]
    );
    saveDb();

    const emailResult = await sendEmailVerificationCode({
      to: email,
      code,
      firstName: customerFirstName,
    });

    if (!emailResult.ok) {
      console.error('[email-verification] send failed:', emailResult.error || emailResult.status);
      return res.status(502).json({ error: 'Could not send verification code. Please try again.' });
    }

    res.json({
      ok: true,
      verificationId,
      expiresInMinutes: 10,
      message: 'Verification code sent.',
    });
  } catch (err) {
    console.error('[email-verification] send error:', err);
    res.status(500).json({ error: 'Could not send verification code. Please try again.' });
  }
});

app.post('/api/email-verifications/verify', bookingLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const verificationId = String(req.body?.verificationId || '').trim();
  const code = String(req.body?.code || '').trim();

  if (!isValidEmail(email) || !verificationId || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit verification code.' });
  }

  const verification = get(
    `SELECT * FROM email_verifications
     WHERE id = ? AND LOWER(email) = ?
     LIMIT 1`,
    [verificationId, email]
  );

  if (!verification) {
    return res.status(404).json({ error: 'Verification code not found. Please send a new code.' });
  }
  if (verification.verified_at) {
    return res.json({ ok: true, verificationId });
  }
  if (verification.expires_at <= new Date().toISOString()) {
    return res.status(400).json({ error: 'That verification code expired. Please send a new code.' });
  }
  if ((verification.attempts || 0) >= 5) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Please send a new code.' });
  }

  const matches = await bcrypt.compare(code, verification.code_hash);
  if (!matches) {
    run('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?', [verificationId]);
    saveDb();
    return res.status(400).json({ error: 'That code is not correct.' });
  }

  run('UPDATE email_verifications SET verified_at = ? WHERE id = ?', [new Date().toISOString(), verificationId]);
  saveDb();
  res.json({ ok: true, verificationId });
});

// --- Create Booking ---
// ============ BOOKINGS — CUSTOMER PATHS ============

// Legacy/admin path: creates a booking and marks it 'paid' IMMEDIATELY without
// a real payment processor. Originally the only path; now reserved for admin
// comp/staff bookings or any flow where money was collected elsewhere.
// Customer-facing UI should hit POST /api/bookings/initiate instead.
app.post('/api/bookings', adminAuth, (req, res) => {
  const validation = validateBookingRequest(req.body, { requireEmailVerification: false, requireCustomerDetails: false });
  if (!validation.ok) return res.status(validation.statusCode).json({ error: validation.error });
  const {
    sessionId,
    attendees,
    trimmedEmail,
    customerFirstName,
    customerLastName,
    emailVerifiedAt,
    useSessionPkgs,
    sessionPkgs,
    requiredPkg
  } = validation.data;

  const phdCheck = validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg);
  if (!phdCheck.ok) return res.status(400).json({ error: phdCheck.error });

  try {
    const { bookingId, refNumber, totalAmount, itemRefs } = insertBookingRecord({
      sessionId,
      attendees,
      requiredPkg,
      sessionPkgs,
      useSessionPkgs,
      email: trimmedEmail,
      customerFirstName,
      customerLastName,
      emailVerifiedAt
    });

    // No payment processor in this path — flip directly to 'paid'.
    // markBookingPaid handles seat flips, sockets, audit, and email.
    markBookingPaid({ bookingId, source: 'instant_legacy' });

    res.json({
      bookingId,
      referenceNumber: refNumber,
      itemReferences: itemRefs,
      totalAmount,
      totalFormatted: '$' + formatPrice(totalAmount),
      email: trimmedEmail,
      customerFirstName,
      customerLastName
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
  }
});

// Customer-facing path: creates a 'pending' booking, calls Authorize.Net for a
// hosted-payment-page token, returns it to the client. The client then POSTs
// the token to redirectUrl (Authorize.Net's hosted page domain), the customer
// enters their card, Authorize.Net redirects back to /payment/return, and
// /payment/return (or the webhook) calls markBookingPaid().
//
// Seats are NOT flipped to 'sold' here — they remain 'held' with a refreshed
// held_until so they survive the time the customer spends on the hosted page.
app.post('/api/bookings/initiate', bookingLimiter, async (req, res) => {
  const validation = validateBookingRequest(req.body);
  if (!validation.ok) return res.status(validation.statusCode).json({ error: validation.error });
  const {
    sessionId,
    attendees,
    trimmedEmail,
    customerFirstName,
    customerLastName,
    emailVerifiedAt,
    useSessionPkgs,
    sessionPkgs,
    requiredPkg
  } = validation.data;

  const phdCheck = validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg);
  if (!phdCheck.ok) return res.status(400).json({ error: phdCheck.error });

  let bookingId, refNumber, totalAmount, itemRefs;
  try {
    ({ bookingId, refNumber, totalAmount, itemRefs } = insertBookingRecord({
      sessionId,
      attendees,
      requiredPkg,
      sessionPkgs,
      useSessionPkgs,
      email: trimmedEmail,
      customerFirstName,
      customerLastName,
      emailVerifiedAt
    }));

    // Refresh held_until so seats survive the hosted-page detour.
    // HOLD_MINUTES is generous (60min) so this gives the customer a full hour
    // from clicking Confirm — comfortable even for slow / elderly users.
    const newHoldUntil = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
    for (const att of attendees) {
      run('UPDATE seats SET held_until = ? WHERE id = ?', [newHoldUntil, att.seatId]);
    }
    run('UPDATE bookings SET payment_attempted_at = ? WHERE id = ?',
      [new Date().toISOString(), bookingId]);

    saveDb();
    logPaymentEvent(bookingId, 'initiated', 'server', { totalAmount, refNumber });
  } catch (err) {
    console.error('Initiate booking insert error:', err);
    return res.status(500).json({ error: 'Booking initiation failed' });
  }

  // Get hosted-page token from Authorize.Net.
  const result = await createHostedPaymentPage({
    bookingId,
    amountCents: totalAmount,
    email: trimmedEmail,
    firstName: customerFirstName,
    lastName: customerLastName,
    refNumber,
  });

  if (!result.ok) {
    markBookingFailed({ bookingId, reason: result.error, source: 'server' });
    console.error(`[bookings] /initiate failed to get hosted page token: ${result.error}`);
    return res.status(502).json({ error: 'Could not start payment. Please try again.' });
  }

  run('UPDATE bookings SET hosted_token = ? WHERE id = ?', [result.token, bookingId]);
  saveDb();

  res.json({
    bookingId,
    referenceNumber: refNumber,
    itemReferences: itemRefs,
    totalAmount,
    totalFormatted: '$' + formatPrice(totalAmount),
    email: trimmedEmail,
    customerFirstName,
    customerLastName,
    redirectUrl: result.redirectUrl,
    token: result.token,
  });
});

// Status polling — used by the client processing page to check booking state
// while waiting for /payment/return or the webhook to flip it to paid/failed.
app.get('/api/bookings/:id/status', (req, res) => {
  const booking = get(
    'SELECT id, reference_number, payment_status, total_amount, payment_failure_reason, transaction_id, auth_code FROM bookings WHERE id = ?',
    [req.params.id]
  );
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json({
    bookingId: booking.id,
    referenceNumber: booking.reference_number,
    status: booking.payment_status,
    totalAmount: booking.total_amount,
    totalFormatted: '$' + formatPrice(booking.total_amount),
    failureReason: booking.payment_failure_reason,
    transactionId: booking.transaction_id,
  });
});

// ============ PAYMENT RETURN / CANCEL ============
//
// Authorize.Net redirects the customer's browser to one of these URLs after
// the hosted payment page finishes. Depending on the showReceipt setting,
// Authorize.Net uses either GET (showReceipt:true → user clicked Continue on
// their receipt page) or POST (showReceipt:false → browser submits form data
// with transaction details). We handle both with app.all.
//
// The webhook is still the primary payment signal, but the browser return can
// safely reconcile a payment when Authorize.Net includes a transaction id. The
// browser return is not trusted by itself; we verify server-to-server and only
// mark paid when invoice number and amount match our pending booking.

function firstString(...values) {
  for (const value of values) {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function findBookingForPaymentReturn(req) {
  const body = req.body || {};
  const bookingId = firstString(req.query.bookingId, body.bookingId, body.booking_id);
  const invoiceNumber = firstString(
    req.query.invoiceNumber,
    req.query.invoice,
    req.query.refNumber,
    body.invoiceNumber,
    body.invoice,
    body.refNumber,
    body.x_invoice_num,
    body.merchantReferenceId
  );

  if (bookingId) {
    const booking = get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (booking) return booking;
  }

  if (invoiceNumber) {
    const booking = get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
    if (booking) return booking;
  }

  return null;
}

function getReturnTransactionId(req) {
  const body = req.body || {};
  return firstString(
    req.query.transId,
    req.query.transactionId,
    req.query.transaction_id,
    body.transId,
    body.transactionId,
    body.transaction_id,
    body.x_trans_id
  );
}

async function reconcilePaymentReturn(booking, transactionId) {
  if (!transactionId || booking.payment_status === 'paid') return;

  const verify = await verifyTransaction(transactionId);
  if (!verify.ok) {
    logPaymentEvent(booking.id, 'return_verify_error', 'authorize_net_browser', {
      transactionId,
      error: verify.error,
    });
    return;
  }

  if (verify.invoiceNumber !== booking.reference_number) {
    logPaymentEvent(booking.id, 'return_verify_mismatch', 'authorize_net_browser', {
      transactionId,
      expectedInvoiceNumber: booking.reference_number,
      actualInvoiceNumber: verify.invoiceNumber,
    });
    return;
  }

  if (verify.amountCents !== booking.total_amount) {
    logPaymentEvent(booking.id, 'return_verify_mismatch', 'authorize_net_browser', {
      transactionId,
      expectedAmountCents: booking.total_amount,
      actualAmountCents: verify.amountCents,
    });
    return;
  }

  if (verify.approved) {
    markBookingPaid({
      bookingId: booking.id,
      transactionId,
      authCode: verify.authCode,
      source: 'authorize_net_browser_verified',
    });
    return;
  }

  if (['2', '3'].includes(String(verify.responseCode))) {
    markBookingFailed({
      bookingId: booking.id,
      reason: verify.error || `Authorize.Net response code ${verify.responseCode}`,
      source: 'authorize_net_browser_verified',
    });
  }
}

app.all('/payment/return', async (req, res) => {
  const booking = findBookingForPaymentReturn(req);
  const transactionId = getReturnTransactionId(req);
  const bookingId = booking?.id;
  if (!bookingId) {
    console.warn('[payments] /payment/return called without a matching booking', {
      method: req.method,
      bodyKeys: Object.keys(req.body || {}),
    });
    return res.redirect('/');
  }
  logPaymentEvent(bookingId, 'returned', 'authorize_net_browser', {
    method: req.method,
    transactionId: transactionId || null,
    bodyKeys: Object.keys(req.body || {}),
  });
  try {
    await reconcilePaymentReturn(booking, transactionId);
  } catch (err) {
    console.error('[payments] browser return reconciliation failed:', err?.message || err);
    logPaymentEvent(bookingId, 'return_verify_error', 'authorize_net_browser', {
      transactionId: transactionId || null,
      error: err?.message || String(err),
    });
  }
  return res.redirect(`/booking/${encodeURIComponent(bookingId)}/processing`);
});

app.all('/payment/cancel', (req, res) => {
  const booking = findBookingForPaymentReturn(req);
  if (booking?.id) {
    markBookingCancelled({ bookingId: booking.id, source: 'customer' });
  }
  // Client-side route — shows "Payment cancelled" with a "Try Again" button.
  // Seats remain 'held' so the customer can retry without losing them.
  return res.redirect(`/booking/${encodeURIComponent(booking?.id || '')}/cancelled`);
});

// ============ AUTHORIZE.NET WEBHOOK ============
//
// Authorize.Net posts payment lifecycle events to this URL. This is the
// AUTHORITATIVE source of truth for marking a booking 'paid' — not the
// browser redirect at /payment/return. The webhook fires regardless of
// what the customer's browser does and is signed with HMAC-SHA512.
//
// CRITICAL: this route uses express.raw() (not express.json()) because
// signature verification requires the unmodified body bytes. Once verified,
// we parse JSON ourselves.
//
// Webhook URL to register in Authorize.Net dashboard (Stage 9 task):
//   Sandbox:     https://bingo-jk2h.onrender.com/api/webhooks/authorize-net  (with sandbox creds in Render env)
//   Production:  same URL once ANET_ENV=production in Render env
//
// Events to subscribe in dashboard:
//   net.authorize.payment.authcapture.created   — payment captured (success)
//   net.authorize.payment.refund.created        — refund processed
//   net.authorize.payment.void.created          — pre-settlement void
//   net.authorize.payment.fraud.declined        — Authorize.Net's fraud rule rejected
//   net.authorize.payment.fraud.held            — held for manual fraud review
app.post('/api/webhooks/authorize-net',
  webhookLimiter,
  async (req, res) => {
    const rawBody = req.rawBody; // Buffer captured by express.json verify hook.
    const sigHeader = req.get('X-ANET-Signature');

    if (!Buffer.isBuffer(rawBody)) {
      console.warn('[webhooks] missing raw request body');
      return res.status(400).end();
    }

    // Parse the payload
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      console.error('[webhooks] malformed JSON:', err?.message || err);
      return res.status(400).end();
    }

    const { eventType, payload, notificationId } = event || {};
    const transId = payload?.id;
    const invoiceNumber = payload?.merchantReferenceId || payload?.invoiceNumber;
    const signatureValid = verifyWebhookSignature(rawBody, sigHeader);

    if (!invoiceNumber) {
      console.warn(`[webhooks] event has no invoiceNumber: ${eventType}`);
      return res.status(200).end(); // ack so Authorize.Net stops retrying
    }

    // We set Authorize.Net's invoiceNumber to our reference_number when
    // creating the hosted page, so we can look up the booking from it.
    const booking = get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
    if (!booking) {
      console.warn(`[webhooks] booking not found for invoiceNumber=${invoiceNumber} eventType=${eventType}`);
      return res.status(200).end(); // ack so Authorize.Net stops retrying
    }

    if (!signatureValid) {
      console.warn(`[webhooks] signature invalid for booking=${booking.id} ref=${invoiceNumber} eventType=${eventType}`);
      logPaymentEvent(booking.id, 'webhook_signature_invalid', 'authorize_net_webhook', {
        eventType,
        notificationId,
        transId,
        invoiceNumber,
      });

      if (eventType !== 'net.authorize.payment.authcapture.created' || !transId) {
        return res.status(401).end();
      }

      try {
        if (booking.payment_status === 'paid' && booking.transaction_id === transId) {
          return res.status(200).end();
        }

        const verify = await verifyTransaction(transId);
        const verifiedMatch = verify.ok &&
          verify.approved &&
          verify.invoiceNumber === booking.reference_number &&
          verify.amountCents === booking.total_amount;

        if (!verifiedMatch) {
          logPaymentEvent(booking.id, 'webhook_signature_invalid_rejected', 'authorize_net_webhook', {
            eventType,
            notificationId,
            transId,
            invoiceNumber,
            verifyOk: !!verify.ok,
            verifyApproved: !!verify.approved,
            verifyInvoiceNumber: verify.invoiceNumber || null,
            verifyAmountCents: verify.amountCents ?? null,
            error: verify.error || null,
          });
          return res.status(401).end();
        }

        logPaymentEvent(booking.id, 'webhook_signature_invalid_verified', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId,
          invoiceNumber,
        });
        markBookingPaid({
          bookingId: booking.id,
          transactionId: transId,
          authCode: verify.authCode,
          source: 'authorize_net_webhook_verified_transaction',
        });
        return res.status(200).end();
      } catch (err) {
        console.error(`[webhooks] invalid-signature fallback failed for ${eventType}:`, err?.message || err);
        logPaymentEvent(booking.id, 'webhook_error', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId,
          invoiceNumber,
          error: err?.message || String(err),
        });
        return res.status(500).end();
      }
    }

    // Always log the inbound event for audit / debugging
    logPaymentEvent(booking.id, 'webhook', 'authorize_net_webhook', {
      eventType, notificationId, transId, invoiceNumber,
    });

    console.log(`[webhooks] ${eventType} booking=${booking.id} ref=${invoiceNumber} transId=${transId}`);

    try {
      if (eventType === 'net.authorize.payment.authcapture.created') {
        // Idempotent — second webhook for the same booking is a no-op
        if (booking.payment_status === 'paid') {
          return res.status(200).end();
        }
        // Verify the transaction with Authorize.Net before flipping. Defence
        // in depth: the signature proves the payload is from Authorize.Net,
        // but a redundant API lookup also confirms the transaction approved.
        const verify = await verifyTransaction(transId);
        if (!verify.ok) {
          throw new Error(`Authorize.Net transaction verification failed: ${verify.error || 'unknown error'}`);
        }
        if (verify.approved) {
          markBookingPaid({
            bookingId: booking.id,
            transactionId: transId,
            authCode: verify.authCode,
            source: 'authorize_net_webhook',
          });
        } else {
          markBookingFailed({
            bookingId: booking.id,
            reason: verify.error || 'transaction not approved at verify step',
            source: 'authorize_net_webhook',
          });
        }
      } else if (eventType === 'net.authorize.payment.refund.created') {
        markBookingRefunded({
          bookingId: booking.id,
          transactionId: transId,
          source: 'authorize_net_webhook',
        });
      } else if (eventType === 'net.authorize.payment.void.created') {
        markBookingVoided({
          bookingId: booking.id,
          transactionId: transId,
          source: 'authorize_net_webhook',
        });
      } else if (eventType === 'net.authorize.payment.fraud.declined') {
        markBookingFailed({
          bookingId: booking.id,
          reason: 'fraud_declined',
          source: 'authorize_net_webhook',
        });
      } else if (eventType === 'net.authorize.payment.fraud.held') {
        // Authorize.Net is holding this for manual fraud review. Don't flip
        // anything yet — wait for the follow-up event (approved or declined).
        console.log(`[webhooks] booking ${booking.id} held by Authorize.Net for fraud review`);
      } else {
        console.log(`[webhooks] unhandled eventType: ${eventType}`);
      }
    } catch (err) {
      console.error(`[webhooks] handler error for ${eventType}:`, err?.message || err);
      logPaymentEvent(booking.id, 'webhook_error', 'authorize_net_webhook', {
        eventType,
        notificationId,
        transId,
        invoiceNumber,
        error: err?.message || String(err),
      });
      return res.status(500).end();
    }

    return res.status(200).end();
  }
);

// ============ ADMIN ============

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  // Check env-var admin
  if (username.toLowerCase() === (process.env.ADMIN_USERNAME || '').toLowerCase() && password === process.env.ADMIN_PASSWORD) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return res.json({ token, displayName: 'Admin', isSuperUser: true });
  }
  // Check DB admin users
  const dbUser = get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [username]);
  if (dbUser && bcrypt.compareSync(password, dbUser.password_hash)) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return res.json({
      token,
      displayName: dbUser.display_name || dbUser.email,
      isSuperUser: isSuperUser(dbUser.email, 'db', dbUser),
    });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// ============ ADMIN USERS ============

app.get('/api/admin/users', adminAuth, requireSuperUser, (req, res) => {
  const users = all('SELECT id, email, display_name, is_active, is_super_user, created_at FROM admin_users ORDER BY created_at');
  res.json(users);
});

app.post('/api/admin/users', adminAuth, requireSuperUser, (req, res) => {
  const { email, password, displayName, isSuperUser: makeSuperUser } = req.body;
  const normalizedEmail = (email || '').trim();
  if (!normalizedEmail || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'A valid email address is required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const existing = get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'User with this email already exists' });
  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  run('INSERT INTO admin_users (id, email, password_hash, display_name, is_super_user) VALUES (?, ?, ?, ?, ?)',
    [id, normalizedEmail, hash, displayName || null, makeSuperUser ? 1 : 0]);
  logAudit('admin_user_created', 'admin_user', id, {
    email: normalizedEmail,
    displayName: displayName || null,
    isSuperUser: !!makeSuperUser,
    createdBy: req.adminUser.email,
  });
  res.status(201).json({ id, email: normalizedEmail, displayName: displayName || null, isSuperUser: !!makeSuperUser });
});

app.patch('/api/admin/users/:id', adminAuth, requireSuperUser, (req, res) => {
  const { email, password, displayName, isActive } = req.body;
  const user = get('SELECT * FROM admin_users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (email !== undefined) {
    const normalizedEmail = (email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'A valid email address is required' });
    const existing = get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?) AND id <> ?', [normalizedEmail, req.params.id]);
    if (existing) return res.status(409).json({ error: 'User with this email already exists' });
    run('UPDATE admin_users SET email = ?, updated_at = datetime(\'now\') WHERE id = ?', [normalizedEmail, req.params.id]);
  }
  if (password && password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (password) run('UPDATE admin_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
  if (displayName !== undefined) run('UPDATE admin_users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?', [displayName, req.params.id]);
  if (isActive !== undefined) {
    if (user.email.toLowerCase() === 'kylepaul@stmec.com' && !isActive) {
      return res.status(400).json({ error: 'Kyle account must remain active' });
    }
    run('UPDATE admin_users SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
  }
  if (req.body.isSuperUser !== undefined) {
    if (user.email.toLowerCase() === 'kylepaul@stmec.com' && !req.body.isSuperUser) {
      return res.status(400).json({ error: 'Kyle account must remain a super user' });
    }
    run('UPDATE admin_users SET is_super_user = ?, updated_at = datetime(\'now\') WHERE id = ?', [req.body.isSuperUser ? 1 : 0, req.params.id]);
  }
  logAudit('admin_user_updated', 'admin_user', req.params.id, {
    email: email !== undefined ? email : user.email,
    updatedBy: req.adminUser.email,
  });
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', adminAuth, requireSuperUser, (req, res) => {
  const user = get('SELECT * FROM admin_users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.email.toLowerCase() === 'kylepaul@stmec.com') {
    return res.status(400).json({ error: 'Kyle account must remain active' });
  }
  run('UPDATE admin_users SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?', [req.params.id]);
  logAudit('admin_user_deactivated', 'admin_user', req.params.id, {
    email: user.email,
    deactivatedBy: req.adminUser.email,
  });
  res.json({ success: true });
});

// ============ SETTINGS ============

app.get('/api/admin/settings/:key', adminAuth, (req, res) => {
  const row = get('SELECT value FROM settings WHERE key = ?', [req.params.key]);
  if (!row) return res.json({ value: null });
  try {
    res.json({ value: JSON.parse(row.value) });
  } catch {
    res.json({ value: row.value });
  }
});

app.put('/api/admin/settings/:key', adminAuth, (req, res) => {
  const { value } = req.body;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const existing = get('SELECT key FROM settings WHERE key = ?', [req.params.key]);
  if (existing) {
    run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?", [serialized, req.params.key]);
  } else {
    run("INSERT INTO settings (key, value) VALUES (?, ?)", [serialized, req.params.key]);
  }
  res.json({ ok: true });
});

// ============ PHD INVENTORY (Admin) ============

app.get('/api/admin/phd-inventory', adminAuth, (req, res) => {
  res.json({
    ...getPhdInventoryForSession(String(req.query.sessionId || getNextPhdSessionId() || '').trim()),
    perSession: getPhdUsageBySession()
  });
});

app.put('/api/admin/phd-inventory', adminAuth, (req, res) => {
  const { totalStock, perPlayerLimit } = req.body;
  const config = {
    totalStock: totalStock != null ? Number(totalStock) : 200,
    perPlayerLimit: perPlayerLimit != null ? Number(perPlayerLimit) : 2
  };

  const existing = get("SELECT key FROM settings WHERE key = 'phd_inventory'");
  if (existing) {
    run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'phd_inventory'", [JSON.stringify(config)]);
  } else {
    run("INSERT INTO settings (key, value) VALUES ('phd_inventory', ?)", [JSON.stringify(config)]);
  }

  logAudit('phd_inventory_updated', 'settings', 'phd_inventory', config);
  res.json({ ok: true, ...config });
});

app.get('/api/admin/dashboard', adminAuth, (req, res) => {
  const today = formatLocalDate(new Date());
  const dateFrom = req.query.dateFrom || req.query.date || today;
  const dateTo = req.query.dateTo || dateFrom;
  const todayBookings = get(
    `SELECT COUNT(*) as count FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE s.date >= ? AND s.date <= ? AND b.payment_status = 'paid'`, [dateFrom, dateTo]
  );
  const todayRevenue = get(
    `SELECT COALESCE(SUM(b.total_amount), 0) as total FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE s.date >= ? AND s.date <= ? AND b.payment_status = 'paid'`, [dateFrom, dateTo]
  );
  const upcomingSessions = all(
    `SELECT s.*,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'vacant' AND is_disabled = 0) as available,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'sold') as sold,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'held') as held,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND is_disabled = 0) as total
    FROM sessions s WHERE s.date >= ? AND s.deleted_at IS NULL ORDER BY s.date ASC LIMIT 7`, [today]
  );

  // Table/chair metrics for the filter date range sessions
  const seatMetrics = get(
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

  // Tables breakdown: available (all chairs vacant), partially occupied, fully occupied
  const tableBreakdown = all(
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

  let availableTables = 0, partialTables = 0, fullTables = 0;
  for (const t of tableBreakdown) {
    if (t.sold === 0 && t.held === 0) availableTables++;
    else if (t.vacant === 0) fullTables++;
    else partialTables++;
  }

  // Number of persons (booking items) for filter date range
  const personsCount = get(
    `SELECT COUNT(*) as count FROM booking_items bi
     JOIN bookings b ON bi.booking_id = b.id
     JOIN sessions s ON b.session_id = s.id
     WHERE s.date >= ? AND s.date <= ? AND b.payment_status = 'paid'`, [dateFrom, dateTo]
  );

  res.json({
    dateFrom,
    dateTo,
    todayBookings: todayBookings?.count || 0,
    todayRevenue: todayRevenue?.total || 0,
    todayRevenueFormatted: '$' + formatPrice(todayRevenue?.total || 0),
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
    phdInventory: (() => {
      const sessionRow = get(
        `SELECT id FROM sessions
         WHERE date >= ? AND is_available = 1 AND deleted_at IS NULL
         ORDER BY date ASC, time ASC
         LIMIT 1`,
        [dateFrom]
      );
      return getPhdInventoryForSession(sessionRow?.id || getNextPhdSessionId());
    })()
  });
});

app.get('/api/admin/daily-sales', adminAuth, (req, res) => {
  const date = req.query.date || formatLocalDate(new Date());
  const search = (req.query.search || '').trim().toLowerCase();
  const rows = all(`
    SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at,
           b.email, b.customer_first_name, b.customer_last_name,
           s.date as session_date, s.time as session_time,
           s.is_special_event, s.event_title,
           bi.id as item_id, bi.first_name, bi.last_name, bi.price as item_price,
           bi.reference_number as item_reference_number,
           seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    WHERE s.date = ? AND b.payment_status = 'paid'
    ORDER BY b.created_at ASC, b.id, bi.id
  `, [date]);

  // Load addons for all items in one query
  const allAddons = all(`
    SELECT ba.booking_item_id, ba.quantity, ba.price,
           COALESCE(p.name, sp.name) as package_name
    FROM booking_addons ba
    LEFT JOIN packages p ON p.id = ba.package_id
    LEFT JOIN session_packages sp ON sp.id = ba.package_id
    JOIN booking_items bi ON bi.id = ba.booking_item_id
    JOIN bookings b ON b.id = bi.booking_id
    JOIN sessions s ON s.id = b.session_id
    WHERE s.date = ? AND b.payment_status = 'paid'
  `, [date]);
  const addonsByItem = {};
  for (const a of allAddons) {
    if (!addonsByItem[a.booking_item_id]) addonsByItem[a.booking_item_id] = [];
    addonsByItem[a.booking_item_id].push({
      packageName: a.package_name,
      quantity: a.quantity,
      price: a.price,
      priceFormatted: '$' + formatPrice(a.price)
    });
  }

  // Filter by name search if provided
  let filtered = rows;
  if (search) {
    filtered = rows.filter(r => {
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
      return fullName.includes(search) || r.reference_number.toLowerCase().includes(search);
    });
  }

  // Build individual ticket items
  const items = filtered.map((r, i) => ({
    rowNum: i + 1,
    id: r.item_id,
    bookingId: r.id,
    referenceNumber: r.item_reference_number || r.reference_number,
    firstName: r.first_name,
    lastName: r.last_name,
    tableNumber: r.table_number,
    chairNumber: r.chair_number,
    packageName: r.package_name,
    description: r.is_special_event && r.event_title ? r.event_title : `Bingo Session ${r.session_time}`,
    sessionDate: r.session_date,
    sessionTime: r.session_time,
    itemPrice: r.item_price,
    itemPriceFormatted: '$' + formatPrice(r.item_price),
    totalAmount: r.total_amount,
    totalFormatted: '$' + formatPrice(r.total_amount),
    addons: addonsByItem[r.item_id] || [],
    createdAt: r.created_at
  }));

  // Calculate unique bookings and grand total from filtered results
  const uniqueBookings = new Set(filtered.map(r => r.id));
  const grandTotal = [...uniqueBookings].reduce((sum, bid) => {
    const booking = filtered.find(r => r.id === bid);
    return sum + (booking ? booking.total_amount : 0);
  }, 0);

  // Calculate package subtotal (base ticket prices) and addon subtotal
  const packageSubtotal = items.reduce((sum, item) => sum + item.itemPrice, 0);
  const addonSubtotal = items.reduce((sum, item) => {
    return sum + (item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0);
  }, 0);

  res.json({
    date,
    items,
    totalTickets: items.length,
    totalBookings: uniqueBookings.size,
    grandTotal,
    grandTotalFormatted: '$' + formatPrice(grandTotal),
    packageSubtotal,
    packageSubtotalFormatted: '$' + formatPrice(packageSubtotal),
    addonSubtotal,
    addonSubtotalFormatted: '$' + formatPrice(addonSubtotal)
  });
});

app.get('/api/admin/booking-sales', adminAuth, (req, res) => {
  const rows = all(`
    SELECT s.id, s.date, s.time, s.is_special_event, s.event_title, ${sessionTypeSql('s')} as session_type,
      COUNT(DISTINCT b.id) as quantity,
      COALESCE(SUM(b.total_amount), 0) as total_amount
    FROM sessions s
    LEFT JOIN bookings b ON b.session_id = s.id AND b.payment_status = 'paid'
    WHERE s.deleted_at IS NULL
    GROUP BY s.id
    ORDER BY s.date ASC, s.time ASC
  `);
  res.json(rows.map(r => ({
    id: r.id,
    date: r.date,
    time: r.time,
    description: r.session_type === 'event' && r.event_title ? r.event_title : r.is_special_event && r.event_title ? r.event_title : `${r.date} — ${r.time}`,
    sessionType: r.session_type,
    isSpecialEvent: !!r.is_special_event,
    eventTitle: r.event_title,
    quantity: r.quantity,
    totalAmount: r.total_amount,
    totalFormatted: '$' + formatPrice(r.total_amount)
  })));
});

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

app.get('/api/admin/sessions', adminAuth, (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  res.json(all(`SELECT * FROM sessions ${where} ORDER BY date ASC, time ASC`));
});

app.post('/api/admin/sessions', adminAuth, (req, res) => {
  const { date, time, cutoff_time, is_available, is_special_event, event_title, event_description, packages: pkgs } = req.body;
  const sessionType = normalizeSessionType(req.body.session_type, is_special_event);
  const isSpecialType = sessionType === 'special_bingo' || sessionType === 'event';
  const packageDrafts = sessionType === 'special_bingo' && (!Array.isArray(pkgs) || pkgs.length === 0)
    ? getDefaultSpecialBingoPackages()
    : pkgs;
  const packageValidation = validateSessionPackagesForType(sessionType, packageDrafts);
  if (!packageValidation.ok) return res.status(400).json({ error: packageValidation.error });

  // Prevent duplicate sessions on the same date within the same hour
  const requestHour = time ? time.split(':')[0] : '18';
  const conflict = get(
    `SELECT id, date, time FROM sessions WHERE date = ? AND SUBSTR(time, 1, 2) = ? AND deleted_at IS NULL`,
    [date, requestHour]
  );
  if (conflict) {
    return res.status(409).json({ error: `A bingo session already exists on ${date} at ${conflict.time}. Cannot create another session in the same hour.` });
  }

  const id = uuid();
  run('INSERT INTO sessions (id, date, time, cutoff_time, is_available, is_special_event, event_title, event_description, session_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, date, time, cutoff_time || '12:00', is_available !== false ? 1 : 0, isSpecialType ? 1 : 0, event_title || null, event_description || null, sessionType]);

  // Create 73 tables x 6 chairs = 438 chairs per session
  let chairCount = 0;
  for (let tNum = 1; tNum <= 73; tNum++) {
    for (let ch = 1; ch <= 6; ch++) {
      run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
        [uuid(), id, tNum, ch, 'vacant']);
      chairCount++;
    }
  }

  // Create session-specific packages if provided
  if (packageValidation.packages.length > 0) {
    for (const pkg of packageValidation.packages) {
      run('INSERT INTO session_packages (id, session_id, name, price, type, max_quantity, sort_order, is_phd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), id, pkg.name, pkg.price, pkg.type, pkg.max_quantity || 1, pkg.sort_order || 0, pkg.is_phd ? 1 : 0]);
    }
  }

  logAudit('session_created', 'session', id, { date, time, cutoff_time, session_type: sessionType, is_special_event: isSpecialType, event_title });

  // Flush to disk immediately — critical write should not rely on debounced save
  saveDb();

  res.json({ id, date, time, cutoff_time, is_available, session_type: sessionType, is_special_event: isSpecialType, event_title, totalChairs: chairCount });
});

app.patch('/api/admin/sessions/:id', adminAuth, (req, res) => {
  const { date, time, cutoff_time, is_available, is_special_event, event_title, event_description, session_type } = req.body;
  const updates = [];
  const values = [];
  const nextSessionType = session_type !== undefined ? normalizeSessionType(session_type, is_special_event) : null;
  if (date !== undefined) { updates.push('date = ?'); values.push(date); }
  if (time !== undefined) { updates.push('time = ?'); values.push(time); }
  if (cutoff_time !== undefined) { updates.push('cutoff_time = ?'); values.push(cutoff_time); }
  if (is_available !== undefined) { updates.push('is_available = ?'); values.push(is_available ? 1 : 0); }
  if (nextSessionType !== null) {
    updates.push('session_type = ?');
    values.push(nextSessionType);
    updates.push('is_special_event = ?');
    values.push(nextSessionType === 'special_bingo' || nextSessionType === 'event' ? 1 : 0);
  } else if (is_special_event !== undefined) {
    const legacyType = normalizeSessionType(undefined, is_special_event);
    updates.push('session_type = ?');
    values.push(legacyType);
    updates.push('is_special_event = ?');
    values.push(legacyType === 'special_bingo' ? 1 : 0);
  }
  if (event_title !== undefined) { updates.push('event_title = ?'); values.push(event_title || null); }
  if (event_description !== undefined) { updates.push('event_description = ?'); values.push(event_description || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields' });

  // Prevent duplicate sessions when changing date or time
  if (date !== undefined || time !== undefined) {
    const current = get('SELECT date, time FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (current) {
      const checkDate = date !== undefined ? date : current.date;
      const checkTime = time !== undefined ? time : current.time;
      const checkHour = checkTime.split(':')[0];
      const conflict = get(
        `SELECT id, date, time FROM sessions WHERE date = ? AND SUBSTR(time, 1, 2) = ? AND id != ? AND deleted_at IS NULL`,
        [checkDate, checkHour, req.params.id]
      );
      if (conflict) {
        return res.status(409).json({ error: `A bingo session already exists on ${checkDate} at ${conflict.time}. Cannot have another session in the same hour.` });
      }
    }
  }

  values.push(req.params.id);
  run(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ success: true });
});

app.delete('/api/admin/sessions/:id', adminAuth, (req, res) => {
  const session = get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Capture booking/attendee data before soft-deleting
  const bookings = all(`
    SELECT b.id, b.reference_number, b.total_amount, b.payment_status,
           bi.first_name, bi.last_name, seats.table_number, seats.chair_number
    FROM bookings b
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    WHERE b.session_id = ?
  `, [req.params.id]);

  const now = new Date().toISOString();
  run('UPDATE sessions SET deleted_at = ? WHERE id = ?', [now, req.params.id]);

  logAudit('session_deleted', 'session', req.params.id, {
    date: session.date,
    time: session.time,
    bookings: bookings.map(b => ({
      ref: b.reference_number,
      amount: b.total_amount,
      status: b.payment_status,
      attendee: `${b.first_name} ${b.last_name}`,
      table: b.table_number,
      chair: b.chair_number
    }))
  });

  saveDb();
  res.json({ success: true });
});

app.get('/api/admin/packages', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM packages ORDER BY sort_order ASC'));
});

app.post('/api/admin/packages', adminAuth, (req, res) => {
  const { name, price, type, max_quantity, sort_order, is_phd } = req.body;
  const id = uuid();
  run('INSERT INTO packages (id, name, price, type, max_quantity, is_active, sort_order, is_phd) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    [id, name, price, type, max_quantity || 1, sort_order || 0, is_phd ? 1 : 0]);
  res.json({ id, name, price, type, is_phd: is_phd ? 1 : 0 });
});

app.patch('/api/admin/packages/:id', adminAuth, (req, res) => {
  const { name, price, type, max_quantity, is_active, sort_order } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (price !== undefined) { updates.push('price = ?'); values.push(price); }
  if (type !== undefined) { updates.push('type = ?'); values.push(type); }
  if (max_quantity !== undefined) { updates.push('max_quantity = ?'); values.push(max_quantity); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (req.body.is_phd !== undefined) { updates.push('is_phd = ?'); values.push(req.body.is_phd ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
  values.push(req.params.id);
  run(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ success: true });
});

// Delete a package — but ONLY if it isn't referenced by any historical booking.
// booking_items.package_id and booking_addons.package_id are FKs into packages(id),
// and `PRAGMA foreign_keys = ON`, so deleting a referenced package would fail with
// a constraint violation AND would corrupt historical sales reports if it didn't.
// If the package has bookings, we return 409 with a clear message telling the
// admin to Disable it instead.
app.delete('/api/admin/packages/:id', adminAuth, (req, res) => {
  const id = req.params.id;
  const pkg = get('SELECT id, name FROM packages WHERE id = ?', [id]);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const itemRow = get('SELECT COUNT(*) AS c FROM booking_items WHERE package_id = ?', [id]);
  const addonRow = get('SELECT COUNT(*) AS c FROM booking_addons WHERE package_id = ?', [id]);
  const totalRefs = (itemRow ? itemRow.c : 0) + (addonRow ? addonRow.c : 0);

  if (totalRefs > 0) {
    return res.status(409).json({
      error: 'package_in_use',
      message: `Cannot delete "${pkg.name}" — it is referenced by ${totalRefs} booking record${totalRefs === 1 ? '' : 's'}. Disable it instead so it stops appearing on new bookings while preserving sales history.`,
      references: totalRefs,
    });
  }

  run('DELETE FROM packages WHERE id = ?', [id]);
  res.json({ success: true, deleted: pkg.name });
});

app.patch('/api/admin/seats/:id', adminAuth, (req, res) => {
  const { is_disabled } = req.body;
  if (is_disabled !== undefined) {
    const seat = get('SELECT * FROM seats WHERE id = ?', [req.params.id]);
    if (!seat) return res.status(404).json({ error: 'Seat not found' });
    run('UPDATE seats SET is_disabled = ? WHERE id = ?', [is_disabled ? 1 : 0, req.params.id]);
    io.to(`session:${seat.session_id}`).emit('seats:refresh');
  }
  res.json({ success: true });
});

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
           bi.reference_number as item_reference_number,
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
    `, [row.item_id]).map(a => ({
      packageName: a.package_name,
      quantity: a.quantity,
      price: a.price,
      priceFormatted: '$' + formatPrice(a.price)
    }));

    bookings[row.id].items.push({
      firstName: row.first_name,
      lastName: row.last_name,
      tableNumber: row.table_number,
      chairNumber: row.chair_number,
      referenceNumber: row.item_reference_number,
      packageName: row.package_name,
      packagePrice: row.package_price,
      packagePriceFormatted: '$' + formatPrice(row.package_price),
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
  res.setHeader('Content-Disposition', `attachment; filename=bookings-report.csv`);
  res.send(csv);
});

app.post('/api/admin/bookings/:id/cancel', adminAuth, (req, res) => {
  const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const items = all('SELECT bi.*, seats.table_number, seats.chair_number FROM booking_items bi JOIN seats ON seats.id = bi.seat_id WHERE bi.booking_id = ?', [req.params.id]);
  for (const item of items) {
    run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [item.seat_id]);
  }
  run(`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?`, [req.params.id]);

  logAudit('booking_cancelled', 'booking', req.params.id, {
    referenceNumber: booking.reference_number,
    sessionId: booking.session_id,
    totalAmount: booking.total_amount,
    attendees: items.map(i => ({
      name: `${i.first_name} ${i.last_name}`,
      table: i.table_number,
      chair: i.chair_number
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
    run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [item.seat_id]);
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
    run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [item.seat_id]);
  }

  logAudit('booking_deleted', 'booking', booking.id, {
    referenceNumber: booking.reference_number,
    sessionId: booking.session_id,
    paymentStatus: booking.payment_status,
    totalAmount: booking.total_amount,
    attendees: items.map(i => ({ firstName: i.first_name, lastName: i.last_name })),
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

// Refund a paid booking through Authorize.Net. Automatically decides between
// VOID (pre-settlement) and REFUND (post-settlement) based on the transaction's
// current status. Always releases seats back to 'vacant'.
//
// Note: this is distinct from /cancel above. /cancel is an admin override that
// only updates the booking record and releases seats — no money moves.
// /refund actually moves money via Authorize.Net.
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

  // Look up the transaction's current settlement status so we know whether to
  // void or refund.
  const verify = await verifyTransaction(booking.transaction_id);
  if (!verify.ok) {
    return res.status(502).json({ error: `Could not verify transaction state: ${verify.error}` });
  }

  const txStatus = String(verify.status || '');
  let action;
  let result;
  let markResult;

  if (txStatus === 'capturedPendingSettlement' || txStatus === 'authorizedPendingCapture') {
    // Pre-settlement → VOID. Faster + no settlement fees.
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
    // Post-settlement → REFUND. Needs card last4.
    action = 'refund';
    if (!verify.last4) {
      return res.status(502).json({ error: 'Could not determine card last 4 for refund — Authorize.Net API did not return card details.' });
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
    action,                                              // 'void' or 'refund'
    refundTransId: result.refundTransId || result.voidTransId,
    seatsReleased: markResult?.releasedSeats || 0,
  });
});

// ============ ADMIN: DELETED SESSIONS & AUDIT LOG ============

app.get('/api/admin/sessions/deleted', adminAuth, (req, res) => {
  const sessions = all(`
    SELECT s.*,
      (SELECT COUNT(*) FROM bookings WHERE session_id = s.id AND payment_status = 'paid') as paid_bookings,
      (SELECT COALESCE(SUM(total_amount), 0) FROM bookings WHERE session_id = s.id AND payment_status = 'paid') as total_revenue
    FROM sessions s
    WHERE s.deleted_at IS NOT NULL
    ORDER BY s.deleted_at DESC
  `);
  res.json(sessions);
});

app.get('/api/admin/sessions/:id/bookings', adminAuth, (req, res) => {
  const rows = all(`
    SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at,
           b.email, b.customer_first_name, b.customer_last_name,
           bi.id as booking_item_id, bi.first_name, bi.last_name, bi.price as item_price,
           bi.reference_number as item_reference_number,
           bi.printed_at as item_printed_at,
           seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name
    FROM bookings b
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    WHERE b.session_id = ?
    ORDER BY b.created_at DESC, b.id, bi.id
  `, [req.params.id]);

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
        attendees: []
      };
    }
    bookings[row.id].attendees.push({
      firstName: row.first_name,
      lastName: row.last_name,
      tableNumber: row.table_number,
      chairNumber: row.chair_number,
      referenceNumber: row.item_reference_number,
      packageName: row.package_name,
      itemPrice: row.item_price,
      itemPriceFormatted: '$' + formatPrice(row.item_price)
    });
  }
  res.json(Object.values(bookings));
});

app.post('/api/admin/sessions/:id/restore', adminAuth, (req, res) => {
  const session = get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Deleted session not found' });

  run('UPDATE sessions SET deleted_at = NULL WHERE id = ?', [req.params.id]);
  logAudit('session_restored', 'session', req.params.id, { date: session.date, time: session.time });
  saveDb();
  res.json({ success: true });
});

app.get('/api/admin/audit-log', adminAuth, (req, res) => {
  const { action, entity_type, entity_id, limit: lim } = req.query;
  let where = [];
  const params = [];
  if (action) { where.push('action = ?'); params.push(action); }
  if (entity_type) { where.push('entity_type = ?'); params.push(entity_type); }
  if (entity_id) { where.push('entity_id = ?'); params.push(entity_id); }
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const limitVal = Math.min(parseInt(lim) || 100, 500);
  const logs = all(`SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ?`, [...params, limitVal]);
  // Parse details JSON for convenience
  res.json(logs.map(l => ({ ...l, details: l.details ? JSON.parse(l.details) : null })));
});

// ============ ADMIN: ANNOUNCEMENTS ============

app.get('/api/admin/announcements', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM announcements ORDER BY sort_order ASC, created_at DESC'));
});

app.post('/api/admin/announcements', adminAuth, (req, res) => {
  const { title, message, type, is_active, start_date, end_date, sort_order, image_url } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const id = uuid();
  const now = new Date().toISOString();
  run('INSERT INTO announcements (id, title, message, type, is_active, start_date, end_date, sort_order, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, title || null, message, type || 'info', is_active !== false ? 1 : 0, start_date || null, end_date || null, sort_order || 0, image_url || null, now, now]);
  io.emit('announcements:refresh');
  res.json({ id, title, message, type: type || 'info', image_url: image_url || null });
});

// Image upload for announcements
app.post('/api/admin/upload', adminAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  try {
    const saved = await saveUploadedImage(req.file);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid image upload' });
  }
});

app.patch('/api/admin/announcements/:id', adminAuth, (req, res) => {
  const { title, message, type, is_active, start_date, end_date, sort_order, image_url } = req.body;
  const updates = [];
  const values = [];
  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (message !== undefined) { updates.push('message = ?'); values.push(message); }
  if (type !== undefined) { updates.push('type = ?'); values.push(type); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date || null); }
  if (end_date !== undefined) { updates.push('end_date = ?'); values.push(end_date || null); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
  updates.push("updated_at = ?"); values.push(new Date().toISOString());
  values.push(req.params.id);
  run(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, values);
  io.emit('announcements:refresh');
  res.json({ success: true });
});

app.delete('/api/admin/announcements/:id', adminAuth, (req, res) => {
  run('DELETE FROM announcements WHERE id = ?', [req.params.id]);
  io.emit('announcements:refresh');
  res.json({ success: true });
});

// ============ ADMIN: SESSION PACKAGES (Special Events) ============

app.get('/api/admin/sessions/:id/packages', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [req.params.id]));
});

app.post('/api/admin/sessions/:id/packages', adminAuth, (req, res) => {
  const { packages: pkgs } = req.body;
  if (!Array.isArray(pkgs)) return res.status(400).json({ error: 'packages array required' });
  const session = get('SELECT is_special_event, session_type FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const sessionType = normalizeSessionType(session.session_type, session.is_special_event);
  const packageDrafts = sessionType === 'special_bingo' && pkgs.length === 0
    ? getDefaultSpecialBingoPackages()
    : pkgs;
  const packageValidation = validateSessionPackagesForType(
    sessionType,
    packageDrafts
  );
  if (!packageValidation.ok) return res.status(400).json({ error: packageValidation.error });

  // Replace all session packages
  run('DELETE FROM session_packages WHERE session_id = ?', [req.params.id]);
  for (const pkg of packageValidation.packages) {
    const id = uuid();
    run('INSERT INTO session_packages (id, session_id, name, price, type, max_quantity, sort_order, is_phd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.id, pkg.name, pkg.price, pkg.type, pkg.max_quantity || 1, pkg.sort_order || 0, pkg.is_phd ? 1 : 0]);
  }
  res.json({ success: true, count: packageValidation.packages.length });
});

// --- Admin: Schedule info and manual trigger ---
app.get('/api/admin/schedule', adminAuth, (req, res) => {
  res.json(getScheduleSummary());
});

app.post('/api/admin/schedule/generate', adminAuth, (req, res) => {
  openWeeklySessions();
  const result = ensureFutureSessions();
  res.json({
    success: true,
    message: result.skipped
      ? 'Auto-generation is currently disabled or has no active days configured. No sessions were created.'
      : `Generated ${result.created} new session(s) over the next ${result.lookAheadDays} day(s).`,
    ...result
  });
});

// --- Admin: Recurring schedule CRUD (drives the auto-generator) ---
//
// Each row in `recurring_schedules` represents one weekly slot
// ("Tuesday at 18:30 with cutoff 12:00, regular bingo, active").
// The generator runs on server boot, hourly thereafter, and on demand via
// POST /api/admin/schedule/generate. All endpoints require admin auth.
//
// Notes:
// - day_of_week is 0-6 with 0 = Sunday, matching JS Date.getDay().
// - Time fields are HH:MM strings; we don't enforce timezone — the server's
//   local TZ is whatever Render decided.
// - Deletes are hard, not soft. Already-generated sessions stay; only future
//   generation for that day stops. This is the safe default — admins can
//   always edit/delete individual sessions on the Sessions tab.
const VALID_SESSION_TYPES = new Set(['regular_bingo', 'special_bingo', 'event']);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeRecurringPayload(payload) {
  const day = Number(payload.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return { error: 'day_of_week must be an integer 0-6 (0=Sunday)' };
  }
  const time = String(payload.time || '').trim();
  if (!TIME_REGEX.test(time)) return { error: 'time must be HH:MM (24-hour)' };
  const cutoff = String(payload.cutoff_time || '12:00').trim();
  if (!TIME_REGEX.test(cutoff)) return { error: 'cutoff_time must be HH:MM (24-hour)' };
  const sessionType = String(payload.session_type || 'regular_bingo');
  if (!VALID_SESSION_TYPES.has(sessionType)) {
    return { error: `session_type must be one of: ${[...VALID_SESSION_TYPES].join(', ')}` };
  }
  const isActive = payload.is_active === false || payload.is_active === 0 ? 0 : 1;
  return { day, time, cutoff, sessionType, isActive };
}

app.get('/api/admin/recurring-schedules', adminAuth, (req, res) => {
  res.json({
    schedules: listRecurringSchedules(),
    config: getAutoGenerateConfig(),
    dayLabels: DAY_LABELS,
  });
});

app.post('/api/admin/recurring-schedules', adminAuth, (req, res) => {
  const norm = normalizeRecurringPayload(req.body || {});
  if (norm.error) return res.status(400).json({ error: norm.error });

  const id = uuid();
  run(
    `INSERT INTO recurring_schedules
       (id, day_of_week, time, cutoff_time, session_type, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, norm.day, norm.time, norm.cutoff, norm.sessionType, norm.isActive]
  );
  logAudit('recurring_schedule_created', 'recurring_schedule', id, {
    day_of_week: norm.day, time: norm.time, cutoff_time: norm.cutoff, session_type: norm.sessionType
  });
  saveDb();
  res.json({ id, day_of_week: norm.day, time: norm.time, cutoff_time: norm.cutoff, session_type: norm.sessionType, is_active: norm.isActive });
});

app.patch('/api/admin/recurring-schedules/:id', adminAuth, (req, res) => {
  const existing = get('SELECT * FROM recurring_schedules WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const payload = {
    day_of_week: req.body.day_of_week !== undefined ? req.body.day_of_week : existing.day_of_week,
    time: req.body.time !== undefined ? req.body.time : existing.time,
    cutoff_time: req.body.cutoff_time !== undefined ? req.body.cutoff_time : existing.cutoff_time,
    session_type: req.body.session_type !== undefined ? req.body.session_type : existing.session_type,
    is_active: req.body.is_active !== undefined ? req.body.is_active : existing.is_active,
  };
  const norm = normalizeRecurringPayload(payload);
  if (norm.error) return res.status(400).json({ error: norm.error });

  run(
    `UPDATE recurring_schedules
        SET day_of_week = ?, time = ?, cutoff_time = ?, session_type = ?, is_active = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
    [norm.day, norm.time, norm.cutoff, norm.sessionType, norm.isActive, req.params.id]
  );
  logAudit('recurring_schedule_updated', 'recurring_schedule', req.params.id, payload);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/admin/recurring-schedules/:id', adminAuth, (req, res) => {
  const existing = get('SELECT * FROM recurring_schedules WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  run('DELETE FROM recurring_schedules WHERE id = ?', [req.params.id]);
  logAudit('recurring_schedule_deleted', 'recurring_schedule', req.params.id, {
    day_of_week: existing.day_of_week, time: existing.time
  });
  saveDb();
  res.json({ success: true });
});

app.get('/api/admin/recurring-schedules/summary', adminAuth, (req, res) => {
  res.json(getScheduleSummary());
});

app.patch('/api/admin/recurring-schedules/config', adminAuth, (req, res) => {
  const patch = {};
  if (req.body.lookAheadDays !== undefined) patch.lookAheadDays = Number(req.body.lookAheadDays);
  if (req.body.enabled !== undefined) patch.enabled = !!req.body.enabled;
  const next = updateAutoGenerateConfig(patch);
  logAudit('auto_generate_config_updated', 'settings', 'auto_generate_config', next);
  saveDb();
  res.json(next);
});

// ============ ADMIN: BULK TICKETS (Print special-event template tickets) ============

app.get('/api/admin/bookings/bulk-tickets', adminAuth, (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom) return res.status(400).json({ error: 'dateFrom query parameter required' });

  const endDate = dateTo || dateFrom;
  const requestedDepartment = req.query.department === 'event' ? 'event' : 'special_bingo';

  // Check if special event columns exist
  let hasSpecialEvent = false;
  try {
    all('SELECT is_special_event FROM sessions LIMIT 1');
    hasSpecialEvent = true;
  } catch (e) { /* column doesn't exist */ }

  const specialCols = hasSpecialEvent ? `, s.is_special_event, s.event_title, ${sessionTypeSql('s')} as session_type` : '';

  // Get paid bookings for template-print sessions within the date range.
  // Regular bingo orders are handled as thermal receipts, not letter-size ticket templates.
  const rows = all(`
    SELECT b.id as booking_id, b.reference_number, b.total_amount, b.payment_status,
           s.id as session_id, s.date as session_date, s.time as session_time
           ${specialCols},
           bi.first_name, bi.last_name, bi.price as item_price,
           bi.reference_number as item_reference_number,
           seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    WHERE s.date >= ? AND s.date <= ? AND b.payment_status = 'paid'
      ${hasSpecialEvent ? `AND ${sessionTypeSql('s')} = ?` : 'AND 1 = 0'}
    ORDER BY s.date ASC, s.time ASC, b.reference_number, seats.table_number, seats.chair_number
  `, hasSpecialEvent ? [dateFrom, endDate, requestedDepartment] : [dateFrom, endDate]);

  // Group by session, then by booking
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
    const sess = sessions[row.session_id];
    if (!sess.bookings[row.booking_id]) {
      sess.bookings[row.booking_id] = {
        referenceNumber: row.reference_number,
        totalAmount: row.total_amount,
        totalFormatted: '$' + formatPrice(row.total_amount),
        tickets: []
      };
    }
    sess.bookings[row.booking_id].tickets.push({
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

  // Flatten to array format
  const result = Object.values(sessions).map(s => ({
    ...s,
    bookings: Object.values(s.bookings)
  }));

  const totalTickets = result.reduce((sum, s) => sum + s.bookings.reduce((bs, b) => bs + b.tickets.length, 0), 0);

  res.json({
    dateFrom,
    dateTo: endDate,
    printMode: 'template',
    department: requestedDepartment,
    sessions: result,
    totalTickets
  });
});

app.post('/api/admin/bookings/bulk-tickets/mark-printed', adminAuth, (req, res) => {
  const ticketIds = Array.isArray(req.body?.ticketIds)
    ? req.body.ticketIds.map(id => String(id || '').trim()).filter(Boolean)
    : [];

  if (ticketIds.length === 0) {
    return res.status(400).json({ error: 'ticketIds array required' });
  }

  const uniqueIds = [...new Set(ticketIds)].slice(0, 1000);
  const placeholders = uniqueIds.map(() => '?').join(',');
  const now = new Date().toISOString();
  const result = run(
    `UPDATE booking_items
     SET printed_at = ?
     WHERE id IN (${placeholders})
       AND booking_id IN (
         SELECT b.id
         FROM bookings b
         JOIN sessions s ON s.id = b.session_id
         WHERE b.payment_status = 'paid'
           AND ${sessionTypeSql('s')} IN ('special_bingo', 'event')
           AND s.deleted_at IS NULL
       )`,
    [now, ...uniqueIds]
  );

  logAudit('template_tickets_marked_printed', 'booking_items', 'bulk', {
    requested: uniqueIds.length,
    updated: result.changes,
  });

  saveDb();
  res.json({ success: true, printedAt: now, updated: result.changes });
});

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join:session', (sessionId) => {
    socket.join(`session:${sessionId}`);
  });

  socket.on('leave:session', (sessionId) => {
    socket.leave(`session:${sessionId}`);
  });

  socket.on('join:admin-receipts', () => {
    socket.join('admin:receipts');
  });

  socket.on('leave:admin-receipts', () => {
    socket.leave('admin:receipts');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// --- Ticket data for printing (public, by reference number) ---
app.get('/api/bookings/:ref/tickets', (req, res) => {
  const { ref } = req.params;
  const booking = get(`SELECT b.*, s.date as session_date, s.time as session_time, s.is_special_event, s.event_title,
    ${sessionTypeSql('s')} as session_type
    FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE b.reference_number = ?`, [ref]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const currentSessionType = normalizeSessionType(booking.session_type, booking.is_special_event);

  const items = all(`
    SELECT bi.id as item_id, bi.first_name, bi.last_name, bi.price, bi.reference_number,
           seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
    FROM booking_items bi
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    WHERE bi.booking_id = ?
    ORDER BY bi.id
  `, [booking.id]);

  // Fetch addons for all booking items
  const allAddons = all(`
    SELECT ba.booking_item_id, ba.quantity, ba.price,
           COALESCE(p.name, sp.name) as package_name
    FROM booking_addons ba
    LEFT JOIN packages p ON p.id = ba.package_id
    LEFT JOIN session_packages sp ON sp.id = ba.package_id
    JOIN booking_items bi ON bi.id = ba.booking_item_id
    WHERE bi.booking_id = ?
  `, [booking.id]);

  // Group addons by booking_item_id
  const addonsByItem = {};
  for (const a of allAddons) {
    if (!addonsByItem[a.booking_item_id]) addonsByItem[a.booking_item_id] = [];
    addonsByItem[a.booking_item_id].push({
      packageName: a.package_name,
      quantity: a.quantity,
      price: a.price,
      priceFormatted: '$' + formatPrice(a.price),
    });
  }

  res.json({
    referenceNumber: booking.reference_number,
    sessionDate: booking.session_date,
    sessionTime: booking.session_time,
    isSpecialEvent: !!(booking.is_special_event),
    sessionType: currentSessionType,
    eventTitle: booking.event_title || null,
    printMode: currentSessionType === 'regular_bingo' ? 'receipt' : 'template',
    printLayout: currentSessionType === 'event' ? 'event_6up' : currentSessionType === 'special_bingo' ? 'bingo_3up' : 'receipt',
    totalAmount: booking.total_amount,
    totalFormatted: '$' + formatPrice(booking.total_amount),
    paymentStatus: booking.payment_status,
    email: booking.email,
    customerFirstName: booking.customer_first_name,
    customerLastName: booking.customer_last_name,
    tickets: items.map(item => ({
      firstName: item.first_name,
      lastName: item.last_name,
      tableNumber: item.table_number,
      chairNumber: item.chair_number,
      referenceNumber: item.reference_number,
      packageName: item.package_name,
      packagePrice: item.package_price,
      packagePriceFormatted: '$' + formatPrice(item.package_price),
      addons: addonsByItem[item.item_id] || [],
    }))
  });
});

// ============ SPA FALLBACK ============
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

function seedInitialAdminFromEnv() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  const displayName = (process.env.INITIAL_ADMIN_DISPLAY_NAME || '').trim() || null;
  const shouldBeSuper = process.env.INITIAL_ADMIN_SUPER_USER !== 'false';

  if (!email && !password) return;

  if (!email || !password) {
    logger.warn('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must both be set to seed an admin user');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logger.warn('INITIAL_ADMIN_EMAIL is invalid; skipping initial admin seed');
    return;
  }

  if (password.length < 12) {
    logger.warn('INITIAL_ADMIN_PASSWORD must be at least 12 characters; skipping initial admin seed');
    return;
  }

  const existing = get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?)', [email]);
  if (existing) {
    if (shouldBeSuper) {
      run('UPDATE admin_users SET is_super_user = 1, updated_at = datetime(\'now\') WHERE id = ?', [existing.id]);
    }
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  run('INSERT INTO admin_users (id, email, password_hash, display_name, is_super_user) VALUES (?, ?, ?, ?, ?)',
    [uuid(), email, hash, displayName, shouldBeSuper ? 1 : 0]);
  logger.info('Seeded initial admin user from env', { email, isSuperUser: shouldBeSuper });
}

// ============ START ============
async function start() {
  await getDb();
  logger.info('Database connected');

  // Run migrations to ensure schema is up to date
  await migrate();
  logger.info('Migrations applied');

  // Migrate existing sessions from 74-table layout (1-75, no 41) to 73-table layout (1-73)
  const sessions = all('SELECT id FROM sessions');
  for (const session of sessions) {
    const has41 = get('SELECT id FROM seats WHERE session_id = ? AND table_number = 41', [session.id]);
    if (!has41) {
      for (let ch = 1; ch <= 6; ch++) {
        run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
          [uuid(), session.id, 41, ch, 'vacant']);
      }
    }
    const has74 = get('SELECT id FROM seats WHERE session_id = ? AND table_number = 74', [session.id]);
    if (has74) {
      run('DELETE FROM seats WHERE session_id = ? AND table_number IN (74, 75) AND status = ?', [session.id, 'vacant']);
    }
  }

  // Optional first-run admin seed, configured through env vars only.
  seedInitialAdminFromEnv();

  // Clean up old data and reclaim memory
  cleanupOldData();
  // Re-check daily (every 24 hours)
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

  // Auto-generate regular bingo sessions for the configured look-ahead window
  // based on the recurring_schedules table. Runs once on boot to backfill any
  // gap from downtime, then hourly to keep the rolling window full.
  openWeeklySessions();
  ensureFutureSessions();
  setInterval(() => { openWeeklySessions(); ensureFutureSessions(); }, 60 * 60 * 1000);

  // Release expired holds every 30 seconds
  setInterval(() => releaseExpiredHolds(io), 30000);
  releaseExpiredHolds(io);
  reconcileReversedBookingSeats();

  server.listen(PORT, () => {
    logger.info('Server started', { port: PORT, url: `http://localhost:${PORT}` });
  });

  // Graceful shutdown: flush pending database writes
  const gracefulShutdown = async (signal) => {
    logger.info('Received shutdown signal', { signal });
    server.close(async () => {
      logger.info('Server closed, flushing database');
      saveDb(); // Flush any pending writes
      logger.info('Database flushed, exiting');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start().catch(err => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
