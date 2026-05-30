import { v4 as uuid } from 'uuid';
import { all, batchRun, exec, get, run, scheduleSaveAfterBatch } from '../database.js';
import { logger } from '../logger.js';
import { formatLocalDate } from '../utils/format.js';

// Default fallback values if the auto_generate_config row is missing or unparseable.
const DEFAULT_LOOK_AHEAD_DAYS = 7;
const DEFAULT_ENABLED = true;
// Hard cap so a misconfigured value can't blow the DB up with hundreds of thousands of seat rows.
const MAX_LOOK_AHEAD_DAYS = 180;

// Day-of-week labels for logs / API responses. Index matches JS Date.getDay().
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

// Read the JSON settings row. Returns the default config if the row is missing
// or unparseable rather than blowing up the boot sequence.
export async function getAutoGenerateConfig() {
  let parsed = {};
  try {
    const row = await get("SELECT value FROM settings WHERE key = 'auto_generate_config'");
    if (row?.value) parsed = JSON.parse(row.value);
  } catch (e) {
    logger.warn('Failed to parse auto_generate_config, using defaults', { error: e?.message });
  }
  const lookAheadRaw = Number.isFinite(parsed.lookAheadDays) ? parsed.lookAheadDays : DEFAULT_LOOK_AHEAD_DAYS;
  const lookAheadDays = Math.max(1, Math.min(MAX_LOOK_AHEAD_DAYS, Math.floor(lookAheadRaw)));
  const enabled = parsed.enabled === false ? false : DEFAULT_ENABLED;
  const lastRunAt = parsed.lastRunAt || null;
  return { lookAheadDays, enabled, lastRunAt };
}

export async function updateAutoGenerateConfig(patch = {}) {
  const current = await getAutoGenerateConfig();
  const next = { ...current, ...patch };
  next.lookAheadDays = Math.max(1, Math.min(MAX_LOOK_AHEAD_DAYS, Math.floor(Number(next.lookAheadDays) || DEFAULT_LOOK_AHEAD_DAYS)));
  next.enabled = next.enabled === false ? false : true;
  const json = JSON.stringify(next);
  const updated = await run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'auto_generate_config'", [json]);
  if (!updated || updated.changes === 0) {
    await run("INSERT INTO settings (key, value) VALUES ('auto_generate_config', ?)", [json]);
  }
  return next;
}

export async function normalizeAutoGenerateConfigForGoLive() {
  const alreadyNormalized = await get("SELECT value FROM settings WHERE key = 'go_live_schedule_normalized_at'");
  if (alreadyNormalized?.value) return getAutoGenerateConfig();

  const current = await getAutoGenerateConfig();
  const next = current.lookAheadDays <= DEFAULT_LOOK_AHEAD_DAYS
    ? current
    : await updateAutoGenerateConfig({ lookAheadDays: DEFAULT_LOOK_AHEAD_DAYS });
  await run("INSERT INTO settings (key, value) VALUES ('go_live_schedule_normalized_at', ?)", [new Date().toISOString()]);
  return next;
}

async function markRunComplete() {
  await updateAutoGenerateConfig({ lastRunAt: new Date().toISOString() });
}

// Load active recurring schedule rows, grouped by day_of_week for O(1) lookup
// during generation.
async function loadActiveScheduleByDay() {
  const rows = await all(
    `SELECT id, day_of_week, time, cutoff_time, session_type
     FROM recurring_schedules
     WHERE is_active = 1`
  );
  const byDay = {};
  for (const row of rows) {
    if (!byDay[row.day_of_week]) byDay[row.day_of_week] = [];
    byDay[row.day_of_week].push(row);
  }
  return { rows, byDay };
}

export async function listRecurringSchedules() {
  return await all(
    `SELECT id, day_of_week, time, cutoff_time, session_type, is_active, created_at, updated_at
     FROM recurring_schedules
     ORDER BY day_of_week ASC, time ASC`
  );
}

// `ensureFutureSessions` is the heart of the auto-generator.
// For every day in the look-ahead window, it consults the recurring_schedules
// table and creates any missing sessions (plus the 75x6 seat grid for each).
// It is idempotent: a (date, hour) pair that already has a non-deleted session
// is left alone, so this can run on every server boot and every hourly tick
// without risk of duplicates.
export async function ensureFutureSessions() {
  const config = await getAutoGenerateConfig();
  if (!config.enabled) {
    logger.info('Auto session generation skipped (disabled in settings)');
    await markRunComplete();
    return { created: 0, skipped: true };
  }

  const { rows, byDay } = await loadActiveScheduleByDay();
  if (rows.length === 0) {
    logger.info('Auto session generation skipped (no active recurring schedules)');
    await markRunComplete();
    return { created: 0, skipped: true };
  }

  const now = new Date();
  const todayStr = formatLocalDate(now);
  const lookAhead = config.lookAheadDays;
  let created = 0;

  for (let offset = 0; offset < lookAhead; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(12, 0, 0, 0);
    const dateStr = formatLocalDate(candidate);

    if (dateStr < todayStr) continue;

    const schedulesForDay = byDay[candidate.getDay()];
    if (!schedulesForDay || schedulesForDay.length === 0) continue;

    for (const schedule of schedulesForDay) {
      const requestHour = (schedule.time || '18:30').split(':')[0];

      // Match the duplicate-prevention rule used by POST /api/admin/sessions:
      // one session per (date, hour). This lets admins still create a manual
      // session at a different hour without the generator clobbering it.
      const existing = await get(
        `SELECT id FROM sessions
         WHERE date = ? AND SUBSTR(time, 1, 2) = ? AND deleted_at IS NULL`,
        [dateStr, requestHour]
      );
      if (existing) continue;

      const isAvailable = 1;
      const id = uuid();
      const sessionType = schedule.session_type || 'regular_bingo';
      const isSpecialEvent = sessionType === 'special_bingo' || sessionType === 'event' ? 1 : 0;

      await run(
        `INSERT INTO sessions
           (id, date, time, cutoff_time, is_available, is_special_event, session_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, dateStr, schedule.time, schedule.cutoff_time || '12:00', isAvailable, isSpecialEvent, sessionType]
      );

      for (let tableNum = 1; tableNum <= 75; tableNum++) {
        for (let chair = 1; chair <= 6; chair++) {
          await batchRun(
            'INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
            [uuid(), id, tableNum, chair, 'vacant']
          );
        }
      }
      await scheduleSaveAfterBatch();

      logger.info('Auto-created session', {
        date: dateStr,
        time: schedule.time,
        session_type: sessionType,
        seats: 450
      });
      created++;
    }
  }

  if (created > 0) {
    logger.info('Auto-session generation complete', { created, lookAheadDays: lookAhead });
  }
  await markRunComplete();
  return { created, lookAheadDays: lookAhead };
}

export async function pruneFutureSessionsBeyondLookahead() {
  const config = await getAutoGenerateConfig();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() + config.lookAheadDays - 1);
  cutoff.setHours(12, 0, 0, 0);
  const cutoffDateStr = formatLocalDate(cutoff);
  const prunedAt = new Date().toISOString();

  const sessions = await all(
    `SELECT id, date, time
     FROM sessions s
     WHERE s.date > ?
       AND s.is_special_event = 0
       AND COALESCE(s.session_type, 'regular_bingo') = 'regular_bingo'
       AND s.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM bookings b WHERE b.session_id = s.id
       )
     ORDER BY s.date ASC, s.time ASC`,
    [cutoffDateStr]
  );

  for (const session of sessions) {
    await run('UPDATE sessions SET deleted_at = ? WHERE id = ?', [prunedAt, session.id]);
  }

  if (sessions.length > 0) {
    logger.info('Pruned future generated sessions beyond look-ahead window', {
      count: sessions.length,
      cutoffDate: cutoffDateStr,
      lookAheadDays: config.lookAheadDays,
    });
    await scheduleSaveAfterBatch();
  }

  return {
    ok: true,
    pruned: sessions.length,
    cutoffDate: cutoffDateStr,
    lookAheadDays: config.lookAheadDays,
    sessions,
  };
}

export async function syncGeneratedSessionsForRecurringSchedule({ dayOfWeek, time, sessionType, isActive }) {
  const targetAvailable = isActive ? 1 : 0;
  const todayStr = formatLocalDate(new Date());
  const day = String(Number(dayOfWeek));
  const hour = String(time || '').slice(0, 2);
  const type = sessionType || 'regular_bingo';

  if (!/^[0-6]$/.test(day) || !/^\d{2}$/.test(hour)) {
    return { changed: 0 };
  }

  const result = await run(
    `UPDATE sessions
        SET is_available = ?
      WHERE date >= ?
        AND strftime('%w', date) = ?
        AND SUBSTR(time, 1, 2) = ?
        AND is_available != ?
        AND is_special_event = 0
        AND COALESCE(session_type, 'regular_bingo') = ?
        AND deleted_at IS NULL`,
    [targetAvailable, todayStr, day, hour, targetAvailable, type]
  );

  if (result.changes > 0) {
    logger.info('Synced generated sessions with recurring schedule', {
      dayOfWeek: Number(day),
      hour,
      session_type: type,
      is_available: targetAvailable,
      changed: result.changes,
    });
  }

  return { changed: result.changes || 0 };
}

export async function closeGeneratedSessionsWithoutActiveSchedule() {
  const todayStr = formatLocalDate(new Date());
  const result = await run(
    `UPDATE sessions
        SET is_available = 0
      WHERE date >= ?
        AND is_available = 1
        AND is_special_event = 0
        AND COALESCE(session_type, 'regular_bingo') = 'regular_bingo'
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM recurring_schedules rs
          WHERE rs.is_active = 1
            AND rs.day_of_week = CAST(strftime('%w', sessions.date) AS INTEGER)
            AND SUBSTR(rs.time, 1, 2) = SUBSTR(sessions.time, 1, 2)
            AND COALESCE(rs.session_type, 'regular_bingo') = COALESCE(sessions.session_type, 'regular_bingo')
        )`,
    [todayStr]
  );

  if (result.changes > 0) {
    logger.info('Closed generated sessions without an active recurring schedule', { changed: result.changes });
  }

  return { changed: result.changes || 0 };
}

// Legacy hook kept for backward compatibility with index.js. Previously this
// flipped `is_available = 1` on Mon-Sun for the current week. That behavior can
// undo an admin's intentional session disable, so it is now a no-op. Future
// sessions are created as available by ensureFutureSessions().
export async function openWeeklySessions() {
  return { changed: 0, skipped: true };
}

export async function cleanupOldData() {
  const thirtyDaysAgo = formatLocalDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const ninetyDaysAgo = formatLocalDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  const oldSessions = await all(`
    SELECT id FROM sessions
    WHERE date < ?
      AND is_special_event = 0
      AND deleted_at IS NOT NULL
  `, [thirtyDaysAgo]);

  if (oldSessions.length > 0) {
    const sessionIds = oldSessions.map(s => s.id);
    const placeholders = sessionIds.map(() => '?').join(',');

    await run(`DELETE FROM seats WHERE session_id IN (${placeholders})`, sessionIds);
    await run(`DELETE FROM sessions WHERE id IN (${placeholders})`, sessionIds);

    logger.info('Cleaned up old sessions', { count: oldSessions.length });
  }

  const auditDeleted = await run('DELETE FROM audit_log WHERE created_at < ?', [ninetyDaysAgo]);
  if (auditDeleted.changes > 0) {
    logger.info('Pruned audit log', { entries_deleted: auditDeleted.changes });
  }

  await exec('VACUUM');
  logger.info('Database vacuumed');
}

// Used by the admin "Auto Schedule" page to show what the generator will do
// and what it most recently did.
export async function getScheduleSummary() {
  const config = await getAutoGenerateConfig();
  const schedules = await listRecurringSchedules();
  const now = new Date();
  const todayStr = formatLocalDate(now);

  const activeDays = schedules.filter(s => s.is_active).map(s => s.day_of_week);
  const activeDayLabels = [...new Set(activeDays)]
    .sort((a, b) => a - b)
    .map(d => DAY_SHORT_LABELS[d]);

  const upcomingAutoSessions = (await all(
    `SELECT COUNT(*) as count FROM sessions
     WHERE date >= ? AND is_special_event = 0 AND deleted_at IS NULL`,
    [todayStr]
  ))[0]?.count || 0;

  const lookAheadDate = new Date(now);
  lookAheadDate.setDate(now.getDate() + config.lookAheadDays - 1);
  const lookAheadDateStr = formatLocalDate(lookAheadDate);

  const upcomingInWindow = await all(
    `SELECT date, time, cutoff_time, session_type, is_available
     FROM sessions
     WHERE date >= ? AND date <= ?
       AND is_special_event = 0
       AND deleted_at IS NULL
     ORDER BY date ASC, time ASC`,
    [todayStr, lookAheadDateStr]
  );

  const beyondWindow = (await all(
    `SELECT COUNT(*) as count
     FROM sessions s
     WHERE s.date > ?
       AND s.is_special_event = 0
       AND COALESCE(s.session_type, 'regular_bingo') = 'regular_bingo'
       AND s.deleted_at IS NULL`,
    [lookAheadDateStr]
  ))[0]?.count || 0;

  const prunableBeyondWindow = (await all(
    `SELECT COUNT(*) as count
     FROM sessions s
     WHERE s.date > ?
       AND s.is_special_event = 0
       AND COALESCE(s.session_type, 'regular_bingo') = 'regular_bingo'
       AND s.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM bookings b WHERE b.session_id = s.id
       )`,
    [lookAheadDateStr]
  ))[0]?.count || 0;

  return {
    config,
    schedules,
    activeDayLabels,
    upcomingAutoSessions,
    upcomingInWindow,
    beyondWindow,
    prunableBeyondWindow,
    lookAheadDateStr,
    todayStr,
    summaryText: schedules.length === 0
      ? 'No recurring schedules configured.'
      : `${activeDayLabels.join(', ') || 'No days'} — next ${config.lookAheadDays} days`,
  };
}
