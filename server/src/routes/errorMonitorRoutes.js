import rateLimit from 'express-rate-limit';
import { adminAuth } from '../middleware/adminAuth.js';
import { recordError, listErrors, resolveError } from '../services/errorMonitor.js';

// Browser error reports are public (the customer page has no login), so they
// are rate limited per IP and every field is cleaned in errorMonitor.js.
const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_CLIENT_ERRORS || 30),
  standardHeaders: true,
  legacyHeaders: false,
});

const text = value => (typeof value === 'string' ? value : '');

export function registerErrorMonitorRoutes(app, { logAudit }) {
  app.post('/api/client-errors', clientErrorLimiter, (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Respond at once; recording happens in the background and never fails the request.
    res.status(204).end();
    recordError({
      source: 'client',
      message: text(body.message),
      stack: text(body.stack),
      page: text(body.page),
      userAgent: text(req.get('user-agent')),
    }).catch(() => {});
  });

  app.get('/api/admin/errors', adminAuth, async (req, res) => {
    try {
      res.json(await listErrors({ includeResolved: req.query.status === 'all' }));
    } catch (err) {
      console.error('GET /api/admin/errors failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/errors/:id/resolve', adminAuth, async (req, res) => {
    try {
      const changed = await resolveError(req.params.id, req.adminUser?.email);
      if (!changed) return res.status(404).json({ error: 'Open error not found' });
      await logAudit('error_resolved', 'error_event', req.params.id, { by: req.adminUser?.email });
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/admin/errors/:id/resolve failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
