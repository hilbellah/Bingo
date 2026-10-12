// In-house error monitoring: records unexpected errors from customers' and
// staff browsers (POST /api/client-errors) and from the server's own error
// log, groups repeats, and emails super users a digest of anything new.
//
// It never changes how an error is handled - it only records it. Recording is
// fire-and-forget and swallows its own failures, so a broken monitor can never
// break a booking.
//
// Privacy: card-like numbers, email addresses and tokens are redacted before
// anything is stored or emailed; page addresses are stored without query
// strings (ticket links carry access tokens there).
import crypto from 'crypto';
import { get, run, all } from '../database.js';

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_PAGE = 300;
const MAX_UA = 300;
// Flood protection: the same error is written at most once per THROTTLE_MS,
// and at most GLOBAL_LIMIT errors are written per minute in total.
const THROTTLE_MS = 5000;
const GLOBAL_LIMIT = 60;

const recentByFingerprint = new Map();
let windowStart = 0;
let windowCount = 0;

export function isErrorMonitoringEnabled() {
  const flag = String(process.env.ERROR_MONITORING || '').toLowerCase();
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return process.env.NODE_ENV !== 'test';
}

export function redact(value) {
  return String(value ?? '')
    // card-like digit runs (13-19 digits, optional spaces/dashes)
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, '[number]')
    .replace(/[^\s@<>"'()]+@[^\s@<>"'()]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '$1 [token]')
    .replace(/\b(token|ticketAccessToken|password|secret|signature|key)=([^\s&"']+)/gi, '$1=[redacted]')
    .replace(/"(password|token|secret|signature|cardNumber|cardCode)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"');
}

const clip = (value, max) => {
  const text = redact(value).trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export function cleanPage(page) {
  const text = String(page || '').trim();
  if (!text) return '';
  let path = text;
  try { path = new URL(text, 'http://placeholder').pathname; } catch { path = text.split(/[?#]/)[0]; }
  return clip(path, MAX_PAGE);
}

// Errors that differ only by ids, numbers or quoted values group together.
function normalizeForFingerprint(message) {
  return String(message || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\bBNG-[A-Z0-9-]+/g, '<ref>')
    .replace(/\d+/g, '#')
    .replace(/'[^']*'|"[^"]*"/g, '<v>')
    .slice(0, 200);
}

function firstStackFrame(stack) {
  const line = String(stack || '').split('\n').map(l => l.trim()).find(l => l.startsWith('at '));
  return line ? line.replace(/:\d+:\d+\)?$/, '').replace(/\?[^)\s]*/, '') : '';
}

export function fingerprintFor({ source, message, stack }) {
  return crypto.createHash('sha1')
    .update(`${source}|${normalizeForFingerprint(message)}|${firstStackFrame(stack)}`)
    .digest('hex');
}

function allowWrite(fingerprint, now) {
  if (now - windowStart >= 60000) { windowStart = now; windowCount = 0; }
  if (windowCount >= GLOBAL_LIMIT) return false;
  const last = recentByFingerprint.get(fingerprint) || 0;
  if (now - last < THROTTLE_MS) return false;
  recentByFingerprint.set(fingerprint, now);
  if (recentByFingerprint.size > 500) recentByFingerprint.clear();
  windowCount += 1;
  return true;
}

export function resetErrorMonitorThrottleForTests() {
  recentByFingerprint.clear();
  windowStart = 0;
  windowCount = 0;
}

// Returns the stored row id, or null when skipped (disabled, empty, throttled
// or the database was unavailable). Never throws.
export async function recordError({ source, message, stack = '', page = '', userAgent = '' }) {
  try {
    if (!isErrorMonitoringEnabled()) return null;
    const cleanSource = source === 'server' ? 'server' : 'client';
    const cleanMessage = clip(message, MAX_MESSAGE);
    if (!cleanMessage) return null;
    const cleanStack = clip(stack, MAX_STACK);
    const fingerprint = fingerprintFor({ source: cleanSource, message: cleanMessage, stack: cleanStack });
    const now = Date.now();
    if (!allowWrite(fingerprint, now)) return null;
    const at = new Date(now).toISOString();

    const existing = await get('SELECT id FROM error_events WHERE fingerprint = ?', [fingerprint]);
    if (existing) {
      // A repeat; if it had been resolved, it is back - reopen and re-alert.
      await run(
        `UPDATE error_events
           SET occurrences = occurrences + 1, last_seen_at = ?,
               page = COALESCE(NULLIF(?, ''), page),
               notified_at = CASE WHEN resolved_at IS NOT NULL THEN NULL ELSE notified_at END,
               resolved_at = NULL, resolved_by = NULL
         WHERE id = ?`,
        [at, cleanPage(page), existing.id]
      );
      return existing.id;
    }
    const id = crypto.randomUUID();
    try {
      await run(
        `INSERT INTO error_events
           (id, fingerprint, source, message, stack, page, user_agent, occurrences, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, fingerprint, cleanSource, cleanMessage, cleanStack, cleanPage(page), clip(userAgent, MAX_UA), at, at]
      );
      return id;
    } catch {
      // Lost a race with an identical error: count it on the winner.
      await run('UPDATE error_events SET occurrences = occurrences + 1, last_seen_at = ? WHERE fingerprint = ?', [at, fingerprint]);
      return null;
    }
  } catch {
    return null;
  }
}

// Server side: every console.error is already an error path in this codebase
// (route catch blocks, logger.error). Mirror them into the monitor without
// changing what is printed. Installed once at server start.
let consoleCaptureInstalled = false;
let insideCapture = false;
export function installServerErrorCapture() {
  if (consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    if (insideCapture) return;
    insideCapture = true;
    try {
      const err = args.find(arg => arg instanceof Error);
      const text = args
        .map(arg => (arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : (() => { try { return JSON.stringify(arg); } catch { return String(arg); } })()))
        .join(' ');
      // logger.error prints a JSON line; use its message as the headline.
      let message = text;
      try { const parsed = JSON.parse(text); if (parsed && parsed.message) message = `${parsed.message}${parsed.error ? `: ${parsed.error}` : ''}`; } catch { /* plain text */ }
      recordError({ source: 'server', message, stack: err?.stack || '' }).catch(() => {});
    } finally {
      insideCapture = false;
    }
  };
}

export async function listErrors({ includeResolved = false, limit = 100 } = {}) {
  const where = includeResolved ? '' : 'WHERE resolved_at IS NULL';
  return all(
    `SELECT id, source, message, stack, page, user_agent AS "userAgent", occurrences,
            first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt",
            notified_at AS "notifiedAt", resolved_at AS "resolvedAt", resolved_by AS "resolvedBy"
       FROM error_events ${where}
      ORDER BY last_seen_at DESC
      LIMIT ${Math.max(1, Math.min(500, Number(limit) || 100))}`
  );
}

export async function resolveError(id, resolvedBy) {
  const result = await run(
    'UPDATE error_events SET resolved_at = ?, resolved_by = ? WHERE id = ? AND resolved_at IS NULL',
    [new Date().toISOString(), String(resolvedBy || ''), id]
  );
  return result.changes === 1;
}

export async function countOpenErrors() {
  const row = await get('SELECT COUNT(*) AS "n" FROM error_events WHERE resolved_at IS NULL');
  return Number(row?.n || 0);
}

// Email anything open that has not been in a digest yet. `send` is injectable
// for tests; it receives the groups and returns { ok }.
export async function sendErrorDigest({ send }) {
  const groups = await all(
    `SELECT id, source, message, page, occurrences, first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
       FROM error_events
      WHERE resolved_at IS NULL AND notified_at IS NULL
      ORDER BY last_seen_at DESC
      LIMIT 50`
  );
  if (groups.length === 0) return { sent: false, count: 0 };
  const result = await send({ groups });
  if (!result?.ok) return { sent: false, count: groups.length, error: result?.error || 'send_failed' };
  const at = new Date().toISOString();
  for (const group of groups) {
    await run('UPDATE error_events SET notified_at = ? WHERE id = ? AND notified_at IS NULL', [at, group.id]);
  }
  return { sent: true, count: groups.length };
}

export function startErrorDigest({ send, logger, intervalMs = 15 * 60 * 1000 }) {
  if (!isErrorMonitoringEnabled()) return null;
  const tick = () => sendErrorDigest({ send })
    .then(result => { if (result.sent) logger?.info('Error digest sent', { groups: result.count }); })
    .catch(err => logger?.warn('Error digest failed', { error: err?.message }));
  return setInterval(tick, intervalMs);
}
