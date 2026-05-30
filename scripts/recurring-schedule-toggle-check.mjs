import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-schedule-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';

const { migrate } = await import(pathToFileURL(path.join(repoRoot, 'server/src/migrate.js')));
const { all, get, getDb, run } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
const {
  closeGeneratedSessionsWithoutActiveSchedule,
  ensureFutureSessions,
  openWeeklySessions,
  syncGeneratedSessionsForRecurringSchedule,
} = await import(pathToFileURL(path.join(repoRoot, 'server/src/services/scheduler.js')));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function futureSundaySessions() {
  return all(`
    SELECT id, date, time, is_available
    FROM sessions
    WHERE date >= date('now')
      AND strftime('%w', date) = '0'
      AND is_special_event = 0
      AND COALESCE(session_type, 'regular_bingo') = 'regular_bingo'
      AND deleted_at IS NULL
    ORDER BY date, time
  `);
}

try {
  await migrate();
  await getDb();
  await ensureFutureSessions();

  const sundaySchedule = await get(`
    SELECT *
    FROM recurring_schedules
    WHERE day_of_week = 0
      AND session_type = 'regular_bingo'
    ORDER BY time
    LIMIT 1
  `);
  assert(sundaySchedule, 'expected a Sunday recurring schedule');

  const initialSundaySessions = await futureSundaySessions();
  assert(initialSundaySessions.length > 0, 'expected generated Sunday sessions');
  assert(initialSundaySessions.every(session => Number(session.is_available) === 1), 'expected Sunday sessions to start active');

  await run('UPDATE recurring_schedules SET is_active = 0 WHERE id = ?', [sundaySchedule.id]);
  await syncGeneratedSessionsForRecurringSchedule({
    dayOfWeek: sundaySchedule.day_of_week,
    time: sundaySchedule.time,
    sessionType: sundaySchedule.session_type,
    isActive: 0,
  });
  await ensureFutureSessions();

  const disabledSundaySessions = await futureSundaySessions();
  assert(disabledSundaySessions.length === initialSundaySessions.length, 'disabling Sunday should not delete generated sessions');
  assert(disabledSundaySessions.every(session => Number(session.is_available) === 0), 'disabling Sunday should close generated Sunday sessions');

  await run('UPDATE recurring_schedules SET is_active = 1 WHERE id = ?', [sundaySchedule.id]);
  await syncGeneratedSessionsForRecurringSchedule({
    dayOfWeek: sundaySchedule.day_of_week,
    time: sundaySchedule.time,
    sessionType: sundaySchedule.session_type,
    isActive: 1,
  });

  const reenabledSundaySessions = await futureSundaySessions();
  assert(reenabledSundaySessions.every(session => Number(session.is_available) === 1), 're-enabling Sunday should reopen generated Sunday sessions');

  const manuallyDisabled = reenabledSundaySessions[0];
  await run('UPDATE sessions SET is_available = 0 WHERE id = ?', [manuallyDisabled.id]);
  await openWeeklySessions();
  await closeGeneratedSessionsWithoutActiveSchedule();

  const afterMaintenance = await get('SELECT is_available FROM sessions WHERE id = ?', [manuallyDisabled.id]);
  assert(Number(afterMaintenance.is_available) === 0, 'maintenance should not reopen a manually disabled session');

  console.log('Recurring schedule toggle check passed:', {
    sundaySchedule: sundaySchedule.id,
    generatedSundaySessions: initialSundaySessions.length,
    manuallyDisabledSession: manuallyDisabled.id,
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
