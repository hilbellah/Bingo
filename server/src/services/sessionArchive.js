import { v4 as uuid } from 'uuid';
import { all, run, saveDb } from '../database.js';
import { logger } from '../logger.js';
import { formatLocalDate } from '../utils/format.js';
import { sessionTypeSql } from './sessionPackages.js';

async function logArchiveAudit(session) {
  await run(
    'INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      uuid(),
      'session_auto_archived',
      'session',
      session.id,
      JSON.stringify({
        date: session.date,
        time: session.time,
        event_title: session.event_title,
        session_type: session.session_type,
        reason: 'past_session_date',
      }),
      new Date().toISOString(),
    ]
  );
}

export async function archivePastSessions() {
  const today = formatLocalDate(new Date());
  const pastSessions = await all(`
    SELECT s.id, s.date, s.time, s.event_title, ${sessionTypeSql('s')} as session_type
    FROM sessions s
    WHERE s.deleted_at IS NULL
      AND s.date < ?
  `, [today]);

  if (pastSessions.length === 0) return { archived: 0 };

  const archivedAt = new Date().toISOString();
  await run('UPDATE sessions SET deleted_at = ? WHERE deleted_at IS NULL AND date < ?', [archivedAt, today]);

  for (const session of pastSessions) {
    await logArchiveAudit(session);
  }

  await saveDb();
  logger.info('Auto-archived past sessions', { count: pastSessions.length });
  return { archived: pastSessions.length };
}
