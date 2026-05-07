import { v4 as uuid } from 'uuid';
import { all, batchRun, exec, get, run, scheduleSaveAfterBatch } from '../database.js';
import { logger } from '../logger.js';
import { formatLocalDate } from '../utils/format.js';

const WEEKS_TO_GENERATE = 3;

export function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function cleanupOldData() {
  const thirtyDaysAgo = formatLocalDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const ninetyDaysAgo = formatLocalDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  const oldSessions = all(`
    SELECT id FROM sessions
    WHERE date < ?
      AND is_special_event = 0
      AND deleted_at IS NOT NULL
  `, [thirtyDaysAgo]);

  if (oldSessions.length > 0) {
    const sessionIds = oldSessions.map(s => s.id);
    const placeholders = sessionIds.map(() => '?').join(',');

    exec('BEGIN TRANSACTION');
    run(`DELETE FROM seats WHERE session_id IN (${placeholders})`, sessionIds);
    run(`DELETE FROM sessions WHERE id IN (${placeholders})`, sessionIds);
    exec('COMMIT');

    logger.info('Cleaned up old sessions', { count: oldSessions.length });
  }

  const auditDeleted = run('DELETE FROM audit_log WHERE created_at < ?', [ninetyDaysAgo]);
  if (auditDeleted.changes > 0) {
    logger.info('Pruned audit log', { entries_deleted: auditDeleted.changes });
  }

  exec('VACUUM');
  logger.info('Database vacuumed');
}

export function ensureFutureSessions() {
  const now = new Date();
  const todayStr = formatLocalDate(now);
  const thisMonday = getWeekMonday(now);

  let created = 0;
  for (let weekOffset = 0; weekOffset < WEEKS_TO_GENERATE; weekOffset++) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() + (weekOffset * 7));

    for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
      const sessionDate = new Date(weekStart);
      sessionDate.setDate(weekStart.getDate() + dayOffset);
      const dateStr = formatLocalDate(sessionDate);

      if (dateStr < todayStr) continue;

      const existing = get('SELECT id FROM sessions WHERE date = ? AND deleted_at IS NULL', [dateStr]);
      if (existing) continue;

      const isAvailable = weekOffset === 0 ? 1 : 0;
      const id = uuid();
      run(
        'INSERT INTO sessions (id, date, time, cutoff_time, is_available) VALUES (?, ?, ?, ?, ?)',
        [id, dateStr, '18:30', '12:00', isAvailable]
      );

      for (let tableNum = 1; tableNum <= 73; tableNum++) {
        for (let chair = 1; chair <= 6; chair++) {
          batchRun(
            'INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
            [uuid(), id, tableNum, chair, 'vacant']
          );
        }
      }
      scheduleSaveAfterBatch();

      logger.info('Auto-created session', { date: dateStr, available: isAvailable, seats: 438 });
      created++;
    }
  }

  if (created > 0) {
    logger.info('Auto-session generation complete', { created });
  }
}

export function openWeeklySessions() {
  const now = new Date();
  const thisMonday = getWeekMonday(now);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);

  const mondayStr = formatLocalDate(thisMonday);
  const sundayStr = formatLocalDate(thisSunday);

  const { changes } = run(
    `UPDATE sessions SET is_available = 1
     WHERE date >= ? AND date <= ?
     AND is_available = 0
     AND is_special_event = 0
     AND deleted_at IS NULL`,
    [mondayStr, sundayStr]
  );

  if (changes > 0) {
    logger.info('Opened weekly sessions', { week: mondayStr, count: changes });
  }
}

export function getScheduleSummary() {
  const now = new Date();
  const thisMonday = getWeekMonday(now);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);

  const mondayStr = formatLocalDate(thisMonday);
  const sundayStr = formatLocalDate(thisSunday);

  const thisWeekSessions = all(
    `SELECT date, time, is_available, is_special_event FROM sessions
     WHERE date >= ? AND date <= ? AND deleted_at IS NULL ORDER BY date ASC`,
    [mondayStr, sundayStr]
  );

  const totalAuto = all(
    `SELECT COUNT(*) as count FROM sessions WHERE date >= ? AND is_special_event = 0 AND deleted_at IS NULL`,
    [formatLocalDate(now)]
  );

  return {
    schedule: 'Tue-Sun weekly, opens Monday morning',
    weeksGenerated: WEEKS_TO_GENERATE,
    currentWeek: { monday: mondayStr, sunday: sundayStr, sessions: thisWeekSessions },
    upcomingAutoSessions: totalAuto[0]?.count || 0
  };
}
