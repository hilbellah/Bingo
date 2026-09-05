import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
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
import { adminAuth, authenticateAdminToken } from './middleware/adminAuth.js';
import { archivePastSessions } from './services/sessionArchive.js';
import {
  hasPriorPaidBooking,
  isValidCustomerName,
  isValidEmail,
  normalizeCustomerName,
  normalizeEmail,
  verifyBookingEmail
} from './services/customers.js';
import { logPaymentEvent } from './services/paymentEvents.js';
import {
  releaseExpiredHolds,
  resolveHoldConfig,
} from './services/holds.js';
import { getSessionBookingStatus, withSessionBookingStatus } from './services/sessionBookingStatus.js';
import { getLiveEventCapacity } from './services/liveEventCapacity.js';
import { getPhdInventoryForSession } from './services/phdInventory.js';
import { registerAdminBookingRoutes } from './routes/adminBookingRoutes.js';
import { registerAdminRefundApprovalRoutes } from './routes/adminRefundApprovalRoutes.js';
import { registerAdminPaymentReviewRoutes } from './routes/adminPaymentReviewRoutes.js';
import { registerCheckoutRoutes } from './routes/checkoutRoutes.js';
import { registerWebhookRoutes } from './routes/webhookRoutes.js';
import { registerAdminAuthRoutes } from './routes/adminAuthRoutes.js';
import { registerAdminSettingsRoutes } from './routes/adminSettingsRoutes.js';
import { registerAdminBulkTicketRoutes } from './routes/adminBulkTicketRoutes.js';
import { registerAdminCustomerRoutes } from './routes/adminCustomerRoutes.js';
import { registerAdminReportRoutes } from './routes/adminReportRoutes.js';
import { registerAdminScheduleRoutes } from './routes/adminScheduleRoutes.js';
import { registerAdminSessionRoutes } from './routes/adminSessionRoutes.js';
import { registerAnnouncementRoutes } from './routes/announcementRoutes.js';
import { registerWebsiteEventRoutes } from './routes/websiteEventRoutes.js';
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
import { formatCurrency, formatVenueDate, generateRef } from './utils/format.js';
import { sendEmailVerificationCode, sendPaymentAuditAlert } from './services/email.js';
import {
  createHostedPaymentPage,
  listSettledTransactions,
  listUnsettledTransactions,
  verifyTransaction,
} from './services/payments.js';
import { createPaymentReconciler, startPaymentReconciliation } from './services/paymentReconciliation.js';
import { createGatewayAuditor, startGatewayAudit, REVIEW_ESCALATION_HOURS } from './services/paymentAudit.js';
import { protectInFlightCheckoutHolds } from './services/checkoutGuards.js';
import { createBookingPaymentService } from './services/bookingPayments.js';
import {
  getBookingConfig,
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
// While a customer is on the card form or the "confirming your payment" page,
// their status poll keeps the seat hold alive (see keepCheckoutHoldAlive) so a
// slow gateway cannot expire the hold under them. Capped so an abandoned tab
// cannot block a seat all day.
const CHECKOUT_HEARTBEAT_MAX_MINUTES = (() => {
  const configured = Number(process.env.CHECKOUT_HEARTBEAT_MAX_MINUTES || 90);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.floor(configured), 240) : 90;
})();
// Once a customer reaches the card form their seats stay held for this long
// (browsing holds stay HOLD_MINUTES). Margin for the moment they close the tab
// before the payment signal arrives. Never shorter than the browsing hold.
const CHECKOUT_HOLD_MINUTES = (() => {
  const configured = Number(process.env.CHECKOUT_HOLD_MINUTES || 30);
  const value = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 30;
  return Math.min(Math.max(value, HOLD_MINUTES), 120);
})();
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

const { uploadsDir, legacyUploadsDir, upload, saveUploadedImage } = createUploadMiddleware(__dirname);
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
    checkoutHoldMinutes: CHECKOUT_HOLD_MINUTES,
    // Counters only (no booking or gateway data): lets ops confirm the
    // webhook-independent reconciler is running and talking to the gateway.
    paymentReconciliation: paymentReconciler.getStats(),
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
// Gzip responses (JSON APIs like the ~57KB seat map compress ~10x; Render's
// proxy does not compress for us). Runs before routes; skips tiny payloads
// and already-compressed content types by default.
app.use(compression());
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

// Serve uploaded files. Two roots: the durable one first, then the legacy
// in-tree directory so URLs issued before uploads moved to the persistent
// disk keep resolving. Flyers published to wolastoqcasino.ca are served from
// here, so a 404 would show up on the marketing site as a broken poster.
const uploadStaticOptions = {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Helmet's default Cross-Origin-Resource-Policy is same-origin, which
    // makes browsers refuse to render these images on wolastoqcasino.ca —
    // exactly where published event flyers are embedded. Uploads are public
    // content; let any origin display them.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
};
app.use('/uploads', express.static(uploadsDir, uploadStaticOptions));
if (legacyUploadsDir && legacyUploadsDir !== uploadsDir) {
  app.use('/uploads', express.static(legacyUploadsDir, uploadStaticOptions));
}

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
  const requiredById = new Map(requiredPkgs.map(pkg => [pkg.id, pkg]));
  const requiredPhdIncluded = sessionType === 'regular_bingo' && requiredPkgs.some(pkg => pkg?.is_phd);
  const normalizedAttendees = [];

  for (const attendee of attendees) {
    let ticketPackageId = null;
    if (sessionType === 'event') {
      ticketPackageId = String(attendee?.ticketPackageId || requiredPkgs[0]?.id || '').trim();
      if (!ticketPackageId || !requiredById.has(ticketPackageId)) {
        return { ok: false, statusCode: 400, error: 'Select a valid live event ticket type for each attendee.' };
      }
    }

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

    normalizedAttendees.push({ ...attendee, ticketPackageId, addons: normalizedAddons });
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

  // One chair per attendee: a double-tap race in the client could submit the
  // same seat twice, producing two charged tickets for one physical chair.
  const attendeeSeatIds = attendees.map(att => String(att?.seatId || '').trim()).filter(Boolean);
  if (new Set(attendeeSeatIds).size !== attendeeSeatIds.length) {
    return { ok: false, statusCode: 400, error: 'Each attendee must have a different seat.' };
  }
  // Every customer flow caps at 6 tickets per order; enforce it here too so
  // a client-side race can never charge an oversized booking.
  if (attendees.length > 6) {
    return { ok: false, statusCode: 400, error: 'A booking can include at most 6 tickets.' };
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

  const eventCapacity = await getLiveEventCapacity(session);
  if (eventCapacity && eventCapacity.reserved > eventCapacity.limit) {
    return { ok: false, statusCode: 409, error: 'This live event has reached its ticket limit.' };
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

async function buildBookingLineItems({
  bookingId,
  attendees,
  requiredPkg,
  requiredPkgs = [requiredPkg].filter(Boolean),
  sessionPkgs,
  useSessionPkgs,
  sessionType = 'regular_bingo',
  itemReferenceBySeat = new Map(),
}) {
  let ticketSubtotal = 0;
  let totalAmount = getCheckoutServiceFeeCents(attendees, sessionType);
  const itemRefs = [];
  const itemRows = [];
  const addonRows = [];

  for (const att of attendees) {
    const itemId = uuid();
    const seatKey = String(att.seatId || '').trim();
    const itemRef = itemReferenceBySeat.get(seatKey) || generateRef();
    itemRefs.push(itemRef);
    const includedRequiredPkgs = sessionType === 'event'
      ? [requiredPkgs.find(pkg => pkg.id === att.ticketPackageId) || requiredPkg].filter(Boolean)
      : (requiredPkgs.length > 0 ? requiredPkgs : [requiredPkg]);
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

  return { totalAmount, itemRefs, itemRows, addonRows, salesTaxAmount, ticketSubtotal };
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
  holderId,
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

  const bookingId = uuid();
  const refNumber = generateRef();
  const ticketAccessToken = generateTicketAccessToken();
  const { totalAmount, itemRefs, itemRows, addonRows, salesTaxAmount } = await buildBookingLineItems({
    bookingId,
    attendees,
    requiredPkg,
    requiredPkgs,
    sessionPkgs,
    useSessionPkgs,
    sessionType,
  });

  let bookingInserted = false;
  try {
    await run(
      `INSERT INTO bookings
        (id, session_id, reference_number, total_amount, payment_status, created_at, email,
         customer_first_name, customer_last_name, email_verified_at, ticket_access_token, checkout_holder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        holderId || null,
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

// The booking payment state machine (markBookingPaid and every other
// payment_status / seat transition) lives in services/bookingPayments.js.
// It is created here because it needs the socket server, the audit writer
// and the hold windows from this module.
const {
  getSuperUserEmails,
  markBookingPaid,
  markBookingFailed,
  markBookingCancelled,
  cancelPendingBookingForEdit,
  reconcileReversedBookingSeats,
  markBookingRefunded,
  markBookingVoided,
  getBookingItemRefundAmount,
  markBookingItemRefunded,
  sendBookingConfirmationEmail,
} = createBookingPaymentService({
  io,
  logAudit,
  holdMinutes: HOLD_MINUTES,
  paymentFailureHoldMinutes: PAYMENT_FAILURE_HOLD_MINUTES,
});

// ============ API ROUTES ============

// --- Sessions ---
app.get('/api/sessions', async (req, res) => {
  try {
    await releaseExpiredHolds(io);
    await archivePastSessions();
    const today = formatVenueDate(new Date());
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
    res.json(await Promise.all(sessions.map(async session => {
      const capacity = await getLiveEventCapacity(session);
      const physicalAvailable = Number(session.available_seats || 0);
      const availableSeats = capacity ? Math.min(physicalAvailable, capacity.remaining) : physicalAvailable;
      return withSessionBookingStatus({
        ...session,
        available_seats: availableSeats,
        ticket_limit: capacity?.limit ?? session.ticket_limit ?? null,
        ticket_limit_remaining: capacity?.remaining ?? null,
      }, {
        soldOut: capacity ? capacity.remaining <= 0 : Number(session.total_seats) > 0 && Number(session.sold_seats) >= Number(session.total_seats),
      });
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
    const today = formatVenueDate(new Date());
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
    const capacity = await getLiveEventCapacity(session);
    res.json(withSessionBookingStatus({
      ...session,
      ticket_limit: capacity?.limit ?? session.ticket_limit ?? null,
      ticket_limit_remaining: capacity?.remaining ?? null,
    }, {
      soldOut: capacity ? capacity.remaining <= 0 : Number(seatRow?.total_seats || 0) > 0 && Number(seatRow?.sold_seats || 0) >= Number(seatRow?.total_seats || 0),
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
             CASE WHEN s.status = 'held' AND s.held_by = ? THEN 1 ELSE 0 END AS "isMyHold"
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

// Test-only seam: lets API checks stub gateway calls (webhook verification,
// hosted-page token creation), mirroring the paymentServices injection used
// by the refund approval routes. No-op outside NODE_ENV=test.
const testablePaymentServices = {
  verifyTransaction,
  createHostedPaymentPage,
  listUnsettledTransactions,
  listSettledTransactions,
};
export function __setPaymentServicesForTesting(overrides = {}) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setPaymentServicesForTesting is test-only');
  }
  Object.assign(testablePaymentServices, overrides);
}

// Webhook-independent confirmation: asks the gateway which pending bookings
// have an approved transaction and completes them via markBookingPaid. Runs
// on a timer (see start()) and on demand from the customer's status poll.
const paymentReconciler = createPaymentReconciler({
  paymentServices: testablePaymentServices,
  markBookingPaid,
  logger,
  // Gateway unreachable twice in a row: keep in-flight checkouts' seats off
  // the market until we can see payments again.
  protectCheckouts: async options => {
    const result = await protectInFlightCheckoutHolds(options);
    if (result.reheld > 0) io.emit('seats:refresh');
    return result;
  },
});
function reconcilePendingPayments(options = {}) {
  return paymentReconciler.reconcilePendingPayments(options);
}

// Gateway-side audit: every charge Authorize.Net captured must map to a
// booking that is confirmed, under review, or refunded. Runs every 6h and
// emails super users when a charge has nothing behind it.
const gatewayAuditor = createGatewayAuditor({
  paymentServices: testablePaymentServices,
  sendAlert: sendPaymentAuditAlert,
  getRecipients: getSuperUserEmails,
  logger,
});
function runGatewayAudit(options = {}) {
  return gatewayAuditor.runGatewayAudit(options);
}

// Machine-readable payments health for an external uptime monitor. 503 only
// for things a person must act on or that mean the safety net is down:
// captured money with no seat, or the gateway checks failing repeatedly.
// Open staff reviews are 'attention' (200) - they are a task, not an outage.
app.get('/health/payments', async (req, res) => {
  const problems = [];
  const reconciler = paymentReconciler.getStats();
  const audit = gatewayAuditor.getState();
  const nowMs = Date.now();
  const recent = iso => iso && (nowMs - new Date(iso).getTime()) < 15 * 60 * 1000;
  if (recent(reconciler.lastErrorAt)) problems.push(`gateway reconciliation failing: ${reconciler.lastError}`);
  if (reconciler.lastRunAt === null && nowMs - startTime > 10 * 60 * 1000 && process.env.PAYMENT_RECONCILE_DISABLED !== '1') {
    problems.push('gateway reconciliation has not run since boot');
  }
  if (audit.criticalCount > 0) problems.push(`${audit.criticalCount} critical payment anomaly(ies) from the gateway audit`);
  if (recent(audit.lastErrorAt)) problems.push(`gateway audit failing: ${audit.lastError}`);
  let openReviews = 0;
  try {
    // Reviews staff have explicitly marked handled do not count.
    const openReviewSql = `FROM bookings b WHERE b.payment_status = 'payment_review'
      AND NOT EXISTS (SELECT 1 FROM payment_events d WHERE d.booking_id = b.id AND d.event_type = 'payment_review_dismissed'
                      AND d.created_at >= COALESCE(b.payment_completed_at, b.created_at))`;
    const row = await get(`SELECT COUNT(*) as n, MIN(b.payment_completed_at) as oldest ${openReviewSql}`);
    openReviews = Number(row?.n || 0);
    if (row?.oldest && nowMs - new Date(row.oldest).getTime() > REVIEW_ESCALATION_HOURS * 3600 * 1000) {
      problems.push(`a payment has been waiting for staff review for more than ${REVIEW_ESCALATION_HOURS}h - a customer is charged with no confirmed seat`);
    }
    if (reconciler.degraded) problems.push('gateway unreachable - degraded mode, in-flight checkout seats are being protected');
  } catch (err) {
    problems.push(`database check failed: ${err?.message || err}`);
  }
  const status = problems.length > 0 ? 'error' : openReviews > 0 ? 'attention' : 'ok';
  res.status(status === 'error' ? 503 : 200).json({
    status,
    timestamp: new Date().toISOString(),
    problems,
    openReviews,
    reconciler,
    audit: { lastRunAt: audit.lastRunAt, lastError: audit.lastError, transactionsChecked: audit.transactionsChecked, criticalCount: audit.criticalCount, anomalyCount: audit.anomalies.length },
  });
});

// Customer checkout routes (/api/bookings/*, /payment/return|cancel) and the
// hold heartbeat live in routes/checkoutRoutes.js. Registered here, after the
// payment services and reconciler they depend on exist.
const { keepCheckoutHoldAlive } = registerCheckoutRoutes(app, {
  io,
  adminAuth,
  bookingLimiter,
  CHECKOUT_HOLD_MINUTES,
  PAYMENT_FAILURE_HOLD_MINUTES,
  CHECKOUT_SERVICE_FEE_CENTS,
  CHECKOUT_HEARTBEAT_MAX_MINUTES,
  logAudit,
  validateBookingRequest,
  insertBookingRecord,
  buildBookingLineItems,
  getBookingInitiationKey,
  withBookingInitiationLock,
  getCheckoutServiceFeeCents,
  testablePaymentServices,
  paymentReconciler,
  markBookingPaid,
  markBookingFailed,
  markBookingCancelled,
  cancelPendingBookingForEdit,
});

// Staff "Confirm seat" for a quarantined payment whose seat is still free.
// Returns the booking to 'pending' and re-runs the exact paid transition, so
// every guard (amount, conflicts, holds) applies and the customer receives
// the normal confirmation email. If the seat is taken it re-quarantines.
async function confirmReviewedPayment({ bookingId, adminEmail = 'admin', paymentServices = testablePaymentServices }) {
  const booking = await get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) return { ok: false, error: 'booking_not_found' };
  if (booking.payment_status !== 'payment_review') {
    return { ok: false, error: 'not_in_review', message: `Booking is ${booking.payment_status}, not awaiting review.` };
  }
  if (!booking.transaction_id) return { ok: false, error: 'no_transaction', message: 'No gateway transaction is recorded on this booking.' };

  const verify = await paymentServices.verifyTransaction(booking.transaction_id);
  if (!verify.ok) return { ok: false, error: 'verify_failed', message: `Authorize.Net lookup failed: ${verify.error || 'unknown error'}` };
  if (!verify.approved || verify.invoiceNumber !== booking.reference_number) {
    return { ok: false, error: 'transaction_not_approved', message: 'Authorize.Net does not show an approved charge for this booking.' };
  }
  const reversedStatuses = ['voided', 'refundSettledSuccessfully', 'refundPendingSettlement', 'declined', 'expired'];
  if (reversedStatuses.includes(String(verify.status || ''))) {
    return { ok: false, error: 'transaction_reversed', message: `This charge is ${verify.status} at Authorize.Net; nothing to confirm.` };
  }

  const flipped = await run(
    "UPDATE bookings SET payment_status = 'pending', payment_failure_reason = NULL WHERE id = ? AND payment_status = 'payment_review'",
    [bookingId]
  );
  if (Number(flipped?.changes || 0) !== 1) return { ok: false, error: 'state_changed', message: 'Booking changed state during confirmation; reload and retry.' };
  await logPaymentEvent(bookingId, 'review_confirm_attempt', 'admin', { by: adminEmail, transactionId: booking.transaction_id });

  const result = await markBookingPaid({
    bookingId,
    transactionId: booking.transaction_id,
    authCode: verify.authCode || booking.auth_code || null,
    source: 'admin_review_confirmed',
    verifiedTransaction: verify,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.rejection || result.error || 'seat_unavailable',
      message: `Could not confirm: ${result.rejection || result.error || 'seat unavailable'}. The booking stays in review.`,
      requiresReview: true,
    };
  }
  await logAudit('payment_review_confirmed', 'booking', bookingId, {
    referenceNumber: booking.reference_number,
    transactionId: booking.transaction_id,
    by: adminEmail,
  });
  return { ok: true, referenceNumber: booking.reference_number, reclaimedSeats: result.reclaimedSeats || 0 };
}

// Authorize.Net webhook (/api/webhooks/authorize-net) and the deferred
// re-verification live in routes/webhookRoutes.js. Registered here, after the
// payment services and state machine they depend on exist.
registerWebhookRoutes(app, {
  io,
  testablePaymentServices,
  markBookingPaid,
  markBookingFailed,
  markBookingRefunded,
  markBookingVoided,
});

// ============ ADMIN ============

// Admin sign-in + admin user management, then settings + PHD inventory admin.
registerAdminAuthRoutes(app, { adminLoginLimiter, logAudit });
registerAdminSettingsRoutes(app, { logAudit });

registerAdminReportRoutes(app);

registerAdminCustomerRoutes(app);

registerAdminSessionRoutes(app, { io, logAudit });

registerAdminBookingRoutes(app, {
  io,
  logAudit,
  getBookingItemRefundAmount,
  sendBookingConfirmationEmail,
});
registerAdminRefundApprovalRoutes(app, {
  io,
  logAudit,
  getBookingItemRefundAmount,
  markBookingItemRefunded,
  markBookingRefunded,
  markBookingVoided,
});

registerAdminPaymentReviewRoutes(app, { io, logAudit, logPaymentEvent, confirmReviewedPayment });

registerAnnouncementRoutes(app, { io, upload, saveUploadedImage });
registerWebsiteEventRoutes(app);

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
  startPaymentReconciliation(paymentReconciler, { logger });
  startGatewayAudit(gatewayAuditor, { logger });
  registerGracefulShutdown({ server, logger });
}

export {
  app,
  io,
  server,
  start,
  markBookingPaid,
  markBookingCancelled,
  markBookingRefunded,
  markBookingVoided,
  reconcileReversedBookingSeats,
  reconcilePendingPayments,
  runGatewayAudit,
  confirmReviewedPayment,
  keepCheckoutHoldAlive,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch(err => {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}
