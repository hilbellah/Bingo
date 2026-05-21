import bcrypt from 'bcryptjs';
import { get, run, saveDb } from './database.js';
import { releaseExpiredHolds } from './services/holds.js';
import { archivePastSessions } from './services/sessionArchive.js';
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

export function seedInitialAdminFromEnv(logger) {
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
      run("UPDATE admin_users SET is_super_user = 1, updated_at = datetime('now') WHERE id = ?", [existing.id]);
    }
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  run('INSERT INTO admin_users (id, email, password_hash, display_name, is_super_user) VALUES (?, ?, ?, ?, ?)',
    [uuid(), email, hash, displayName, shouldBeSuper ? 1 : 0]);
  logger.info('Seeded initial admin user from env', { email, isSuperUser: shouldBeSuper });
}

export function startMaintenanceTasks(io, { reconcileReversedBookingSeats }) {
  cleanupOldData();
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

  openWeeklySessions();
  normalizeAutoGenerateConfigForGoLive();
  ensureFutureSessions();
  pruneFutureSessionsBeyondLookahead();
  archivePastSessions();
  setInterval(() => {
    openWeeklySessions();
    ensureFutureSessions();
    pruneFutureSessionsBeyondLookahead();
    archivePastSessions();
  }, 60 * 60 * 1000);

  setInterval(() => releaseExpiredHolds(io), 30000);
  releaseExpiredHolds(io);
  reconcileReversedBookingSeats();
}

export function registerGracefulShutdown({ server, logger }) {
  const gracefulShutdown = async (signal) => {
    logger.info('Received shutdown signal', { signal });
    server.close(async () => {
      logger.info('Server closed, flushing database');
      saveDb();
      logger.info('Database flushed, exiting');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
