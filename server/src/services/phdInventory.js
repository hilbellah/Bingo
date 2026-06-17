import { all, get, run } from '../database.js';
import { formatLocalDate } from '../utils/format.js';

const DEFAULT_PHD_CONFIG = { totalStock: 200, perPlayerLimit: 2, sessionStockOverrides: {} };

function normalizePhdConfig(rawConfig = {}) {
  const totalStock = Number(rawConfig.totalStock);
  const perPlayerLimit = Number(rawConfig.perPlayerLimit);
  const rawOverrides = rawConfig.sessionStockOverrides && typeof rawConfig.sessionStockOverrides === 'object'
    ? rawConfig.sessionStockOverrides
    : {};
  const sessionStockOverrides = {};

  for (const [sessionId, value] of Object.entries(rawOverrides)) {
    const stock = Number(value);
    if (sessionId && Number.isFinite(stock) && stock >= 0) {
      sessionStockOverrides[sessionId] = Math.floor(stock);
    }
  }

  return {
    totalStock: Number.isFinite(totalStock) && totalStock >= 0 ? Math.floor(totalStock) : DEFAULT_PHD_CONFIG.totalStock,
    perPlayerLimit: Number.isFinite(perPlayerLimit) && perPlayerLimit >= 1 ? Math.floor(perPlayerLimit) : DEFAULT_PHD_CONFIG.perPlayerLimit,
    sessionStockOverrides,
  };
}

export async function savePhdConfig(config) {
  const normalized = normalizePhdConfig(config);
  const existing = await get("SELECT key FROM settings WHERE key = 'phd_inventory'");
  if (existing) {
    await run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'phd_inventory'", [JSON.stringify(normalized)]);
  } else {
    await run("INSERT INTO settings (key, value) VALUES ('phd_inventory', ?)", [JSON.stringify(normalized)]);
  }
  return normalized;
}

export async function getPhdConfig() {
  const phdSettingsRow = await get("SELECT value FROM settings WHERE key = 'phd_inventory'");
  if (!phdSettingsRow) return { ...DEFAULT_PHD_CONFIG };

  try {
    return normalizePhdConfig(JSON.parse(phdSettingsRow.value));
  } catch {
    return { ...DEFAULT_PHD_CONFIG };
  }
}

export async function updateGlobalPhdConfig({ totalStock, perPlayerLimit }) {
  const existing = await getPhdConfig();
  return savePhdConfig({
    ...existing,
    totalStock: totalStock != null ? Number(totalStock) : existing.totalStock,
    perPlayerLimit: perPlayerLimit != null ? Number(perPlayerLimit) : existing.perPlayerLimit,
  });
}

export async function updatePhdSessionStock(sessionId, totalStock) {
  const cleanSessionId = String(sessionId || '').trim();
  if (!cleanSessionId) throw new Error('Session ID is required');

  const config = await getPhdConfig();
  const nextOverrides = { ...config.sessionStockOverrides };

  if (totalStock == null || totalStock === '') {
    delete nextOverrides[cleanSessionId];
  } else {
    const stock = Number(totalStock);
    if (!Number.isFinite(stock) || stock < 0) throw new Error('Stock must be 0 or higher');
    nextOverrides[cleanSessionId] = Math.floor(stock);
  }

  return savePhdConfig({ ...config, sessionStockOverrides: nextOverrides });
}

// Pure (non-async) reader — the caller must supply the config object. If config
// is omitted, we cannot fetch it synchronously, so callers that don't have one
// in scope should use getPhdInventoryForSession() instead, which awaits the
// config internally.
export function getPhdTotalStockForSession(sessionId, config) {
  if (!config) {
    throw new Error('getPhdTotalStockForSession requires a config object; call await getPhdConfig() first.');
  }
  const cleanSessionId = String(sessionId || '').trim();
  const override = cleanSessionId ? config.sessionStockOverrides?.[cleanSessionId] : undefined;
  return Number.isFinite(Number(override)) ? Number(override) : config.totalStock;
}

export async function getPhdUsedForSession(sessionId) {
  if (!sessionId) return 0;
  const usedRow = await get(`
    SELECT COUNT(DISTINCT bi.id) as total_used
    FROM booking_items bi
    JOIN bookings b ON b.id = bi.booking_id
    WHERE b.payment_status IN ('paid', 'partially_refunded')
      AND b.session_id = ?
      AND COALESCE(bi.refund_status, 'active') != 'refunded'
      AND (
        bi.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
        OR bi.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
        OR EXISTS (
          SELECT 1
          FROM booking_addons ba
          WHERE ba.booking_item_id = bi.id
            AND (
              ba.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
              OR ba.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
            )
        )
      )
  `, [sessionId]);
  return usedRow?.total_used || 0;
}

export async function getPhdInventoryForSession(sessionId) {
  const config = await getPhdConfig();
  const totalStock = getPhdTotalStockForSession(sessionId, config);
  const totalUsed = await getPhdUsedForSession(sessionId);
  return {
    sessionId: sessionId || null,
    totalStock,
    defaultStock: config.totalStock,
    hasSessionStockOverride: !!String(sessionId || '').trim() && Object.prototype.hasOwnProperty.call(config.sessionStockOverrides, String(sessionId).trim()),
    totalUsed,
    remaining: Math.max(0, totalStock - totalUsed),
    perPlayerLimit: config.perPlayerLimit,
  };
}

export async function getPhdUsageBySession() {
  const today = formatLocalDate(new Date());
  const config = await getPhdConfig();
  const rows = await all(`
    SELECT * FROM (
      SELECT s.id, s.date, s.time, s.event_title, s.is_special_event,
        (
          SELECT COUNT(DISTINCT bi.id)
          FROM booking_items bi
          JOIN bookings b ON b.id = bi.booking_id
          WHERE b.payment_status IN ('paid', 'partially_refunded')
            AND b.session_id = s.id
            AND COALESCE(bi.refund_status, 'active') != 'refunded'
            AND (
              bi.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
              OR bi.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
              OR EXISTS (
                SELECT 1
                FROM booking_addons ba
                WHERE ba.booking_item_id = bi.id
                  AND (
                    ba.package_id IN (SELECT id FROM packages WHERE is_phd = 1)
                    OR ba.package_id IN (SELECT id FROM session_packages WHERE is_phd = 1)
                  )
              )
            )
        ) as phd_count
      FROM sessions s
      WHERE s.deleted_at IS NULL
    )
    WHERE date >= ? OR phd_count > 0
    ORDER BY date ASC, time ASC
    LIMIT 120
  `, [today]);

  return rows.map(row => {
    const totalStock = getPhdTotalStockForSession(row.id, config);
    const hasSessionStockOverride = Object.prototype.hasOwnProperty.call(config.sessionStockOverrides, row.id);
    return {
      ...row,
      totalStock,
      defaultStock: config.totalStock,
      hasSessionStockOverride,
      remaining: Math.max(0, totalStock - Number(row.phd_count || 0)),
    };
  });
}

export async function getNextPhdSessionId() {
  const today = formatLocalDate(new Date());
  const row = await get(
    `SELECT id FROM sessions
     WHERE date >= ? AND is_available = 1 AND deleted_at IS NULL
     ORDER BY date ASC, time ASC
     LIMIT 1`,
    [today]
  );
  return row?.id || null;
}

export async function validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg, sessionType = 'regular_bingo', requiredPkgs = [requiredPkg].filter(Boolean)) {
  const phdConfig = await getPhdConfig();

  const phdPkgIds = new Set();
  if (useSessionPkgs) {
    sessionPkgs.filter(pkg => pkg.is_phd).forEach(pkg => phdPkgIds.add(pkg.id));
  } else {
    const dbPhdPkgs = await all('SELECT id FROM packages WHERE is_phd = 1 AND is_active = 1');
    dbPhdPkgs.forEach(pkg => phdPkgIds.add(pkg.id));
  }

  if (phdPkgIds.size === 0) return { ok: true, phdPkgIds, phdConfig };
  const includedPhdPerPlayer = sessionType === 'regular_bingo' && requiredPkgs.some(pkg => pkg?.is_phd) ? 1 : 0;

  for (const attendee of attendees) {
    let playerPhdPackageQty = 0;
    for (const addon of attendee.addons || []) {
      if (phdPkgIds.has(addon.packageId)) playerPhdPackageQty += addon.quantity;
    }
    const perPlayerLimit = sessionType === 'special_bingo' ? 1 : phdConfig.perPlayerLimit;
    if (sessionType === 'regular_bingo' && playerPhdPackageQty > perPlayerLimit) {
      return { ok: false, error: `Each player can only add up to ${phdConfig.perPlayerLimit} PHD packages.` };
    }
    if (sessionType !== 'regular_bingo' && includedPhdPerPlayer + playerPhdPackageQty > perPlayerLimit) {
      return { ok: false, error: `Each player can only add up to ${perPlayerLimit} handheld device${perPlayerLimit === 1 ? '' : 's'}.` };
    }
  }

  let totalPhdInBooking = includedPhdPerPlayer * attendees.length;
  for (const attendee of attendees) {
    const optionalPhdQty = (attendee.addons || []).reduce((sum, addon) => phdPkgIds.has(addon.packageId) ? sum + addon.quantity : sum, 0);
    if (sessionType === 'regular_bingo') {
      totalPhdInBooking += optionalPhdQty > 0 ? 1 : 0;
    } else {
      totalPhdInBooking += optionalPhdQty;
    }
  }

  if (totalPhdInBooking > 0) {
    const totalUsed = await getPhdUsedForSession(sessionId);
    const totalStock = getPhdTotalStockForSession(sessionId, phdConfig);
    const remaining = Math.max(0, totalStock - totalUsed);

    if (totalPhdInBooking > remaining) {
      return { ok: false, error: `Only ${remaining} handheld device${remaining !== 1 ? 's' : ''} remaining in stock. You requested ${totalPhdInBooking}.` };
    }
  }

  return { ok: true, phdPkgIds, phdConfig };
}
