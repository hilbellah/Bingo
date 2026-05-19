import { all, get } from '../database.js';
import { formatLocalDate } from '../utils/format.js';

export function getPhdConfig() {
  const phdSettingsRow = get("SELECT value FROM settings WHERE key = 'phd_inventory'");
  return phdSettingsRow ? JSON.parse(phdSettingsRow.value) : { totalStock: 200, perPlayerLimit: 2 };
}

export function getPhdUsedForSession(sessionId) {
  if (!sessionId) return 0;
  const usedRow = get(`
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

export function getPhdInventoryForSession(sessionId) {
  const config = getPhdConfig();
  const totalUsed = getPhdUsedForSession(sessionId);
  return {
    sessionId: sessionId || null,
    totalStock: config.totalStock,
    totalUsed,
    remaining: Math.max(0, config.totalStock - totalUsed),
    perPlayerLimit: config.perPlayerLimit,
  };
}

export function getPhdUsageBySession() {
  return all(`
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
    WHERE phd_count > 0
    ORDER BY date DESC
  `);
}

export function getNextPhdSessionId() {
  const today = formatLocalDate(new Date());
  const row = get(
    `SELECT id FROM sessions
     WHERE date >= ? AND is_available = 1 AND deleted_at IS NULL
     ORDER BY date ASC, time ASC
     LIMIT 1`,
    [today]
  );
  return row?.id || null;
}

export function validatePhdInventory(sessionId, attendees, useSessionPkgs, sessionPkgs, requiredPkg, sessionType = 'regular_bingo', requiredPkgs = [requiredPkg].filter(Boolean)) {
  const phdConfig = getPhdConfig();

  const phdPkgIds = new Set();
  if (useSessionPkgs) {
    sessionPkgs.filter(pkg => pkg.is_phd).forEach(pkg => phdPkgIds.add(pkg.id));
  } else {
    all('SELECT id FROM packages WHERE is_phd = 1 AND is_active = 1').forEach(pkg => phdPkgIds.add(pkg.id));
  }

  if (phdPkgIds.size === 0) return { ok: true, phdPkgIds, phdConfig };
  const includedPhdPerPlayer = requiredPkgs.some(pkg => pkg?.is_phd) ? 1 : 0;

  for (const attendee of attendees) {
    let playerPhdPackageQty = 0;
    for (const addon of attendee.addons || []) {
      if (phdPkgIds.has(addon.packageId)) playerPhdPackageQty += addon.quantity;
    }
    if (sessionType === 'regular_bingo' && playerPhdPackageQty > phdConfig.perPlayerLimit) {
      return { ok: false, error: `Each player can only add up to ${phdConfig.perPlayerLimit} PHD packages.` };
    }
    if (sessionType !== 'regular_bingo' && includedPhdPerPlayer + playerPhdPackageQty > phdConfig.perPlayerLimit) {
      return { ok: false, error: `Each player can only add up to ${phdConfig.perPlayerLimit} handheld devices.` };
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
    const totalUsed = getPhdUsedForSession(sessionId);
    const remaining = phdConfig.totalStock - totalUsed;

    if (totalPhdInBooking > remaining) {
      return { ok: false, error: `Only ${remaining} handheld device${remaining !== 1 ? 's' : ''} remaining in stock. You requested ${totalPhdInBooking}.` };
    }
  }

  return { ok: true, phdPkgIds, phdConfig };
}
