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
import { migratePostgres } from './migratePostgres.js';
import { logger } from './logger.js';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { adminAuth, authenticateAdminToken, requireSuperUser, isSuperUser } from './middleware/adminAuth.js';
import { archivePastSessions } from './services/sessionArchive.js';
import {
  hasPriorPaidBooking,
  isValidCustomerName,
  isValidEmail,
  normalizeCustomerName,
  normalizeEmail,
  upsertCustomerFromBooking,
  verifyBookingEmail
} from './services/customers.js';
import { logPaymentEvent } from './services/paymentEvents.js';
import {
  holdExpiresAt,
  releaseExpiredHolds,
  resolveHoldConfig,
  shortenBookingSeatHolds,
  shortenRequestedSeatHolds,
} from './services/holds.js';
import { getSessionBookingStatus, withSessionBookingStatus } from './services/sessionBookingStatus.js';
import {
  getNextPhdSessionId,
  getPhdInventoryForSession,
  getPhdUsageBySession,
  updateGlobalPhdConfig,
  updatePhdSessionStock,
  validatePhdInventory
} from './services/phdInventory.js';
import { registerAdminBookingRoutes } from './routes/adminBookingRoutes.js';
import { registerAdminBulkTicketRoutes } from './routes/adminBulkTicketRoutes.js';
import { registerAdminCustomerRoutes } from './routes/adminCustomerRoutes.js';
import { registerAdminReportRoutes } from './routes/adminReportRoutes.js';
import { registerAdminScheduleRoutes } from './routes/adminScheduleRoutes.js';
import { registerAdminSessionRoutes } from './routes/adminSessionRoutes.js';
import { registerAnnouncementRoutes } from './routes/announcementRoutes.js';
import { registerSeatRoutes } from './routes/seatRoutes.js';
import { registerTicketRoutes } from './routes/ticketRoutes.js';
import { registerSocketHandlers } from './socket.js';
import {
  migrateSeatLayout,
  registerGracefulShutdown,
  seedInitialAdminFromEnv,
  startMaintenanceTasks
} from './startup.js';
import { createUploadMiddleware } from './uploads.js';
import { formatCurrency, formatLocalDate, generateRef } from './utils/format.js';
import { sendBookingConfirmation, sendBookingRefundNotification, sendEmailVerificationCode } from './services/email.js';
import {
  createHostedPaymentPage,
  getHostedPaymentRedirectUrl,
  verifyTransaction,
  verifyWebhookSignature
} from './services/payments.js';
import {
  getBookingConfig,
  normalizeSpecialBingoConfig,
  normalizeSessionType,
  PHD_CREDIT_PACKAGE_ID,
} from './services/sessionPackages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  'https://booking.wolastoqcasino.ca',
]);
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://localhost:3001');
}

function corsOrigin(origin, callback) {
  if (!origin || allowedOrigins.has(origin)) return callback(null, true);
  return callback(null, false);
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
const HOLD_CONFIG = resolveHoldConfig();
const HOLD_MINUTES = HOLD_CONFIG.holdMinutes;
const PAYMENT_FAILURE_HOLD_MINUTES = HOLD_CONFIG.paymentFailureHoldMinutes;
const CHECKOUT_SERVICE_FEE_CENTS = 200;
const EVENT_HST_RATE_BASIS_POINTS = 1500;
const startTime = Date.now();
const bookingInitiationLocks = new Map();

function isAuthorizeNetWebhookPath(req) {
  return (req.originalUrl || req.url || '').split('?')[0] === '/api/webhooks/authorize-net';
}

function getCheckoutServiceFeeCents(attendees = [], sessionType = 'regular_bingo') {
  if (sessionType === 'special_bingo' || sessionType === 'event') return 0;
  return CHECKOUT_SERVICE_FEE_CENTS * Math.max(0, attendees.length || 0);
}

function getTicketSalesTaxCents(ticketSubtotalCents = 0, sessionType = 'regular_bingo') {
  if (sessionType !== 'event') return 0;
  return Math.round((Number(ticketSubtotalCents) || 0) * EVENT_HST_RATE_BASIS_POINTS / 10000);
}

function generateTicketAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function getBookingInitiationKey({ sessionId, holderId, attendees }) {
  const seatIds = (attendees || [])
    .map(att => String(att?.seatId || '').trim())
    .filter(Boolean)
    .sort();
  return [String(sessionId || '').trim(), String(holderId || '').trim(), ...seatIds].join('|');
}

async function withBookingInitiationLock(key, fn) {
  const existing = bookingInitiationLocks.get(key);
  if (existing) {
    const result = await existing;
    return result?.statusCode === 200
      ? { ...result, body: { ...result.body, duplicate: true } }
      : result;
  }

  const promise = Promise.resolve().then(fn);
  bookingInitiationLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    if (bookingInitiationLocks.get(key) === promise) {
      bookingInitiationLocks.delete(key);
    }
  }
}

const { uploadsDir, upload, saveUploadedImage } = createUploadMiddleware(__dirname);
const clientBuild = path.join(__dirname, '../../client/dist');

function getSafeRuntimeConfig() {
  const emailProvider = process.env.POSTMARK_SERVER_TOKEN
    ? 'postmark'
    : process.env.GMAIL_USER
      ? 'gmail'
      : process.env.RESEND_API_KEY
        ? 'resend'
        : 'none';

  return {
    dbDriver: (process.env.DB_DRIVER || 'sqlite').toLowerCase().trim(),
    holdMinutes: HOLD_CONFIG.holdMinutes,
    maxHoldMinutes: HOLD_CONFIG.maxHoldMinutes,
    holdMinutesCapped: HOLD_CONFIG.configuredHoldMinutes !== HOLD_CONFIG.holdMinutes,
    paymentFailureHoldMinutes: HOLD_CONFIG.paymentFailureHoldMinutes,
    maxPaymentFailureHoldMinutes: HOLD_CONFIG.maxPaymentFailureHoldMinutes,
    paymentFailureHoldMinutesCapped:
      HOLD_CONFIG.configuredPaymentFailureHoldMinutes !== HOLD_CONFIG.paymentFailureHoldMinutes,
    emailProvider,
    paymentEnvironment: process.env.ANET_ENV || 'sandbox',
  };
}

app.get('/IFrameCommunicator.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://accept.authorize.net https://test.authorize.net");
  res.setHeader('Cache-Control', 'public, max-age=0');
  res.sendFile(path.join(clientBuild, 'IFrameCommunicator.html'));
});

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "connect-src": ["'self'", "ws:", "wss:"],
      "frame-src": ["'self'", "https://accept.authorize.net", "https://test.authorize.net"],
      "form-action": ["'self'", "https://accept.authorize.net", "https://test.authorize.net"],
      "frame-ancestors": ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use('/api/webhooks/authorize-net', express.raw({
  type: '*/*',
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = Buffer.from(buf);
  }
}));
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (isAuthorizeNetWebhookPath(req)) {
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
  skip: isAuthorizeNetWebhookPath,
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
app.use('/api', generalLimiter);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

function setAppShellNoCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function setStaticBuildHeaders(res, filePath) {
  if (path.basename(filePath) === 'index.html') {
    setAppShellNoCache(res);
    return;
  }
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
}

// Serve static build in production. The SPA shell is sent by explicit routes
// below so browsers always discover the latest hashed JS bundle after deploy.
app.use(express.static(clientBuild, {
  index: false,
  setHeaders: setStaticBuildHeaders,
}));

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
  try {
    const db = await getDb();
    // sql.js exposes prepare(); Postgres pool does not. Only probe when we have it.
    try {
      if (db && typeof db.prepare === 'function') {
        db.prepare('SELECT 1').get();
      }
    } catch (probeErr) {
      // Probe is best-effort — DB driver may not support prepare(). Ignore.
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: 'connected',
      config: getSafeRuntimeConfig()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: 'disconnected',
      error: error.message,
      config: getSafeRuntimeConfig()
    });
  }
});

// ============ AUDIT HELPER ============

async function logAudit(action, entityType, entityId, details) {
  await run('INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid(), action, entityType, entityId, typeof details === 'string' ? details : JSON.stringify(details), new Date().toISOString()]);
}

function validateAttendeeAddons(attendees, optionalPkgs, { requiredPkgs = [], sessionType = 'regular_bingo' } = {}) {
  const optionalById = new Map(optionalPkgs.map(pkg => [pkg.id, pkg]));
  const requiredPhdIncluded = sessionType === 'regular_bingo' && requiredPkgs.some(pkg => pkg?.is_phd);
  const normalizedAttendees = [];

  for (const attendee of attendees) {
    const addonTotals = new Map();
    for (const addon of attendee.addons || []) {
      const packageId = String(addon?.packageId || '').trim();
      const quantity = Number(addon?.quantity);
      if (!packageId || !Number.isInteger(quantity) || quantity < 1) {
        return { ok: false, statusCode: 400, error: 'Add-on quantities must be whole numbers of 1 or more.' };
      }
      addonTotals.set(packageId, (addonTotals.get(packageId) || 0) + quantity);
    }

    const normalizedAddons = [];
    const attendeeHasPhdPackage = requiredPhdIncluded || [...addonTotals.keys()].some(packageId => optionalById.get(packageId)?.is_phd);
    for (const [packageId, quantity] of addonTotals.entries()) {
      const pkg = optionalById.get(packageId);
      if (!pkg) {
        return { ok: false, statusCode: 400, error: 'One of the selected add-ons is no longer available.' };
      }
      if (packageId === PHD_CREDIT_PACKAGE_ID && !attendeeHasPhdPackage) {
        return { ok: false, statusCode: 400, error: 'PHD credits are only available when that player purchases a PHD package.' };
      }
      const packageLimit = Math.max(1, parseInt(pkg.max_quantity || 1, 10));
      if (quantity > packageLimit) {
        return { ok: false, statusCode: 400, error: `${pkg.name} is limited to ${packageLimit} per player.` };
      }
      normalizedAddons.push({ packageId, quantity });
    }

    normalizedAttendees.push({ ...attendee, addons: normalizedAddons });
  }

  return { ok: true, attendees: normalizedAttendees };
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

// Validate the shape and integrity of a booking request body.
// Returns { ok, data: { sessionId, holderId, attendees, trimmedEmail, session,
//   useSessionPkgs, sessionPkgs, requiredPkg } } on success, or
// { ok: false, statusCode, error } on failure.
async function validateBookingRequest(body, { requireEmailVerification = true, requireCustomerDetails = true, requireEmail = false } = {}) {
  const { sessionId, holderId, attendees, email, customerFirstName, customerLastName, emailVerificationId } = body || {};

  if (!sessionId || !holderId || !attendees?.length) {
    return { ok: false, statusCode: 400, error: 'Missing required fields' };
  }

  // Email is optional in the payment flow; Authorize.Net may still show its own
  // optional email field on the hosted card form.
  const trimmedEmail = (email || '').trim();
  if (requireEmail && !trimmedEmail) {
    return { ok: false, statusCode: 400, error: 'A valid email address is required for confirmation.' };
  }
  if (trimmedEmail && !isValidEmail(trimmedEmail)) {
    return { ok: false, statusCode: 400, error: 'Enter a valid email address or leave it blank.' };
  }
  const normalizedEmail = trimmedEmail ? normalizeEmail(trimmedEmail) : '';

  let trimmedCustomerFirstName = normalizeCustomerName(customerFirstName);
  let trimmedCustomerLastName = normalizeCustomerName(customerLastName);
  if (!requireCustomerDetails) {
    trimmedCustomerFirstName ||= normalizeCustomerName(attendees?.[0]?.firstName);
    trimmedCustomerLastName ||= normalizeCustomerName(attendees?.[0]?.lastName);
  }
  if (requireCustomerDetails && (!isValidCustomerName(trimmedCustomerFirstName) || !isValidCustomerName(trimmedCustomerLastName))) {
    return { ok: false, statusCode: 400, error: 'Customer first and last name are required.' };
  }

  const emailCheck = normalizedEmail
    ? await verifyBookingEmail({
      email: normalizedEmail,
      verificationId: emailVerificationId,
      requireVerification: requireEmailVerification,
    })
    : { ok: true, trusted: false, verifiedAt: null };
  if (!emailCheck.ok) return emailCheck;

  const session = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return { ok: false, statusCode: 404, error: 'Session not found' };
  const bookingStatus = getSessionBookingStatus(session);
  if (bookingStatus.booking_closed) {
    return { ok: false, statusCode: 409, error: bookingStatus.booking_closed_message };
  }
  const currentSessionType = normalizeSessionType(session.session_type, session.is_special_event);
  if (currentSessionType === 'event' && attendees.some(att => (att.addons || []).some(addon => addon.quantity > 0))) {
    return { ok: false, statusCode: 400, error: 'Live Event / Venue does not allow add-ons.' };
  }

  // Session-specific packages are only for special bingo and live events.
  // Regular bingo always uses the approved global package list.
  const sessionPkgs = currentSessionType === 'regular_bingo'
    ? []
    : await all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [sessionId]);
  if (currentSessionType === 'event' && sessionPkgs.length === 0) {
    return { ok: false, statusCode: 409, error: 'Live event ticket package is not configured.' };
  }
  const useSessionPkgs = sessionPkgs.length > 0;
  const requiredPkgs = useSessionPkgs
    ? sessionPkgs.filter(p => p.type === 'required')
    : await all("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order ASC");
  const requiredPkg = requiredPkgs[0];
  if (!requiredPkg) return { ok: false, statusCode: 500, error: 'No required package configured' };

  const optionalPkgs = useSessionPkgs
    ? sessionPkgs.filter(p => p.type === 'optional')
    : await all("SELECT * FROM packages WHERE type = 'optional' AND is_active = 1 ORDER BY sort_order ASC");
  const addonCheck = validateAttendeeAddons(attendees, optionalPkgs, { requiredPkgs, sessionType: currentSessionType });
  if (!addonCheck.ok) return addonCheck;

  // Every seat must currently be held by THIS holder. Prevents booking seats
  // that someone else has held, or seats that aren't held at all.
  for (const att of attendees) {
    const seat = await get('SELECT * FROM seats WHERE id = ?', [att.seatId]);
    if (!seat || seat.status !== 'held' || seat.held_by !== holderId) {
      return { ok: false, statusCode: 409, error: 'Seat not held by you' };
    }
  }

  return {
    ok: true,
    data: {
      sessionId,
      holderId,
      trimmedEmail: normalizedEmail,
      customerFirstName: trimmedCustomerFirstName,
      customerLastName: trimmedCustomerLastName,
      emailVerifiedAt: emailCheck.verifiedAt || null,
      session,
      sessionType: currentSessionType,
      attendees: addonCheck.attendees,
      useSessionPkgs,
      sessionPkgs,
      requiredPkg,
      requiredPkgs
    }
  };
}

// Insert a booking + its items + addons. Always 'pending' status.
// Does NOT flip seats and does NOT emit any sockets — that happens in markBookingPaid.
// Returns { bookingId, refNumber, totalAmount, itemRefs }. Throws on DB error.
async function insertBookingRecord({
  sessionId,
  attendees,
  requiredPkg,
  requiredPkgs = [requiredPkg].filter(Boolean),
  sessionPkgs,
  useSessionPkgs,
  email,
  customerFirstName,
  customerLastName,
  emailVerifiedAt,
  sessionType = 'regular_bingo'
}) {
  if (useSessionPkgs && sessionPkgs?.length) {
    for (const pkg of sessionPkgs) {
      await run(
        `INSERT OR IGNORE INTO packages
          (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          pkg.id,
          pkg.name,
          pkg.price,
          pkg.type,
          pkg.max_quantity || 1,
          pkg.sort_order || 0,
          pkg.description || '',
          pkg.is_phd || 0,
        ]
      );
    }
  }

  let ticketSubtotal = 0;
  let totalAmount = getCheckoutServiceFeeCents(attendees, sessionType);
  const bookingId = uuid();
  const refNumber = generateRef();
  const ticketAccessToken = generateTicketAccessToken();
  const itemRefs = [];
  const itemRows = [];
  const addonRows = [];

  for (const att of attendees) {
    const itemId = uuid();
    const itemRef = generateRef();
    itemRefs.push(itemRef);
    const includedRequiredPkgs = requiredPkgs.length > 0 ? requiredPkgs : [requiredPkg];
    const primaryRequiredPkg = includedRequiredPkgs[0];
    ticketSubtotal += primaryRequiredPkg.price;
    totalAmount += primaryRequiredPkg.price;
    itemRows.push([itemId, bookingId, att.firstName, att.lastName, att.seatId, primaryRequiredPkg.id, primaryRequiredPkg.price, itemRef]);

    for (const requiredAddonPkg of includedRequiredPkgs.slice(1)) {
      ticketSubtotal += requiredAddonPkg.price;
      totalAmount += requiredAddonPkg.price;
      addonRows.push([uuid(), itemId, requiredAddonPkg.id, 1, requiredAddonPkg.price]);
    }

    if (att.addons) {
      for (const addon of att.addons) {
        const pkg = useSessionPkgs
          ? sessionPkgs.find(p => p.id === addon.packageId)
          : await get('SELECT * FROM packages WHERE id = ? AND is_active = 1', [addon.packageId]);
        if (pkg) {
          const addonPrice = pkg.price * addon.quantity;
          ticketSubtotal += addonPrice;
          totalAmount += addonPrice;
          addonRows.push([uuid(), itemId, addon.packageId, addon.quantity, addonPrice]);
        }
      }
    }
  }

  const salesTaxAmount = getTicketSalesTaxCents(ticketSubtotal, sessionType);
  totalAmount += salesTaxAmount;

  let bookingInserted = false;
  try {
    await run(
      `INSERT INTO bookings
        (id, session_id, reference_number, total_amount, payment_status, created_at, email,
         customer_first_name, customer_last_name, email_verified_at, ticket_access_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ticketAccessToken,
      ]
    );
    bookingInserted = true;

    for (const itemRow of itemRows) {
      await run('INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', itemRow);
    }
    for (const addonRow of addonRows) {
      await run('INSERT INTO booking_addons (id, booking_item_id, package_id, quantity, price) VALUES (?, ?, ?, ?, ?)', addonRow);
    }

    // Preserve the original 'booking_created' audit event so any admin filters
    // / dashboards watching for it keep working after the refactor.
    await logAudit('booking_created', 'booking', bookingId, {
      referenceNumber: refNumber,
      sessionId,
      totalAmount,
      customerFirstName,
      customerLastName,
      email,
      attendees: attendees.map(a => ({ firstName: a.firstName, lastName: a.lastName, seatId: a.seatId }))
    });
  } catch (err) {
    if (bookingInserted) {
      try {
        await run('DELETE FROM bookings WHERE id = ?', [bookingId]);
      } catch (cleanupErr) {
        console.error(`[bookings] failed to clean up partial booking ${bookingId}:`, cleanupErr);
      }
    }
    throw err;
  }

  return { bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken, salesTaxAmount };
}

function sortedSeatIds(attendees) {
  return (attendees || [])
    .map(att => String(att?.seatId || '').trim())
    .filter(Boolean)
    .sort();
}

function sameSeatSet(left, right) {
  if (left.length !== right.length) return false;
  return left.every((seatId, index) => seatId === right[index]);
}

async function calculateRequestedTicketSubtotal({
  attendees,
  requiredPkg,
  requiredPkgs = [requiredPkg].filter(Boolean),
  sessionPkgs,
  useSessionPkgs,
}) {
  let ticketSubtotal = 0;
  const includedRequiredPkgs = requiredPkgs.length > 0 ? requiredPkgs : [requiredPkg].filter(Boolean);

  for (const att of attendees || []) {
    for (const pkg of includedRequiredPkgs) {
      const pkgPrice = Number(pkg.price || 0);
      ticketSubtotal += pkgPrice;
    }

    for (const addon of att.addons || []) {
      const pkg = useSessionPkgs
        ? sessionPkgs.find(p => p.id === addon.packageId)
        : await get('SELECT * FROM packages WHERE id = ? AND is_active = 1', [addon.packageId]);
      if (pkg) {
        const addonPrice = Number(pkg.price || 0) * Number(addon.quantity || 0);
        ticketSubtotal += addonPrice;
      }
    }
  }

  return ticketSubtotal;
}

async function calculateRequestedBookingTotal({
  attendees,
  requiredPkg,
  requiredPkgs = [requiredPkg].filter(Boolean),
  sessionPkgs,
  useSessionPkgs,
  sessionType = 'regular_bingo',
}) {
  const ticketSubtotal = await calculateRequestedTicketSubtotal({
    attendees,
    requiredPkg,
    requiredPkgs,
    sessionPkgs,
    useSessionPkgs,
  });
  return ticketSubtotal
    + getCheckoutServiceFeeCents(attendees, sessionType)
    + getTicketSalesTaxCents(ticketSubtotal, sessionType);
}

function buildInitiateResponse({
  bookingId,
  refNumber,
  totalAmount,
  itemRefs,
  ticketAccessToken,
  email,
  customerFirstName,
  customerLastName,
  token,
  serviceFeeAmount = CHECKOUT_SERVICE_FEE_CENTS,
  serviceFeeQuantity = 1,
  salesTaxAmount = 0,
  duplicate = false,
}) {
  return {
    bookingId,
    referenceNumber: refNumber,
    itemReferences: itemRefs,
    totalAmount,
    totalFormatted: formatCurrency(totalAmount),
    serviceFeeAmount,
    serviceFeeFormatted: formatCurrency(serviceFeeAmount),
    serviceFeeUnitAmount: CHECKOUT_SERVICE_FEE_CENTS,
    serviceFeeUnitFormatted: formatCurrency(CHECKOUT_SERVICE_FEE_CENTS),
    serviceFeeQuantity,
    salesTaxAmount,
    salesTaxFormatted: formatCurrency(salesTaxAmount),
    salesTaxLabel: 'HST (15%)',
    email,
    customerFirstName,
    customerLastName,
    redirectUrl: getHostedPaymentRedirectUrl(),
    token,
    ticketAccessToken,
    duplicate,
  };
}

async function findReusablePendingBooking({ sessionId, holderId, attendees, email }) {
  const requestedSeatIds = sortedSeatIds(attendees);
  if (!sessionId || !holderId || requestedSeatIds.length === 0) return null;

  const candidates = await all(
    `SELECT id, reference_number, total_amount, hosted_token, ticket_access_token,
            email, customer_first_name, customer_last_name, payment_attempted_at
     FROM bookings
     WHERE session_id = ?
       AND payment_status = 'pending'
       AND LOWER(COALESCE(email, '')) = LOWER(?)
     ORDER BY created_at DESC
     LIMIT 20`,
    [sessionId, email || '']
  );

  for (const booking of candidates) {
    const itemRows = await all(
      'SELECT seat_id, reference_number FROM booking_items WHERE booking_id = ? ORDER BY id',
      [booking.id]
    );
    const bookingSeatIds = itemRows.map(row => String(row.seat_id || '').trim()).sort();
    if (!sameSeatSet(requestedSeatIds, bookingSeatIds)) continue;

    const placeholders = requestedSeatIds.map(() => '?').join(',');
    const heldSeats = await all(
      `SELECT id
       FROM seats
       WHERE id IN (${placeholders})
         AND status = 'held'
         AND held_by = ?
         AND (held_until IS NULL OR held_until > ?)`,
      [...requestedSeatIds, holderId, new Date().toISOString()]
    );
    if (heldSeats.length !== requestedSeatIds.length) continue;

    return {
      bookingId: booking.id,
      refNumber: booking.reference_number,
      totalAmount: booking.total_amount,
      itemRefs: itemRows.map(row => row.reference_number).filter(Boolean),
      ticketAccessToken: booking.ticket_access_token,
      email: booking.email,
      customerFirstName: booking.customer_first_name,
      customerLastName: booking.customer_last_name,
      token: booking.hosted_token,
      inProgress: !booking.hosted_token,
    };
  }

  return null;
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
async function markBookingPaid({ bookingId, transactionId = null, authCode = null, source = 'instant' }) {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    console.error(`[bookings] markBookingPaid: booking ${bookingId} not found`);
    return { ok: false, error: 'booking_not_found' };
  }
  if (booking.payment_status === 'paid') {
    console.log(`[bookings] markBookingPaid: ${bookingId} already paid, idempotent skip`);
    return { ok: true, alreadyPaid: true };
  }

  const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
  const items = await all('SELECT * FROM booking_items WHERE booking_id = ?', [bookingId]);

  // Update booking row
  await run(`UPDATE bookings SET
    payment_status = 'paid',
    transaction_id = ?,
    auth_code = ?,
    payment_completed_at = ?
    WHERE id = ?`,
    [transactionId, authCode, new Date().toISOString(), bookingId]);

  await upsertCustomerFromBooking({
    ...booking,
    payment_status: 'paid',
    transaction_id: transactionId,
    auth_code: authCode,
    payment_completed_at: new Date().toISOString(),
  });

  // Flip seats to sold + emit per-seat for live seat-map updates
  for (const it of items) {
    await run(`UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?`, [it.seat_id]);
    io.to(`session:${booking.session_id}`).emit('seat:sold', { seatId: it.seat_id, sessionId: booking.session_id });
  }

  // Build receipt data and emit to admin auto-print room
  const receiptItems = await all(`
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
  const receiptAddons = await all(`
    SELECT ba.booking_item_id, ba.quantity, ba.price,
           COALESCE(p.name, sp.name) as package_name
    FROM booking_addons ba
    LEFT JOIN packages p ON p.id = ba.package_id
    LEFT JOIN session_packages sp ON sp.id = ba.package_id
    JOIN booking_items bi ON bi.id = ba.booking_item_id
    WHERE bi.booking_id = ?
  `, [bookingId]);
  const sessionType = normalizeSessionType(session?.session_type, session?.is_special_event);
  const notificationType = sessionType === 'event'
    ? 'live_event_ticket'
    : sessionType === 'special_bingo'
      ? 'special_bingo_ticket'
      : 'regular_bingo_receipt';
  const notificationLabel = sessionType === 'event'
    ? 'Live Event Ticket'
    : sessionType === 'special_bingo'
      ? 'Special Bingo Ticket'
      : 'Regular Bingo Receipt';
  io.to('admin:receipts').emit('booking:new', {
    bookingId: booking.id,
    referenceNumber: booking.reference_number,
    sessionDate: session?.date,
    sessionTime: session?.time,
    sessionTitle: session?.event_title || null,
    eventTitle: session?.event_title || null,
    sessionType,
    isSpecialEvent: sessionType !== 'regular_bingo',
    notificationType,
    notificationLabel,
    receiptTitle: notificationLabel.toUpperCase(),
    paymentStatus: 'paid',
    totalAmount: booking.total_amount,
    totalFormatted: formatCurrency(booking.total_amount),
    createdAt: new Date().toISOString(),
    items: receiptItems.map(item => ({
      firstName: item.first_name,
      lastName: item.last_name,
      tableNumber: item.table_number,
      chairNumber: item.chair_number,
      referenceNumber: item.reference_number,
      packageName: item.package_name,
      packagePrice: item.package_price,
      packagePriceFormatted: formatCurrency(item.package_price),
      addons: receiptAddons
        .filter(a => a.booking_item_id === item.id)
        .map(a => ({ packageName: a.package_name, quantity: a.quantity, price: a.price, priceFormatted: formatCurrency(a.price) }))
    }))
  });

  // PHD inventory update emit — included PHD packages and PHD add-ons both count.
  const phdInBooking = await get(`
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
    const phdInventory = await getPhdInventoryForSession(booking.session_id);
    io.to('admin:receipts').emit('phd:updated', {
      ...phdInventory,
      perSession: await getPhdUsageBySession(),
    });
  }

  // Flush to disk — critical write
  await saveDb();

  await logPaymentEvent(bookingId, 'approved', source, { transactionId, authCode });
  await logAudit('booking_paid', 'booking', bookingId, {
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
// Failed payment seats stay held only briefly so customers/admins see the table
// open again without waiting for the full checkout hold window.
async function markBookingFailed({ bookingId, reason, source = 'server' }) {
  const booking = await get('SELECT id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'paid') return { ok: false, error: 'already_paid' };
  if (booking.payment_status === 'failed') return { ok: true, alreadyFailed: true };

  await run(`UPDATE bookings SET payment_status = 'failed', payment_failure_reason = ? WHERE id = ?`,
    [String(reason || 'unknown').slice(0, 500), bookingId]);
  // Shorten the post-payment-error hold to the go-live operational window.
  const holdShorten = await shortenBookingSeatHolds({ bookingId, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
  await saveDb();

  await logPaymentEvent(bookingId, 'declined', source, {
    reason,
    heldSeatsReleaseAt: holdShorten.releaseAt,
    heldSeatsShortened: holdShorten.changedSeats,
  });
  return { ok: true };
}

// Idempotently mark a 'pending' booking as 'cancelled' (customer clicked Cancel
// on the Authorize.Net hosted page). Cancelled payment seats use the same short
// release window as failed payments.
async function markBookingCancelled({ bookingId, source = 'customer' }) {
  const booking = await get('SELECT id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'paid') return { ok: false, error: 'already_paid' };
  if (booking.payment_status === 'cancelled') return { ok: true, alreadyCancelled: true };

  await run(`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?`, [bookingId]);
  // Treat payment cancellations like payment failures for seat availability.
  const holdShorten = await shortenBookingSeatHolds({ bookingId, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
  await saveDb();

  await logPaymentEvent(bookingId, 'cancelled', source, {
    heldSeatsReleaseAt: holdShorten.releaseAt,
    heldSeatsShortened: holdShorten.changedSeats,
  });
  return { ok: true };
}

async function cancelPendingBookingForEdit({ bookingId, source = 'customer_edit' }) {
  const booking = await get('SELECT id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'paid') return { ok: false, error: 'already_paid' };
  if (booking.payment_status === 'cancelled') return { ok: true, alreadyCancelled: true };
  if (booking.payment_status !== 'pending') return { ok: false, error: 'not_pending' };

  await run(`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?`, [bookingId]);

  const holdUntil = holdExpiresAt(HOLD_MINUTES);
  const items = await all('SELECT seat_id FROM booking_items WHERE booking_id = ?', [bookingId]);
  for (const item of items) {
    await run(
      `UPDATE seats
       SET held_until = ?
       WHERE id = ? AND status = 'held'`,
      [holdUntil, item.seat_id]
    );
  }
  await saveDb();

  await logPaymentEvent(bookingId, 'cancelled_for_edit', source, {
    heldSeatsRetained: items.length,
    heldSeatsReleaseAt: holdUntil,
  });

  return { ok: true, heldUntil: holdUntil };
}

async function releaseBookingSeats({ bookingId, sessionId }) {
  const items = await all('SELECT seat_id FROM booking_items WHERE booking_id = ?', [bookingId]);
  for (const it of items) {
    await run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [it.seat_id]);
    io.to(`session:${sessionId}`).emit('seat:unlocked', { seatId: it.seat_id, sessionId });
  }
  io.to(`session:${sessionId}`).emit('seats:refresh', { sessionId });
  return items.length;
}

async function reconcileReversedBookingSeats() {
  const seatsToRelease = await all(`
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
    await run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [seat.id]);
  }

  if (seatsToRelease.length > 0) {
    await saveDb();
    logger.info('Released seats from reversed bookings', { count: seatsToRelease.length });
  }

  return seatsToRelease.length;
}

function sendRefundNotificationAsync({ bookingId, action, refundTransactionId, bookingItemId = null }) {
  setImmediate(async () => {
    try {
      const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      if (!booking) return;
      const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
      const item = bookingItemId
        ? await get(`
            SELECT id, first_name, last_name, reference_number, price, refund_amount, refund_action
            FROM booking_items
            WHERE id = ? AND booking_id = ?
          `, [bookingItemId, bookingId])
        : null;
      sendBookingRefundNotification({
        to: booking.email,
        booking,
        session,
        item,
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

// Idempotently mark a 'paid' or 'partially_refunded' booking as 'refunded'
// (post-settlement reversal).
// Releases seats, refreshes public seat maps, and emails the customer plus
// EMAIL_BCC recipients.
async function markBookingRefunded({ bookingId, transactionId = null, refundTransactionId = null, source = 'admin' }) {
  const booking = await get('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'refunded') return { ok: true, alreadyRefunded: true };
  if (!['paid', 'partially_refunded'].includes(booking.payment_status)) {
    return { ok: false, error: `cannot refund booking in status '${booking.payment_status}'` };
  }

  const refundedAt = new Date().toISOString();
  await run(`UPDATE bookings SET payment_status = 'refunded' WHERE id = ?`, [bookingId]);
  await run(
    `UPDATE booking_items
     SET refund_status = 'refunded',
         refunded_at = ?,
         refund_transaction_id = ?,
         refund_amount = COALESCE(NULLIF(refund_amount, 0), price + COALESCE((SELECT SUM(price) FROM booking_addons WHERE booking_item_id = booking_items.id), 0)),
         refund_action = 'refund'
     WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
    [refundedAt, refundTransactionId || transactionId, bookingId]
  );
  const releasedSeats = await releaseBookingSeats({ bookingId, sessionId: booking.session_id });
  await saveDb();

  await logPaymentEvent(bookingId, 'refunded', source, { transactionId });
  await logAudit('booking_refunded', 'booking', bookingId, { transactionId, source, releasedSeats });
  io.to('admin:receipts').emit('booking:refunded', { bookingId, transactionId, releasedSeats });
  io.to('admin:receipts').emit('phd:updated', {
    ...(await getPhdInventoryForSession(booking.session_id)),
    perSession: await getPhdUsageBySession(),
  });
  sendRefundNotificationAsync({ bookingId, action: 'refund', refundTransactionId: refundTransactionId || transactionId });
  return { ok: true, releasedSeats };
}

// Idempotently mark a 'paid' booking as 'voided' (pre-settlement reversal).
// Same semantics as markBookingRefunded but distinguished in audit logs so
// admins can tell which type of reversal happened.
async function markBookingVoided({ bookingId, transactionId = null, voidTransactionId = null, source = 'admin' }) {
  const booking = await get('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status === 'voided') return { ok: true, alreadyVoided: true };
  if (booking.payment_status !== 'paid') {
    return { ok: false, error: `cannot void booking in status '${booking.payment_status}'` };
  }

  const voidedAt = new Date().toISOString();
  await run(`UPDATE bookings SET payment_status = 'voided' WHERE id = ?`, [bookingId]);
  await run(
    `UPDATE booking_items
     SET refund_status = 'refunded',
         refunded_at = ?,
         refund_transaction_id = ?,
         refund_amount = COALESCE(NULLIF(refund_amount, 0), price + COALESCE((SELECT SUM(price) FROM booking_addons WHERE booking_item_id = booking_items.id), 0)),
         refund_action = 'void'
     WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
    [voidedAt, voidTransactionId || transactionId, bookingId]
  );
  const releasedSeats = await releaseBookingSeats({ bookingId, sessionId: booking.session_id });
  await saveDb();

  await logPaymentEvent(bookingId, 'voided', source, { transactionId });
  await logAudit('booking_voided', 'booking', bookingId, { transactionId, source, releasedSeats });
  io.to('admin:receipts').emit('booking:voided', { bookingId, transactionId, releasedSeats });
  io.to('admin:receipts').emit('phd:updated', {
    ...(await getPhdInventoryForSession(booking.session_id)),
    perSession: await getPhdUsageBySession(),
  });
  sendRefundNotificationAsync({ bookingId, action: 'void', refundTransactionId: voidTransactionId || transactionId });
  return { ok: true, releasedSeats };
}

async function getBookingItemRefundAmount(itemId) {
  const item = await get('SELECT price FROM booking_items WHERE id = ?', [itemId]);
  if (!item) return null;
  const addons = await get('SELECT COALESCE(SUM(price), 0) as total FROM booking_addons WHERE booking_item_id = ?', [itemId]);
  const itemPrice = Number(item.price || 0);
  const addonTotal = Number(addons?.total || 0);
  return itemPrice + addonTotal;
}

async function markBookingItemRefunded({
  bookingId,
  bookingItemId,
  transactionId = null,
  refundTransactionId = null,
  amountCents = 0,
  action = 'refund',
  source = 'admin',
}) {
  const booking = await get('SELECT id, session_id, payment_status FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (!['paid', 'partially_refunded'].includes(booking.payment_status)) {
    return { ok: false, error: `cannot refund ticket in booking status '${booking.payment_status}'` };
  }

  const item = await get('SELECT id, seat_id, first_name, last_name, reference_number, refund_status FROM booking_items WHERE id = ? AND booking_id = ?', [bookingItemId, bookingId]);
  if (!item) return { ok: false, error: 'booking_item_not_found' };
  if (item.refund_status === 'refunded') return { ok: true, alreadyRefunded: true, releasedSeats: 0 };

  const refundedAt = new Date().toISOString();
  await run(
    `UPDATE booking_items
     SET refund_status = 'refunded',
         refunded_at = ?,
         refund_transaction_id = ?,
         refund_amount = ?,
         refund_action = ?
     WHERE id = ?`,
    [refundedAt, refundTransactionId || transactionId, amountCents, action, bookingItemId]
  );
  await run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [item.seat_id]);

  const remainingRow = await get(
    `SELECT COUNT(*) as count
     FROM booking_items
     WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'`,
    [bookingId]
  );
  const remaining = remainingRow?.count || 0;
  const nextStatus = remaining > 0 ? 'partially_refunded' : (action === 'void' ? 'voided' : 'refunded');
  await run('UPDATE bookings SET payment_status = ? WHERE id = ?', [nextStatus, bookingId]);
  await saveDb();

  await logPaymentEvent(bookingId, action === 'void' ? 'voided' : 'refunded', source, {
    transactionId,
    refundTransactionId: refundTransactionId || transactionId,
    bookingItemId,
    itemReference: item.reference_number,
    amountCents,
    partial: remaining > 0,
  });
  await logAudit('booking_item_refunded', 'booking_item', bookingItemId, {
    bookingId,
    transactionId,
    refundTransactionId: refundTransactionId || transactionId,
    source,
    action,
    amountCents,
    attendee: `${item.first_name} ${item.last_name}`,
    ticketReference: item.reference_number,
    releasedSeats: 1,
    bookingStatus: nextStatus,
  });
  io.to(`session:${booking.session_id}`).emit('seats:refresh');
  io.to('admin:receipts').emit('booking:item_refunded', { bookingId, bookingItemId, transactionId, amountCents });
  io.to('admin:receipts').emit('phd:updated', {
    ...(await getPhdInventoryForSession(booking.session_id)),
    perSession: await getPhdUsageBySession(),
  });
  sendRefundNotificationAsync({
    bookingId,
    action,
    refundTransactionId: refundTransactionId || transactionId,
    bookingItemId,
  });
  return { ok: true, releasedSeats: 1, remaining, bookingStatus: nextStatus };
}

// Loads a booking + related rows and fires the confirmation email.
// Used by markBookingPaid; safe to call standalone for resends.
async function sendBookingConfirmationEmail(bookingId) {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return;
  const session = await get('SELECT * FROM sessions WHERE id = ?', [booking.session_id]);
  const items = await all('SELECT * FROM booking_items WHERE booking_id = ? ORDER BY id', [bookingId]);
  const addons = await all(`
    SELECT ba.*
    FROM booking_addons ba
    JOIN booking_items bi ON bi.id = ba.booking_item_id
    WHERE bi.booking_id = ?
  `, [bookingId]);

  const attendees = items.map(it => ({
    firstName: it.first_name,
    lastName: it.last_name,
    seatId: it.seat_id,
    packageId: it.package_id,
    packagePrice: it.price,
    addons: addons.filter(a => a.booking_item_id === it.id).map(a => ({
      packageId: a.package_id,
      quantity: a.quantity,
    })),
  }));

  const sessionPkgs = await all('SELECT * FROM session_packages WHERE session_id = ?', [booking.session_id]);
  const useSessionPkgs = sessionPkgs.length > 0;
  const packages = useSessionPkgs ? sessionPkgs : await all('SELECT * FROM packages WHERE is_active = 1');

  const seats = [];
  for (const it of items) {
    const s = await get('SELECT id, table_number, chair_number FROM seats WHERE id = ?', [it.seat_id]);
    seats.push(s || { id: it.seat_id, table_number: '?', chair_number: '?' });
  }

  return sendBookingConfirmation({
    to: booking.email,
    booking: {
      referenceNumber: booking.reference_number,
      itemReferences: items.map(it => it.reference_number),
      ticketAccessToken: booking.ticket_access_token,
      totalAmount: booking.total_amount,
      totalFormatted: formatCurrency(booking.total_amount),
    },
    session,
    attendees,
    seats,
    packages,
  });
}

// ============ API ROUTES ============

// --- Sessions ---
app.get('/api/sessions', async (req, res) => {
  try {
    await releaseExpiredHolds(io);
    await archivePastSessions();
    const today = formatLocalDate(new Date());
    const sessions = await all(
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
    res.json(sessions.map(session => withSessionBookingStatus(session, {
      soldOut: Number(session.total_seats) > 0 && Number(session.sold_seats) >= Number(session.total_seats),
    })));
  } catch (err) {
    console.error('GET /api/sessions failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Session-specific packages (public) ---
app.get('/api/sessions/:sessionId/packages', async (req, res) => {
  try {
    const session = await get('SELECT is_special_event, session_type FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const sessionType = normalizeSessionType(session.session_type, session.is_special_event);
    if (sessionType !== 'regular_bingo') {
      const sessionPkgs = await all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [req.params.sessionId]);
      if (sessionType === 'event' || sessionPkgs.length > 0) return res.json(sessionPkgs);
    }
    // Regular bingo, and legacy special-bingo sessions without session packages,
    // use the global active package list. Live events must never inherit bingo/PHD packages.
    const globalPkgs = await all('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC');
    res.json(globalPkgs);
  } catch (err) {
    console.error('GET /api/sessions/:sessionId/packages failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PHD Inventory status (public) ---
app.get('/api/phd-inventory', async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || '').trim();
    res.json(await getPhdInventoryForSession(sessionId));
  } catch (err) {
    console.error('GET /api/phd-inventory failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/booking-config', async (req, res) => {
  try {
    res.json({
      ...(await getBookingConfig()),
      serviceFeePerPersonAmount: CHECKOUT_SERVICE_FEE_CENTS,
      serviceFeePerPersonFormatted: formatCurrency(CHECKOUT_SERVICE_FEE_CENTS),
    });
  } catch (err) {
    console.error('GET /api/booking-config failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Theme settings (public) ---
app.get('/api/theme', async (req, res) => {
  try {
    const row = await get("SELECT value FROM settings WHERE key = 'theme_config'");
    if (!row) return res.json({ value: null });
    try { res.json({ value: JSON.parse(row.value) }); }
    catch { res.json({ value: null }); }
  } catch (err) {
    console.error('GET /api/theme failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Announcements (public) ---
app.get('/api/announcements', async (req, res) => {
  try {
    const today = formatLocalDate(new Date());
    const announcements = await all(
      `SELECT * FROM announcements
       WHERE is_active = 1
         AND (start_date IS NULL OR start_date <= ?)
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY sort_order ASC, created_at DESC`, [today, today]
    );
    res.json(announcements);
  } catch (err) {
    console.error('GET /api/announcements failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    await releaseExpiredHolds(io);
    const session = await get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const seatRow = await get(
      `SELECT
         COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_seats,
         COUNT(CASE WHEN is_disabled = 0 THEN 1 END) as total_seats
       FROM seats
       WHERE session_id = ?`,
      [session.id]
    );
    res.json(withSessionBookingStatus(session, {
      soldOut: Number(seatRow?.total_seats || 0) > 0 && Number(seatRow?.sold_seats || 0) >= Number(seatRow?.total_seats || 0),
    }));
  } catch (err) {
    console.error('GET /api/sessions/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Seats ---
app.get('/api/sessions/:sessionId/seats', async (req, res) => {
  try {
    await releaseExpiredHolds(io);
    const holderId = String(req.query.holderId || '').trim();
    const seats = await all(`
      SELECT s.id, s.table_number, s.chair_number, s.status, s.is_disabled,
             CASE WHEN s.status = 'held' AND s.held_by = ? THEN 1 ELSE 0 END as isMyHold
      FROM seats s
      WHERE s.session_id = ?
      ORDER BY s.table_number ASC, s.chair_number ASC
    `, [holderId, req.params.sessionId]);
    res.json(seats);
  } catch (err) {
    console.error('GET /api/sessions/:sessionId/seats failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Packages ---
app.get('/api/packages', async (req, res) => {
  try {
    res.json(await all('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC'));
  } catch (err) {
    console.error('GET /api/packages failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

  if (await hasPriorPaidBooking(email)) {
    return res.json({
      ok: true,
      alreadyVerified: true,
      message: 'This email has already completed a paid booking.',
    });
  }

  try {
    await run('DELETE FROM email_verifications WHERE expires_at < ?', [new Date().toISOString()]);

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const verificationId = uuid();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await run(
      `INSERT INTO email_verifications
        (id, email, code_hash, customer_first_name, customer_last_name, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [verificationId, email, codeHash, customerFirstName, customerLastName, expiresAt, new Date().toISOString()]
    );
    await saveDb();

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

  try {
    const verification = await get(
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
      await run('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?', [verificationId]);
      await saveDb();
      return res.status(400).json({ error: 'That code is not correct.' });
    }

    await run('UPDATE email_verifications SET verified_at = ? WHERE id = ?', [new Date().toISOString(), verificationId]);
    await saveDb();
    res.json({ ok: true, verificationId });
  } catch (err) {
    console.error('POST /api/email-verifications/verify failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Create Booking ---
// ============ BOOKINGS — CUSTOMER PATHS ============

// Legacy/admin path: creates a booking and marks it 'paid' IMMEDIATELY without
// a real payment processor. Originally the only path; now reserved for admin
// comp/staff bookings or any flow where money was collected elsewhere.
// Customer-facing UI should hit POST /api/bookings/initiate instead.
app.post('/api/bookings', adminAuth, async (req, res) => {
  try {
    const validation = await validateBookingRequest(req.body, { requireEmailVerification: false, requireCustomerDetails: false });
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
      requiredPkg,
      requiredPkgs,
      sessionType
    } = validation.data;

    const phdCheck = await validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg, sessionType, requiredPkgs);
    if (!phdCheck.ok) return res.status(400).json({ error: phdCheck.error });

    const { bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken } = await insertBookingRecord({
      sessionId,
      attendees,
      requiredPkg,
      requiredPkgs,
      sessionPkgs,
      useSessionPkgs,
      email: trimmedEmail,
      customerFirstName,
      customerLastName,
      emailVerifiedAt,
      sessionType
    });

    // No payment processor in this path — flip directly to 'paid'.
    // markBookingPaid handles seat flips, sockets, audit, and email.
    await markBookingPaid({ bookingId, source: 'instant_legacy' });

    res.json({
      bookingId,
      referenceNumber: refNumber,
      itemReferences: itemRefs,
      totalAmount,
      totalFormatted: formatCurrency(totalAmount),
      email: trimmedEmail,
      customerFirstName,
      customerLastName,
      ticketAccessToken,
    });
  } catch (err) {
    console.error('POST /api/bookings failed:', err);
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
  let failureHoldContext = {
    holderId: req.body?.holderId,
    attendees: req.body?.attendees,
  };
  let bookingIdForFailure = null;
  try {
    const validation = await validateBookingRequest(req.body, { requireEmailVerification: false, requireEmail: true });
    if (!validation.ok) {
      await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
      return res.status(validation.statusCode).json({ error: validation.error });
    }
    const {
      sessionId,
      holderId,
      attendees,
      trimmedEmail,
      customerFirstName,
      customerLastName,
      emailVerifiedAt,
      useSessionPkgs,
      sessionPkgs,
      requiredPkg,
      requiredPkgs,
      sessionType
    } = validation.data;
    failureHoldContext = { holderId, attendees };

    const phdCheck = await validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg, sessionType, requiredPkgs);
    if (!phdCheck.ok) {
      await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
      return res.status(400).json({ error: phdCheck.error });
    }

    const initiationKey = getBookingInitiationKey({ sessionId, holderId, attendees });
    const initiation = await withBookingInitiationLock(initiationKey, async () => {
      const reusable = await findReusablePendingBooking({
        sessionId,
        holderId,
        attendees,
        email: trimmedEmail,
      });
      if (reusable?.inProgress) {
        return {
          statusCode: 409,
          body: {
            error: 'Booking initiation already in progress. Please wait a moment and try again.',
            bookingId: reusable.bookingId,
            referenceNumber: reusable.refNumber,
          },
        };
      }
      if (reusable) {
        const refreshedHoldUntil = holdExpiresAt(HOLD_MINUTES);
        for (const att of attendees) {
          await run('UPDATE seats SET held_until = ? WHERE id = ?', [refreshedHoldUntil, att.seatId]);
        }
        const refreshedTotalAmount = await calculateRequestedBookingTotal({
          attendees,
          requiredPkg,
          requiredPkgs,
          sessionPkgs,
          useSessionPkgs,
          sessionType,
        });
        const refreshedTicketSubtotal = await calculateRequestedTicketSubtotal({
          attendees,
          requiredPkg,
          requiredPkgs,
          sessionPkgs,
          useSessionPkgs,
        });
        const refreshedSalesTaxAmount = getTicketSalesTaxCents(refreshedTicketSubtotal, sessionType);

        const result = await createHostedPaymentPage({
          bookingId: reusable.bookingId,
          amountCents: refreshedTotalAmount,
          email: trimmedEmail,
          firstName: customerFirstName,
          lastName: customerLastName,
          refNumber: reusable.refNumber,
        });

        if (!result.ok) {
          await markBookingFailed({ bookingId: reusable.bookingId, reason: result.error, source: 'server' });
          console.error(`[bookings] /initiate failed to refresh hosted page token: ${result.error}`);
          return { statusCode: 502, body: { error: 'Could not start payment. Please try again.' } };
        }

        await run(
          `UPDATE bookings
           SET hosted_token = ?, payment_attempted_at = ?, customer_first_name = ?, customer_last_name = ?, total_amount = ?
           WHERE id = ?`,
          [result.token, new Date().toISOString(), customerFirstName, customerLastName, refreshedTotalAmount, reusable.bookingId]
        );
        await saveDb();
        await logPaymentEvent(reusable.bookingId, 'initiated', 'server', {
          totalAmount: refreshedTotalAmount,
          refNumber: reusable.refNumber,
          refreshed: true,
        });

        return {
          statusCode: 200,
          body: buildInitiateResponse({
            ...reusable,
            totalAmount: refreshedTotalAmount,
            customerFirstName,
            customerLastName,
            token: result.token,
            serviceFeeAmount: getCheckoutServiceFeeCents(attendees, sessionType),
            serviceFeeQuantity: attendees.length,
            salesTaxAmount: refreshedSalesTaxAmount,
            duplicate: true,
          }),
        };
      }

      let bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken, salesTaxAmount;
      try {
        ({ bookingId, refNumber, totalAmount, itemRefs, ticketAccessToken, salesTaxAmount } = await insertBookingRecord({
          sessionId,
          attendees,
          requiredPkg,
          requiredPkgs,
          sessionPkgs,
          useSessionPkgs,
          email: trimmedEmail,
          customerFirstName,
          customerLastName,
          emailVerifiedAt,
          sessionType
        }));
        bookingIdForFailure = bookingId;

        // Refresh held_until so seats survive the hosted-page detour.
        // This gives the customer a fresh hold window from clicking Confirm.
        const newHoldUntil = holdExpiresAt(HOLD_MINUTES);
        for (const att of attendees) {
          await run('UPDATE seats SET held_until = ? WHERE id = ?', [newHoldUntil, att.seatId]);
        }
        await run('UPDATE bookings SET payment_attempted_at = ? WHERE id = ?',
          [new Date().toISOString(), bookingId]);

        await saveDb();
        await logPaymentEvent(bookingId, 'initiated', 'server', { totalAmount, refNumber });
      } catch (err) {
        console.error('Initiate booking insert error:', err);
        await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
        return { statusCode: 500, body: { error: 'Booking initiation failed' } };
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
        await markBookingFailed({ bookingId, reason: result.error, source: 'server' });
        console.error(`[bookings] /initiate failed to get hosted page token: ${result.error}`);
        return { statusCode: 502, body: { error: 'Could not start payment. Please try again.' } };
      }

      await run('UPDATE bookings SET hosted_token = ? WHERE id = ?', [result.token, bookingId]);
      await saveDb();

      return {
        statusCode: 200,
        body: buildInitiateResponse({
          bookingId,
          refNumber,
          totalAmount,
          itemRefs,
          ticketAccessToken,
          email: trimmedEmail,
          customerFirstName,
          customerLastName,
          token: result.token,
          serviceFeeAmount: getCheckoutServiceFeeCents(attendees, sessionType),
          serviceFeeQuantity: attendees.length,
          salesTaxAmount,
        }),
      };
    });

    return res.status(initiation.statusCode).json(initiation.body);
  } catch (err) {
    console.error('POST /api/bookings/initiate failed:', err);
    if (bookingIdForFailure) {
      await markBookingFailed({ bookingId: bookingIdForFailure, reason: err?.message || 'unexpected initiate error', source: 'server' });
    } else {
      await shortenRequestedSeatHolds({ ...failureHoldContext, minutes: PAYMENT_FAILURE_HOLD_MINUTES, io });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/bookings/:id/edit', bookingLimiter, async (req, res) => {
  try {
    const result = await cancelPendingBookingForEdit({ bookingId: req.params.id });
    if (!result.ok) {
      const statusCode = result.error === 'already_paid' ? 409 : result.error === 'booking_not_found' ? 404 : 400;
      return res.status(statusCode).json({ error: result.error });
    }
    res.json({ success: true, heldUntil: result.heldUntil || null });
  } catch (err) {
    console.error('POST /api/bookings/:id/edit failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Status polling — used by the client processing page to check booking state
// while waiting for /payment/return or the webhook to flip it to paid/failed.
app.get('/api/bookings/:id/status', async (req, res) => {
  try {
    const booking = await get(
      'SELECT id, reference_number, payment_status, total_amount, payment_failure_reason, ticket_access_token FROM bookings WHERE id = ?',
      [req.params.id]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({
      bookingId: booking.id,
      referenceNumber: booking.reference_number,
      status: booking.payment_status,
      totalAmount: booking.total_amount,
      totalFormatted: formatCurrency(booking.total_amount),
      failureReason: booking.payment_failure_reason,
      ticketAccessToken: booking.payment_status === 'paid' ? booking.ticket_access_token : undefined,
    });
  } catch (err) {
    console.error('GET /api/bookings/:id/status failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

async function findBookingForPaymentReturn(req) {
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
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (booking) return booking;
  }

  if (invoiceNumber) {
    const booking = await get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
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
    await logPaymentEvent(booking.id, 'return_verify_error', 'authorize_net_browser', {
      transactionId,
      error: verify.error,
    });
    return;
  }

  if (verify.invoiceNumber !== booking.reference_number) {
    await logPaymentEvent(booking.id, 'return_verify_mismatch', 'authorize_net_browser', {
      transactionId,
      expectedInvoiceNumber: booking.reference_number,
      actualInvoiceNumber: verify.invoiceNumber,
    });
    return;
  }

  if (verify.amountCents !== booking.total_amount) {
    await logPaymentEvent(booking.id, 'return_verify_mismatch', 'authorize_net_browser', {
      transactionId,
      expectedAmountCents: booking.total_amount,
      actualAmountCents: verify.amountCents,
    });
    return;
  }

  if (verify.approved) {
    await markBookingPaid({
      bookingId: booking.id,
      transactionId,
      authCode: verify.authCode,
      source: 'authorize_net_browser_verified',
    });
    return;
  }

  if (['2', '3'].includes(String(verify.responseCode))) {
    await markBookingFailed({
      bookingId: booking.id,
      reason: verify.error || `Authorize.Net response code ${verify.responseCode}`,
      source: 'authorize_net_browser_verified',
    });
  }
}

function scheduleDeferredWebhookVerification({
  bookingId,
  transactionId,
  eventType,
  notificationId,
  invoiceNumber,
  attempt = 1,
}) {
  const retryDelaysMs = [30000, 120000, 300000];
  const delayMs = retryDelaysMs[attempt - 1];
  if (!delayMs) return;

  const timer = setTimeout(async () => {
    try {
      const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      if (!booking || booking.payment_status === 'paid') return;

      const verify = await verifyTransaction(transactionId);
      if (!verify.ok) {
        console.error(`[webhooks] deferred verification attempt ${attempt} failed for booking=${bookingId} transId=${transactionId}: ${verify.error || 'unknown error'}`);
        await logPaymentEvent(bookingId, 'webhook_verify_retry_error', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId: transactionId,
          invoiceNumber,
          attempt,
          error: verify.error || null,
        });
        scheduleDeferredWebhookVerification({
          bookingId,
          transactionId,
          eventType,
          notificationId,
          invoiceNumber,
          attempt: attempt + 1,
        });
        return;
      }

      if (verify.invoiceNumber !== booking.reference_number || verify.amountCents !== booking.total_amount) {
        await logPaymentEvent(bookingId, 'webhook_verify_retry_mismatch', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId: transactionId,
          expectedInvoiceNumber: booking.reference_number,
          actualInvoiceNumber: verify.invoiceNumber,
          expectedAmountCents: booking.total_amount,
          actualAmountCents: verify.amountCents,
        });
        return;
      }

      if (verify.approved) {
        await markBookingPaid({
          bookingId,
          transactionId,
          authCode: verify.authCode,
          source: 'authorize_net_webhook_deferred',
        });
        return;
      }

      if (['2', '3'].includes(String(verify.responseCode))) {
        await markBookingFailed({
          bookingId,
          reason: verify.error || `Authorize.Net response code ${verify.responseCode}`,
          source: 'authorize_net_webhook_deferred',
        });
      }
    } catch (err) {
      console.error('[webhooks] deferred verification timer failed:', err?.message || err);
    }
  }, delayMs);

  if (typeof timer.unref === 'function') timer.unref();
}

app.all('/payment/return', async (req, res) => {
  try {
    const booking = await findBookingForPaymentReturn(req);
    const transactionId = getReturnTransactionId(req);
    const bookingId = booking?.id;
    if (!bookingId) {
      console.warn('[payments] /payment/return called without a matching booking', {
        method: req.method,
        bodyKeys: Object.keys(req.body || {}),
      });
      return res.redirect('/');
    }
    await logPaymentEvent(bookingId, 'returned', 'authorize_net_browser', {
      method: req.method,
      transactionId: transactionId || null,
      bodyKeys: Object.keys(req.body || {}),
    });
    try {
      await reconcilePaymentReturn(booking, transactionId);
    } catch (err) {
      console.error('[payments] browser return reconciliation failed:', err?.message || err);
      await logPaymentEvent(bookingId, 'return_verify_error', 'authorize_net_browser', {
        transactionId: transactionId || null,
        error: err?.message || String(err),
      });
    }
    return res.redirect(`/booking/${encodeURIComponent(bookingId)}/processing`);
  } catch (err) {
    console.error('ALL /payment/return failed:', err);
    return res.redirect('/');
  }
});

app.all('/payment/cancel', async (req, res) => {
  try {
    const booking = await findBookingForPaymentReturn(req);
    if (booking?.id) {
      await markBookingCancelled({ bookingId: booking.id, source: 'customer' });
    }
    // Client-side route — shows "Payment cancelled" with a "Try Again" button.
    // Seats remain 'held' so the customer can retry without losing them.
    return res.redirect(`/booking/${encodeURIComponent(booking?.id || '')}/cancelled`);
  } catch (err) {
    console.error('ALL /payment/cancel failed:', err);
    return res.redirect('/');
  }
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
async function processAuthorizeNetWebhook({ rawBody, sigHeader, event }) {
  const { eventType, payload, notificationId } = event || {};
  const transId = payload?.id;
  let invoiceNumber = payload?.merchantReferenceId || payload?.invoiceNumber;
  const signatureValid = verifyWebhookSignature(rawBody, sigHeader);

  if (!invoiceNumber && signatureValid && transId) {
    const verify = await verifyTransaction(transId);
    if (verify.ok && verify.invoiceNumber) {
      invoiceNumber = verify.invoiceNumber;
      console.log(`[webhooks] resolved missing invoiceNumber from transaction details for ${eventType}: ${invoiceNumber}`);
    } else {
      console.warn(`[webhooks] could not resolve invoiceNumber for ${eventType} transId=${transId}: ${verify.error || 'no invoiceNumber'}`);
    }
  }

  if (!invoiceNumber) {
    console.warn(`[webhooks] event has no invoiceNumber: ${eventType}`);
    return;
  }

  // We set Authorize.Net's invoiceNumber to our reference_number when
  // creating the hosted page, so we can look up the booking from it.
  const booking = await get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
  if (!booking) {
    console.warn(`[webhooks] booking not found for invoiceNumber=${invoiceNumber} eventType=${eventType}`);
    return;
  }

  if (!signatureValid) {
    console.warn(`[webhooks] signature invalid for booking=${booking.id} ref=${invoiceNumber} eventType=${eventType}`);
    await logPaymentEvent(booking.id, 'webhook_signature_invalid', 'authorize_net_webhook', {
      eventType,
      notificationId,
      transId,
      invoiceNumber,
    });

    if (eventType !== 'net.authorize.payment.authcapture.created' || !transId) {
      return;
    }

    try {
      if (booking.payment_status === 'paid' && booking.transaction_id === transId) {
        return;
      }

      const verify = await verifyTransaction(transId);
      if (!verify.ok) {
        console.error(`[webhooks] invalid-signature fallback verification failed for ${eventType}: ${verify.error || 'unknown error'}`);
        await logPaymentEvent(booking.id, 'webhook_signature_invalid_verify_error', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId,
          invoiceNumber,
          error: verify.error || null,
        });
        return;
      }

      const verifiedMatch = verify.ok &&
        verify.approved &&
        verify.invoiceNumber === booking.reference_number &&
        verify.amountCents === booking.total_amount;

      if (!verifiedMatch) {
        await logPaymentEvent(booking.id, 'webhook_signature_invalid_rejected', 'authorize_net_webhook', {
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
        return;
      }

      await logPaymentEvent(booking.id, 'webhook_signature_invalid_verified', 'authorize_net_webhook', {
        eventType,
        notificationId,
        transId,
        invoiceNumber,
      });
      await markBookingPaid({
        bookingId: booking.id,
        transactionId: transId,
        authCode: verify.authCode,
        source: 'authorize_net_webhook_verified_transaction',
      });
      return;
    } catch (err) {
      console.error(`[webhooks] invalid-signature fallback failed for ${eventType}:`, err?.message || err);
      await logPaymentEvent(booking.id, 'webhook_error', 'authorize_net_webhook', {
        eventType,
        notificationId,
        transId,
        invoiceNumber,
        error: err?.message || String(err),
      });
      return;
    }
  }

  // Always log the inbound event for audit / debugging.
  await logPaymentEvent(booking.id, 'webhook', 'authorize_net_webhook', {
    eventType, notificationId, transId, invoiceNumber,
  });

  console.log(`[webhooks] ${eventType} booking=${booking.id} ref=${invoiceNumber} transId=${transId}`);

  try {
    if (eventType === 'net.authorize.payment.authcapture.created') {
      // Idempotent — second webhook for the same booking is a no-op.
      if (booking.payment_status === 'paid') {
        return;
      }
      // Verify the transaction with Authorize.Net before flipping. Defence
      // in depth: the signature proves the payload is from Authorize.Net,
      // but a redundant API lookup also confirms the transaction approved.
      const verify = await verifyTransaction(transId);
      if (!verify.ok) {
        console.error(`[webhooks] transaction verification deferred for booking=${booking.id} transId=${transId}: ${verify.error || 'unknown error'}`);
        await logPaymentEvent(booking.id, 'webhook_verify_deferred', 'authorize_net_webhook', {
          eventType,
          notificationId,
          transId,
          invoiceNumber,
          error: verify.error || null,
        });
        scheduleDeferredWebhookVerification({
          bookingId: booking.id,
          transactionId: transId,
          eventType,
          notificationId,
          invoiceNumber,
        });
        return;
      }
      if (verify.approved) {
        await markBookingPaid({
          bookingId: booking.id,
          transactionId: transId,
          authCode: verify.authCode,
          source: 'authorize_net_webhook',
        });
      } else {
        await markBookingFailed({
          bookingId: booking.id,
          reason: verify.error || 'transaction not approved at verify step',
          source: 'authorize_net_webhook',
        });
      }
    } else if (eventType === 'net.authorize.payment.refund.created') {
      await markBookingRefunded({
        bookingId: booking.id,
        transactionId: transId,
        source: 'authorize_net_webhook',
      });
    } else if (eventType === 'net.authorize.payment.void.created') {
      await markBookingVoided({
        bookingId: booking.id,
        transactionId: transId,
        source: 'authorize_net_webhook',
      });
    } else if (eventType === 'net.authorize.payment.fraud.declined') {
      await markBookingFailed({
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
    await logPaymentEvent(booking.id, 'webhook_error', 'authorize_net_webhook', {
      eventType,
      notificationId,
      transId,
      invoiceNumber,
      error: err?.message || String(err),
    });
  }
}

app.post('/api/webhooks/authorize-net',
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.body)
        ? req.body
        : null;
    const sigHeader = req.get('X-ANET-Signature');

    if (!Buffer.isBuffer(rawBody)) {
      console.warn('[webhooks] missing raw request body');
      return res.status(400).end();
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      console.error('[webhooks] malformed JSON:', err?.message || err);
      return res.status(400).end();
    }

    // Authorize.Net disables webhooks after repeated non-200 deliveries.
    // Acknowledge receipt before database/API/email processing.
    res.status(200).end();

    processAuthorizeNetWebhook({ rawBody, sigHeader, event }).catch((err) => {
      console.error('[webhooks] async handler failed:', err?.message || err);
    });
  }
);

// ============ ADMIN ============

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    // Check env-var admin
    if (username.toLowerCase() === (process.env.ADMIN_USERNAME || '').toLowerCase() && password === process.env.ADMIN_PASSWORD) {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      return res.json({ token, displayName: 'Admin', isSuperUser: true, role: 'super_user' });
    }
    // Check DB admin users
    const dbUser = await get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [username]);
    if (dbUser && bcrypt.compareSync(password, dbUser.password_hash)) {
      const superUser = isSuperUser(dbUser.email, 'db', dbUser);
      const role = superUser ? 'super_user' : ['admin', 'print_staff'].includes(String(dbUser.role || '').toLowerCase()) ? String(dbUser.role).toLowerCase() : 'admin';
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      return res.json({
        token,
        displayName: dbUser.display_name || dbUser.email,
        isSuperUser: superUser,
        role,
      });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('POST /api/admin/login failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ ADMIN USERS ============

app.get('/api/admin/users', adminAuth, requireSuperUser, async (req, res) => {
  try {
    const users = await all("SELECT id, email, display_name, is_active, is_super_user, COALESCE(role, CASE WHEN is_super_user = 1 THEN 'super_user' ELSE 'admin' END) as role, created_at FROM admin_users ORDER BY created_at");
    res.json(users);
  } catch (err) {
    console.error('GET /api/admin/users failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users', adminAuth, requireSuperUser, async (req, res) => {
  try {
    const { email, password, displayName, isSuperUser: makeSuperUser } = req.body;
    const role = ['super_user', 'admin', 'print_staff'].includes(String(req.body.role || '').toLowerCase())
      ? String(req.body.role).toLowerCase()
      : makeSuperUser ? 'super_user' : 'admin';
    const normalizedEmail = (email || '').trim();
    if (!normalizedEmail || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'A valid email address is required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const existing = await get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
    if (existing) return res.status(409).json({ error: 'User with this email already exists' });
    const id = uuid();
    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO admin_users (id, email, password_hash, display_name, is_super_user, role) VALUES (?, ?, ?, ?, ?, ?)',
      [id, normalizedEmail, hash, displayName || null, role === 'super_user' ? 1 : 0, role]);
    await logAudit('admin_user_created', 'admin_user', id, {
      email: normalizedEmail,
      displayName: displayName || null,
      role,
      isSuperUser: role === 'super_user',
      createdBy: req.adminUser.email,
    });
    res.status(201).json({ id, email: normalizedEmail, displayName: displayName || null, isSuperUser: role === 'super_user', role });
  } catch (err) {
    console.error('POST /api/admin/users failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/admin/users/:id', adminAuth, requireSuperUser, async (req, res) => {
  try {
    const { email, password, displayName, isActive } = req.body;
    const user = await get('SELECT * FROM admin_users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (email !== undefined) {
      const normalizedEmail = (email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'A valid email address is required' });
      const existing = await get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?) AND id <> ?', [normalizedEmail, req.params.id]);
      if (existing) return res.status(409).json({ error: 'User with this email already exists' });
      await run('UPDATE admin_users SET email = ?, updated_at = datetime(\'now\') WHERE id = ?', [normalizedEmail, req.params.id]);
    }
    if (password && password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (password) await run('UPDATE admin_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
    if (displayName !== undefined) await run('UPDATE admin_users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?', [displayName, req.params.id]);
    if (isActive !== undefined) {
      if (user.email.toLowerCase() === 'kylepaul@stmec.com' && !isActive) {
        return res.status(400).json({ error: 'Kyle account must remain active' });
      }
      await run('UPDATE admin_users SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
    }
    if (req.body.role !== undefined || req.body.isSuperUser !== undefined) {
      const nextRole = req.body.role !== undefined
        ? String(req.body.role || '').toLowerCase()
        : req.body.isSuperUser ? 'super_user' : 'admin';
      if (!['super_user', 'admin', 'print_staff'].includes(nextRole)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      if (user.email.toLowerCase() === 'kylepaul@stmec.com' && nextRole !== 'super_user') {
        return res.status(400).json({ error: 'Kyle account must remain a super user' });
      }
      await run('UPDATE admin_users SET role = ?, is_super_user = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextRole, nextRole === 'super_user' ? 1 : 0, req.params.id]);
    }
    await logAudit('admin_user_updated', 'admin_user', req.params.id, {
      email: email !== undefined ? email : user.email,
      updatedBy: req.adminUser.email,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/users/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/users/:id', adminAuth, requireSuperUser, async (req, res) => {
  try {
    const user = await get('SELECT * FROM admin_users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email.toLowerCase() === 'kylepaul@stmec.com') {
      return res.status(400).json({ error: 'Kyle account must remain active' });
    }
    await run('UPDATE admin_users SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?', [req.params.id]);
    await logAudit('admin_user_deactivated', 'admin_user', req.params.id, {
      email: user.email,
      deactivatedBy: req.adminUser.email,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ SETTINGS ============

const DEFAULT_RECEIPT_CONFIG = {
  businessName: 'SMEC BINGO',
  businessSubtitle: "Saint Mary's Entertainment Centre",
  receiptTitle: 'BOOKING RECEIPT',
  footerText: 'Thank you for your purchase!',
  showRefNumber: true,
  showTableChair: true,
  showPackagePrice: true,
  showAddons: true,
  showTimestamp: true,
  autoPrintEnabled: false,
  paperWidth: '80mm',
  partialCutBetweenReceipts: false,
  receiptCutPercent: 0,
};

function normalizeSettingValue(key, value) {
  if (key === 'special_bingo_config') {
    return normalizeSpecialBingoConfig(value);
  }

  if (key !== 'receipt_config' || !value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const rawCutPercent = Number(value.receiptCutPercent ?? (value.partialCutBetweenReceipts ? 70 : 0));
  const receiptCutPercent = Number.isFinite(rawCutPercent) && rawCutPercent > 0
    ? Math.min(99, Math.max(1, Math.round(rawCutPercent)))
    : 0;
  return {
    ...DEFAULT_RECEIPT_CONFIG,
    ...value,
    partialCutBetweenReceipts: receiptCutPercent > 0,
    receiptCutPercent,
  };
}

app.get('/api/admin/settings/:key', adminAuth, async (req, res) => {
  try {
    const row = await get('SELECT value FROM settings WHERE key = ?', [req.params.key]);
    if (!row) return res.json({ value: null });
    try {
      res.json({ value: normalizeSettingValue(req.params.key, JSON.parse(row.value)) });
    } catch {
      res.json({ value: row.value });
    }
  } catch (err) {
    console.error('GET /api/admin/settings/:key failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/settings/:key', adminAuth, async (req, res) => {
  try {
    const { value } = req.body;
    const normalizedValue = normalizeSettingValue(req.params.key, value);
    const serialized = typeof normalizedValue === 'string' ? normalizedValue : JSON.stringify(normalizedValue);
    const existing = await get('SELECT key FROM settings WHERE key = ?', [req.params.key]);
    if (existing) {
      await run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?", [serialized, req.params.key]);
    } else {
      await run("INSERT INTO settings (key, value) VALUES (?, ?)", [serialized, req.params.key]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/admin/settings/:key failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PHD INVENTORY (Admin) ============

app.get('/api/admin/phd-inventory', adminAuth, async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || (await getNextPhdSessionId()) || '').trim();
    res.json({
      ...(await getPhdInventoryForSession(sessionId)),
      perSession: await getPhdUsageBySession()
    });
  } catch (err) {
    console.error('GET /api/admin/phd-inventory failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/phd-inventory', adminAuth, async (req, res) => {
  try {
    const { totalStock, perPlayerLimit } = req.body;
    const config = await updateGlobalPhdConfig({ totalStock, perPlayerLimit });
    await logAudit('phd_inventory_updated', 'settings', 'phd_inventory', config);
    res.json({ ok: true, ...config });
  } catch (err) {
    console.error('PUT /api/admin/phd-inventory failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/phd-inventory/sessions/:sessionId', adminAuth, async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const session = await get('SELECT id FROM sessions WHERE id = ? AND deleted_at IS NULL', [sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    try {
      const config = await updatePhdSessionStock(sessionId, req.body?.totalStock);
      const inventory = await getPhdInventoryForSession(sessionId);
      await logAudit('phd_session_inventory_updated', 'session', sessionId, {
        sessionId,
        totalStock: inventory.totalStock,
        hasSessionStockOverride: inventory.hasSessionStockOverride,
      });
      res.json({ ok: true, config, inventory });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to update session PHD stock' });
    }
  } catch (err) {
    console.error('PUT /api/admin/phd-inventory/sessions/:sessionId failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

registerAdminReportRoutes(app);

registerAdminCustomerRoutes(app);

registerAdminSessionRoutes(app, { io, logAudit });

registerAdminBookingRoutes(app, {
  io,
  logAudit,
  getBookingItemRefundAmount,
  markBookingItemRefunded,
  markBookingRefunded,
  markBookingVoided,
});

registerAnnouncementRoutes(app, { io, upload, saveUploadedImage });

registerAdminScheduleRoutes(app, { logAudit });

registerAdminBulkTicketRoutes(app, { logAudit });

registerSeatRoutes(app, { bookingLimiter, holdMinutes: HOLD_MINUTES, io });

registerSocketHandlers(io, { logger, authenticateAdminToken });
registerTicketRoutes(app);

// Keep API misses as JSON. Without this, the SPA fallback returns index.html,
// and admin fetch callers fail with "Unexpected token '<'" while parsing JSON.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

// ============ SPA FALLBACK ============
app.get('*', (req, res) => {
  setAppShellNoCache(res);
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// ============ START ============
async function start() {
  await getDb();
  logger.info('Database connected');

  if ((process.env.DB_DRIVER || 'sqlite').toLowerCase().trim() === 'postgres') {
    await migratePostgres();
  } else {
    await migrate();
  }
  logger.info('Migrations applied');

  migrateSeatLayout();
  await seedInitialAdminFromEnv(logger);

  server.listen(PORT, () => {
    logger.info('Server started', { port: PORT, url: `http://localhost:${PORT}` });
  });

  await startMaintenanceTasks(io, { reconcileReversedBookingSeats }, logger);
  registerGracefulShutdown({ server, logger });
}

export { app, io, server, start };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch(err => {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}
