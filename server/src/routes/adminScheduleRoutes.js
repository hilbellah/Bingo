import { v4 as uuid } from 'uuid';
import { get, run, saveDb } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  DAY_LABELS,
  ensureFutureSessions,
  getAutoGenerateConfig,
  getScheduleSummary,
  listRecurringSchedules,
  openWeeklySessions,
  pruneFutureSessionsBeyondLookahead,
  updateAutoGenerateConfig,
} from '../services/scheduler.js';

const VALID_SESSION_TYPES = new Set(['regular_bingo', 'special_bingo', 'event']);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeRecurringPayload(payload) {
  const day = Number(payload.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return { error: 'day_of_week must be an integer 0-6 (0=Sunday)' };
  }
  const time = String(payload.time || '').trim();
  if (!TIME_REGEX.test(time)) return { error: 'time must be HH:MM (24-hour)' };
  const cutoff = String(payload.cutoff_time || '12:00').trim();
  if (!TIME_REGEX.test(cutoff)) return { error: 'cutoff_time must be HH:MM (24-hour)' };
  const sessionType = String(payload.session_type || 'regular_bingo');
  if (!VALID_SESSION_TYPES.has(sessionType)) {
    return { error: `session_type must be one of: ${[...VALID_SESSION_TYPES].join(', ')}` };
  }
  const isActive = payload.is_active === false || payload.is_active === 0 ? 0 : 1;
  return { day, time, cutoff, sessionType, isActive };
}

export function registerAdminScheduleRoutes(app, { logAudit }) {
  app.get('/api/admin/schedule', adminAuth, async (req, res) => {
    try {
      res.json(await getScheduleSummary());
    } catch (err) {
      console.error('GET /api/admin/schedule failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/schedule/generate', adminAuth, async (req, res) => {
    try {
      await openWeeklySessions();
      const result = await ensureFutureSessions();
      res.json({
        success: true,
        message: result.skipped
          ? 'Auto-generation is currently disabled or has no active days configured. No sessions were created.'
          : `Generated ${result.created} new session(s) over the next ${result.lookAheadDays} day(s).`,
        ...result
      });
    } catch (err) {
      console.error('POST /api/admin/schedule/generate failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/schedule/prune', adminAuth, async (req, res) => {
    try {
      const result = await pruneFutureSessionsBeyondLookahead();
      await logAudit('future_sessions_pruned', 'session', 'auto_schedule', {
        pruned: result.pruned,
        cutoffDate: result.cutoffDate,
        lookAheadDays: result.lookAheadDays,
        admin: req.adminUser?.email || null,
      });
      await saveDb();
      res.json({
        success: true,
        message: `Pruned ${result.pruned} future regular bingo session(s) beyond ${result.cutoffDate}. Sessions with bookings were kept.`,
        ...result,
      });
    } catch (err) {
      console.error('POST /api/admin/schedule/prune failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/recurring-schedules', adminAuth, async (req, res) => {
    try {
      res.json({
        schedules: await listRecurringSchedules(),
        config: await getAutoGenerateConfig(),
        dayLabels: DAY_LABELS,
      });
    } catch (err) {
      console.error('GET /api/admin/recurring-schedules failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/recurring-schedules', adminAuth, async (req, res) => {
    try {
      const norm = normalizeRecurringPayload(req.body || {});
      if (norm.error) return res.status(400).json({ error: norm.error });

      const id = uuid();
      await run(
        `INSERT INTO recurring_schedules
           (id, day_of_week, time, cutoff_time, session_type, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, norm.day, norm.time, norm.cutoff, norm.sessionType, norm.isActive]
      );
      await logAudit('recurring_schedule_created', 'recurring_schedule', id, {
        day_of_week: norm.day, time: norm.time, cutoff_time: norm.cutoff, session_type: norm.sessionType
      });
      await saveDb();
      res.json({ id, day_of_week: norm.day, time: norm.time, cutoff_time: norm.cutoff, session_type: norm.sessionType, is_active: norm.isActive });
    } catch (err) {
      console.error('POST /api/admin/recurring-schedules failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/admin/recurring-schedules/config', adminAuth, async (req, res) => {
    try {
      const patch = {};
      if (req.body.lookAheadDays !== undefined) patch.lookAheadDays = Number(req.body.lookAheadDays);
      if (req.body.enabled !== undefined) patch.enabled = !!req.body.enabled;
      const next = await updateAutoGenerateConfig(patch);
      await logAudit('auto_generate_config_updated', 'settings', 'auto_generate_config', next);
      await saveDb();
      res.json(next);
    } catch (err) {
      console.error('PATCH /api/admin/recurring-schedules/config failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/admin/recurring-schedules/:id', adminAuth, async (req, res) => {
    try {
      const existing = await get('SELECT * FROM recurring_schedules WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Schedule not found' });

      const payload = {
        day_of_week: req.body.day_of_week !== undefined ? req.body.day_of_week : existing.day_of_week,
        time: req.body.time !== undefined ? req.body.time : existing.time,
        cutoff_time: req.body.cutoff_time !== undefined ? req.body.cutoff_time : existing.cutoff_time,
        session_type: req.body.session_type !== undefined ? req.body.session_type : existing.session_type,
        is_active: req.body.is_active !== undefined ? req.body.is_active : existing.is_active,
      };
      const norm = normalizeRecurringPayload(payload);
      if (norm.error) return res.status(400).json({ error: norm.error });

      await run(
        `UPDATE recurring_schedules
            SET day_of_week = ?, time = ?, cutoff_time = ?, session_type = ?, is_active = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
        [norm.day, norm.time, norm.cutoff, norm.sessionType, norm.isActive, req.params.id]
      );
      await logAudit('recurring_schedule_updated', 'recurring_schedule', req.params.id, payload);
      await saveDb();
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /api/admin/recurring-schedules/:id failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/admin/recurring-schedules/:id', adminAuth, async (req, res) => {
    try {
      const existing = await get('SELECT * FROM recurring_schedules WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Schedule not found' });
      await run('DELETE FROM recurring_schedules WHERE id = ?', [req.params.id]);
      await logAudit('recurring_schedule_deleted', 'recurring_schedule', req.params.id, {
        day_of_week: existing.day_of_week, time: existing.time
      });
      await saveDb();
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/admin/recurring-schedules/:id failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/recurring-schedules/summary', adminAuth, async (req, res) => {
    try {
      res.json(await getScheduleSummary());
    } catch (err) {
      console.error('GET /api/admin/recurring-schedules/summary failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

}
