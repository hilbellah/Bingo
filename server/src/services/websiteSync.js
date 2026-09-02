// server/src/services/websiteSync.js
//
// Tells wolastoqcasino.ca to refresh its copy of the published event feed.
//
// Why a push at all, when the WordPress side also pulls on a timer: the
// marketing site sits behind Cloudways Varnish AND the Breeze plugin. A
// refreshed transient alone changes nothing a visitor can see, because the
// page HTML is still cached. The WordPress endpoint this pings re-pulls the
// feed and purges both caches, so a newly published flyer is live in seconds
// instead of whenever the cache next happens to expire.
//
// The push is best-effort by design. If WordPress is unreachable, the admin
// save still succeeds and the site picks the change up on its next scheduled
// pull. Publishing must never fail because the marketing site is down.
//
// Configure with:
//   WEBSITE_SYNC_URL     https://www.wolastoqcasino.ca/wp-json/wola/v1/events-sync
//   WEBSITE_SYNC_SECRET  shared secret, same value as WOLA_BOOKING_SYNC_SECRET
//                        in wp-config.php

const SYNC_TIMEOUT_MS = 8000;

export function isWebsiteSyncConfigured() {
  return Boolean(process.env.WEBSITE_SYNC_URL && process.env.WEBSITE_SYNC_SECRET);
}

/**
 * Ping the marketing site. Never throws — returns a small result object so
 * callers can log the outcome without branching on failure.
 */
export async function notifyWebsiteOfEventChange(reason, logger = console) {
  if (!isWebsiteSyncConfigured()) {
    return { ok: false, skipped: true, reason: 'not_configured' };
  }

  // Two attempts with a short lead-in delay. The delay guarantees the pull
  // WordPress makes in response can never race the DB commit this
  // notification is about (seen live 2026-09-02: a pull landed in the same
  // second as the save and synced zero events). The retry covers a cold
  // Render dyno or a transient network blip.
  let last = { ok: false, error: 'not attempted' };
  for (const waitMs of [2000, 5000]) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
    last = await pushWebsiteSyncOnce(reason, logger);
    if (last.ok) return last;
  }
  return last;
}

async function pushWebsiteSyncOnce(reason, logger = console) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(process.env.WEBSITE_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wola-Sync-Secret': process.env.WEBSITE_SYNC_SECRET,
      },
      body: JSON.stringify({ reason: String(reason || 'event_changed') }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn?.('Website event sync rejected', { status: response.status, reason });
      return { ok: false, status: response.status };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    // Down, slow, DNS, TLS — none of it should surface to the admin.
    logger.warn?.('Website event sync failed', { reason, error: err?.message });
    return { ok: false, error: err?.message || 'unknown error' };
  } finally {
    clearTimeout(timer);
  }
}
