import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { get, run, saveDb } from './database.js';
import { releaseExpiredHolds } from './services/holds.js';
import { archivePastSessions } from './services/sessionArchive.js';
import { ensureGoLiveSalesReportCutoff } from './services/salesReporting.js';
import {
  cleanupOldData,
  ensureFutureSessions,
  normalizeAutoGenerateConfigForGoLive,
  openWeeklySessions,
  pruneFutureSessionsBeyondLookahead,
} from './services/scheduler.js';

export function migrateSeatLayout() {
  // Legacy startup hook kept for compatibility. Current venue seat layout
  // migrations run in migrate.js so they happen before maintenance jobs start.
}

export async function seedInitialAdminFromEnv(logger) {
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

  const existing = await get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?)', [email]);
  if (existing) {
    if (shouldBeSuper) {
      await run("UPDATE admin_users SET is_super_user = 1, updated_at = datetime('now') WHERE id = ?", [existing.id]);
    }
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  await run(
    'INSERT INTO admin_users (id, email, password_hash, display_name, is_super_user) VALUES (?, ?, ?, ?, ?)',
    [uuid(), email, hash, displayName, shouldBeSuper ? 1 : 0]
  );
  logger.info('Seeded initial admin user from env', { email, isSuperUser: shouldBeSuper });
}

// Top-level setInterval callbacks are wrapped in async IIFEs so unhandled
// promise rejections surface in the logs rather than getting swallowed.
function runAsyncTask(label, fn, logger) {
  Promise.resolve()
    .then(() => fn())
    .catch((err) => {
      if (logger) logger.error(`${label} failed`, { error: err?.message });
      else console.error(`[startup] ${label} failed:`, err);
    });
}

export async function startMaintenanceTasks(io, { reconcileReversedBookingSeats }, logger = null) {
  await cleanupOldData();
  setInterval(() => runAsyncTask('cleanupOldData', cleanupOldData, logger), 24 * 60 * 60 * 1000);

  await openWeeklySessions();
  await ensureGoLiveSalesReportCutoff();
  await normalizeAutoGenerateConfigForGoLive();
  await ensureFutureSessions();
  await pruneFutureSessionsBeyondLookahead();
  await archivePastSessions();

  setInterval(() => {
    runAsyncTask('openWeeklySessions', openWeeklySessions, logger);
    runAsyncTask('ensureFutureSessions', ensureFutureSessions, logger);
    runAsyncTask('pruneFutureSessionsBeyondLookahead', pruneFutureSessionsBeyondLookahead, logger);
    runAsyncTask('archivePastSessions', archivePastSessions, logger);
  }, 60 * 60 * 1000);

  // Seat hold expirer — runs every 30 seconds. Critical for the booking UX:
  // expired holds must be released so other customers can pick up the seats.
  setInterval(() => runAsyncTask('releaseExpiredHolds', () => releaseExpiredHolds(io), logger), 30000);
  await releaseExpiredHolds(io);

  // reconcileReversedBookingSeats may or may not be async depending on
  // index.js implementation; awaiting a sync function is harmless.
  await reconcileReversedBookingSeats();
}

export function registerGracefulShutdown({ server, logger }) {
  const gracefulShutdown = async (signal) => {
    logger.info('Received shutdown signal', { signal });
    server.close(async () => {
      logger.info('Server closed, flushing database');
      try {
        await saveDb();
      } catch (err) {
        logger.error('Database flush failed during shutdown', { error: err?.message });
      }
      logger.info('Database flushed, exiting');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
