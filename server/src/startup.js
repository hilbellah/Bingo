import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { all, get, run, saveDb } from './database.js';
import { releaseExpiredHolds } from './services/holds.js';
import { archivePastSessions } from './services/sessionArchive.js';
import { cleanupOldData, ensureFutureSessions, openWeeklySessions } from './services/scheduler.js';

export function migrateSeatLayout() {
  const sessions = all('SELECT id FROM sessions');
  for (const session of sessions) {
    const has41 = get('SELECT id FROM seats WHERE session_id = ? AND table_number = 41', [session.id]);
    if (!has41) {
      for (let chair = 1; chair <= 6; chair++) {
        run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
          [uuid(), session.id, 41, chair, 'vacant']);
      }
    }
    const has74 = get('SELECT id FROM seats WHERE session_id = ? AND table_number = 74', [session.id]);
    if (has74) {
      run('DELETE FROM seats WHERE session_id = ? AND table_number IN (74, 75) AND status = ?', [session.id, 'vacant']);
    }
  }
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
  ensureFutureSessions();
  archivePastSessions();
  setInterval(() => {
    openWeeklySessions();
    ensureFutureSessions();
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
