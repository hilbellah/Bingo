// Admin settings (receipt config, special bingo config, ...) and the PHD
// inventory admin endpoints.
//
// Moved verbatim out of server/src/index.js on 2026-09-05 (Phase 3, step 4).
// registerAdminSettingsRoutes() receives the index.js-scoped values the code used.

import { get, run } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  getNextPhdSessionId,
  getPhdInventoryForSession,
  getPhdUsageBySession,
  updateGlobalPhdConfig,
  updatePhdSessionStock
} from '../services/phdInventory.js';
import { normalizeSpecialBingoConfig } from '../services/sessionPackages.js';

export function registerAdminSettingsRoutes(app, { logAudit }) {
  // ============ SETTINGS ============

  const DEFAULT_RECEIPT_CONFIG = {
    businessName: 'SMEC BINGO',
    businessSubtitle: "Saint Mary's Entertainment Centre",
    receiptTitle: 'BOOKING RECEIPT',
    footerText: 'Thank you for your purchase!',
    showRefNumber: true,
    showTableChair: true,
    showPackagePrice: true,
    showAddons: true,
    showTimestamp: true,
    autoPrintEnabled: false,
    paperWidth: '80mm',
    partialCutBetweenReceipts: false,
    receiptCutPercent: 0,
  };

  function normalizeSettingValue(key, value) {
    if (key === 'special_bingo_config') {
      return normalizeSpecialBingoConfig(value);
    }

    if (key !== 'receipt_config' || !value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const rawCutPercent = Number(value.receiptCutPercent ?? (value.partialCutBetweenReceipts ? 70 : 0));
    const receiptCutPercent = Number.isFinite(rawCutPercent) && rawCutPercent > 0
      ? Math.min(99, Math.max(1, Math.round(rawCutPercent)))
      : 0;
    return {
      ...DEFAULT_RECEIPT_CONFIG,
      ...value,
      partialCutBetweenReceipts: receiptCutPercent > 0,
      receiptCutPercent,
    };
  }

  app.get('/api/admin/settings/:key', adminAuth, async (req, res) => {
    try {
      const row = await get('SELECT value FROM settings WHERE key = ?', [req.params.key]);
      if (!row) return res.json({ value: null });
      try {
        res.json({ value: normalizeSettingValue(req.params.key, JSON.parse(row.value)) });
      } catch {
        res.json({ value: row.value });
      }
    } catch (err) {
      console.error('GET /api/admin/settings/:key failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/admin/settings/:key', adminAuth, async (req, res) => {
    try {
      const { value } = req.body;
      const normalizedValue = normalizeSettingValue(req.params.key, value);
      const serialized = typeof normalizedValue === 'string' ? normalizedValue : JSON.stringify(normalizedValue);
      const existing = await get('SELECT key FROM settings WHERE key = ?', [req.params.key]);
      if (existing) {
        await run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?", [serialized, req.params.key]);
      } else {
        await run("INSERT INTO settings (key, value) VALUES (?, ?)", [serialized, req.params.key]);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('PUT /api/admin/settings/:key failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============ PHD INVENTORY (Admin) ============

  app.get('/api/admin/phd-inventory', adminAuth, async (req, res) => {
    try {
      const sessionId = String(req.query.sessionId || (await getNextPhdSessionId()) || '').trim();
      res.json({
        ...(await getPhdInventoryForSession(sessionId)),
        perSession: await getPhdUsageBySession()
      });
    } catch (err) {
      console.error('GET /api/admin/phd-inventory failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/admin/phd-inventory', adminAuth, async (req, res) => {
    try {
      const { totalStock, perPlayerLimit } = req.body;
      const config = await updateGlobalPhdConfig({ totalStock, perPlayerLimit });
      await logAudit('phd_inventory_updated', 'settings', 'phd_inventory', config);
      res.json({ ok: true, ...config });
    } catch (err) {
      console.error('PUT /api/admin/phd-inventory failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/admin/phd-inventory/sessions/:sessionId', adminAuth, async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      const session = await get('SELECT id FROM sessions WHERE id = ? AND deleted_at IS NULL', [sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      try {
        const config = await updatePhdSessionStock(sessionId, req.body?.totalStock);
        const inventory = await getPhdInventoryForSession(sessionId);
        await logAudit('phd_session_inventory_updated', 'session', sessionId, {
          sessionId,
          totalStock: inventory.totalStock,
          hasSessionStockOverride: inventory.hasSessionStockOverride,
        });
        res.json({ ok: true, config, inventory });
      } catch (err) {
        res.status(400).json({ error: err.message || 'Failed to update session PHD stock' });
      }
    } catch (err) {
      console.error('PUT /api/admin/phd-inventory/sessions/:sessionId failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
