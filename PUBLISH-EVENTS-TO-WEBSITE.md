# Publish a bingo event from the booking admin to wolastoqcasino.ca

Built 2026-08-31. Lets you tick one box when creating a special bingo event in the booking
admin and have its flyer and copy appear on the marketing site — Bingo page banner, Events
page poster and homepage card — without hand-editing PHP.

---

## 1. What it does

Publishing is **opt-in per event**. Nothing syncs automatically. A session is invisible to
wolastoqcasino.ca until someone ticks **"Publish this event to wolastoqcasino.ca"** in the
booking admin and fills in the flyer plus the required copy. Regular auto-generated bingo
sessions can never be published — there is no flyer for them.

```
Booking admin (Sessions tab)              Marketing site (wolastoqcasino.ca)
  Add Special Bingo
   [x] Publish to website                       inc/wola-events.php
       flyer + kicker + lead + rows              +-- hand-written array (untouched)
            |                                    +-- synced events  <----+
            v                                    = merged, deduped, date-sorted
  POST /api/admin/sessions                                              |
            |                                                           |
            +-- push --> /wp-json/wola/v1/events-sync --> pull ---------+
            |              (re-pulls + purges Breeze/Varnish)           |
            +-- GET /api/website/events  <-- WP-Cron pull every 10 min -+
```

**The hand-written array always wins.** If a synced event has the same slug as an entry in
`inc/wola-events.php`, the hand-written one is kept and the synced copy is discarded. Nothing
the booking app sends can overwrite or delete a flyer you maintain by hand.

**Rendering never makes an HTTP request.** WordPress serves flyers from a stored option. If
the booking app is slow, down, or moved, page rendering is completely unaffected and the last
known good flyers keep showing.

---

## 2. Using it (day to day)

1. Booking admin → **Sessions** → **Add Special Bingo**. Fill in date, time, doors, cutoff and
   packages as usual.
2. Tick **Publish this event to wolastoqcasino.ca**.
3. Fill in the panel that appears:

   | Field | Required | Where it shows |
   |---|---|---|
   | **Show this event on** | **yes, at least one** | Bingo page (default) / Events page / Homepage |
   | Flyer image | **yes** | the poster on whichever pages you ticked |
   | Flyer alt text | **yes** | screen readers, and if the image fails to load |
   | Website event name | **yes** | event heading |
   | Highlighted heading | no — auto | two-tone heading; last word highlighted by default |
   | Badge | no — auto | pill above the poster, e.g. "Sunday · August 23" |
   | Long date | no — auto | date line under the banner heading |
   | Kicker | **yes** | small line above the name on /events/ |
   | Lead paragraph | **yes** | opening paragraph on /events/ (basic HTML allowed) |
   | Short blurb | **yes** | Bingo page banner and homepage card |
   | Event details | **yes**, ≥1 row | the details table on /events/ |
   | Top advertised prize | no | drives the "Come Play for $X" headline |
   | Show until | no — defaults to event date | flyer auto-removes after this date |
   | Website link name | no — auto | the /events/#we-ev-… anchor |

4. Save. The site updates within seconds (push) or within ten minutes (cron fallback).

### Placement — where an event appears

A bingo event published from the booking admin shows on the **Bingo page only**
unless you say otherwise. Tick **Homepage** for the big draws (Bigger Bank Bingo
and the like) and **Events page** if you want the full poster with the details
table on `/events/`. Publishing with no page ticked is refused rather than
creating an event nobody can see.

```
Show this event on:
  [x] Bingo page      <- default, always on unless you untick it
  [ ] Events page
  [ ] Homepage        <- tick for the big draws
```

The homepage shows the **single next** upcoming event that has Homepage ticked,
so ticking it on several events is safe — they queue by date rather than piling
up.

**The eight hand-written events in `inc/wola-events.php` are exempt.** They carry
no placement flags, and the WordPress side treats a flagless event as "show
everywhere", so they keep appearing exactly where they do today. Placement only
governs events published from the booking admin.

To take a flyer down early, untick the box and save — the copy is kept, so re-publishing later
needs no retyping. Deleting or disabling the session also removes it from the site.
Flyers auto-remove after "Show until", exactly like the hand-written ones.

The Sessions table shows a **Published** chip for events currently live on the marketing site.

---

## 3. Booking-app side — already done

| Change | File |
|---|---|
| `website_*` columns on `sessions` | `server/migrations/postgres/015_website_publishing.sql`, `server/src/migrate.js` |
| Placement columns (`website_show_*`) | `server/migrations/postgres/016_website_placement.sql` |
| Validation, auto-fill, feed shaping | `server/src/services/websiteEvents.js` |
| Push notifier | `server/src/services/websiteSync.js` |
| Public feed `GET /api/website/events` | `server/src/routes/websiteEventRoutes.js` |
| Create / update / delete wiring | `server/src/routes/adminSessionRoutes.js` |
| Admin panel | `client/src/admin/WebsiteListingFields.jsx`, `SessionsTab.jsx`, `AdminDashboard.jsx` |
| Uploads moved to the persistent disk | `server/src/uploads.js`, `render.yaml` |

The Postgres migration runs automatically on the next Render deploy.

### Render environment variables to set

| Key | Value |
|---|---|
| `UPLOADS_DIR` | `/var/data/uploads` |
| `WEBSITE_SYNC_URL` | `https://www.wolastoqcasino.ca/wp-json/wola/v1/events-sync` |
| `WEBSITE_SYNC_SECRET` | a long random string — must match WordPress (below) |

`UPLOADS_DIR` matters: uploads used to be written into the deployed source tree, so **every
deploy wiped them**. Flyers must outlive deploys or the marketing site shows broken posters.
Existing uploads are copied onto the disk automatically on first boot.

`WEBSITE_SYNC_*` are optional. Without them the site still picks changes up on its own
ten-minute pull — just not instantly.

---

## 4. WordPress side — needs installing on Cloudways

Three steps. Nothing here rewrites an existing template.

### Step 1 — upload the new file

Upload `wp-content/themes/wola/inc/wola-booking-sync.php` (new file, nothing to overwrite).

### Step 2 — patch two existing files

Both are **surgical patches**, not rewrites. The local mirror in this repo already has them
applied — diff against the live copies before uploading.

- **`wp-content/themes/wola/functions.php`** — adds a `require_once` for the sync file, just
  above the "FEATURED EVENT (ACF)" block. It must load on every request (not only the three
  event templates) because it registers the REST endpoint and the cron job.

- **`wp-content/themes/wola/inc/wola-events.php`** — adds `wola_events_merged()` and
  `wola_event_shows_on()`, and gives `wola_events_upcoming()` a second `$surface` argument.
  **The hand-written array is completely untouched**, and `wola_event_shows_on()` returns
  true for any event without placement flags, so no hand-written flyer can ever be filtered
  off a page.

- **The three templates** — each call site now names its surface:
  `bingo-redesign.php` passes `'bingo'`, `archive-events.php` passes `'events'`,
  `home-redesign.php` passes `'home'`. One-line changes; the rest of each template is
  untouched.

### Step 3 — add the secret to `wp-config.php`

```php
define( 'WOLA_BOOKING_FEED_URL', 'https://booking.wolastoqcasino.ca/api/website/events' );
define( 'WOLA_BOOKING_SYNC_SECRET', 'paste-the-same-long-random-string-as-render' );
```

Then purge: **wp-admin top bar → Breeze → Purge All Cache**, and verify the **bare** URL
(a `?cb=123` query string bypasses Varnish and will look correct even when the real cached
page is stale).

---

## 5. Verifying

```bash
# 1. The feed (public, no auth). Should list every published event.
curl -s https://booking.wolastoqcasino.ca/api/website/events | jq

# 2. The push endpoint. Wrong secret must be refused.
curl -s -X POST https://www.wolastoqcasino.ca/wp-json/wola/v1/events-sync \
  -H 'X-Wola-Sync-Secret: wrong' -i | head -1        # expect 403

# 3. With the real secret: pulls the feed and purges the caches.
curl -s -X POST https://www.wolastoqcasino.ca/wp-json/wola/v1/events-sync \
  -H "X-Wola-Sync-Secret: $SECRET"                   # expect {"ok":true,"events":N,...}
```

Then check the bare URLs: `/bingo/`, `/events/`, and the homepage.

If a sync ever fails, wp-admin shows a warning notice with the error and the time of the last
successful sync. Flyers already on the site keep showing regardless — they are stored locally.

---

## 6. Deliberate limits

- **Poker events are not covered.** The feed only emits `type => bingo`. Poker events stay
  hand-written in `inc/wola-events.php`.
- **The eight existing hard-coded events were left exactly as they are.** They keep working
  and take priority over anything synced.
- **The flyer artwork is not generated.** You upload the finished poster; this only decides
  where it appears and when it comes down.
- **A booking-side outage never blanks the site.** The worst case is that the marketing site
  shows a stale-but-correct set of flyers until the booking app is reachable again.
