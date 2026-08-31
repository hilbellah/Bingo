// server/src/routes/websiteEventRoutes.js
//
// The public feed the marketing site reads.
//
// GET /api/website/events  ->  { generated_at, events: [ ... ] }
//
// wolastoqcasino.ca fetches this server-side (wp_remote_get) and merges the
// result with the hand-maintained PHP registry in
// wp-content/themes/wola/inc/wola-events.php. Entry keys match that registry
// one-for-one so the theme templates need no new rendering logic.
//
// Deliberately unauthenticated: it contains only the marketing copy an admin
// has explicitly chosen to publish. No seat, booking or customer data.

import { all } from '../database.js';
import {
  PUBLISHED_WEBSITE_SESSIONS_SQL,
  toWebsiteFeedEntry,
  websiteFeedToday,
} from '../services/websiteEvents.js';

export function registerWebsiteEventRoutes(app) {
  app.get('/api/website/events', async (req, res) => {
    try {
      const bookingBaseUrl = process.env.PUBLIC_SITE_URL
        || process.env.PUBLIC_BASE_URL
        || 'https://booking.wolastoqcasino.ca';

      const sessions = await all(PUBLISHED_WEBSITE_SESSIONS_SQL, [websiteFeedToday()]);
      const events = sessions
        .filter(session => session.website_slug && session.website_flyer_url)
        .map(session => toWebsiteFeedEntry(session, { bookingBaseUrl }));

      // Short shared-cache window: WordPress caches this in a transient
      // anyway, and a push notification busts it when something changes.
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.json({
        generated_at: new Date().toISOString(),
        count: events.length,
        events,
      });
    } catch (err) {
      console.error('GET /api/website/events failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
