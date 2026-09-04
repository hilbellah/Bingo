## Imported Claude Cowork project instructions

## Marketing site (wolastoqcasino.ca) — CRITICAL rules for ALL agents

1. **Bingo event flyers are data-driven.** All dated event banners (bingo flyers, posters) are managed in ONE file on the Cloudways server: `wp-content/themes/wola/inc/wola-events.php`. The templates `templates/bingo-redesign.php`, `archive-events.php`, and `home-redesign.php` contain `wola_events_upcoming()` loops that render them and auto-remove past events. **Never delete the `require_once .../inc/wola-events.php` lines or the WOLAEVENTS loop sections when editing or rewriting these templates.** To add/change an event, edit `inc/wola-events.php` only.
2. **Do not rewrite theme template files from scratch.** Patch the existing live file. Full rewrites have repeatedly destroyed other agents' work (event flyers disappeared sitewide three times in July 2026).
3. The current `templates/bingo-redesign.php` (restored 2026-07-31) is the approved design — do not replace it.
4. Jackpot copy rule from Sir Hilbert: never state "$50,000 jackpot" flatly — always "Up to $50,000".
5. After any theme change: purge with `wp breeze purge --cache=all && wp cache flush`, then verify the bare URL.
6. **Events can now also come from the booking app.** `inc/wola-booking-sync.php` (loaded from `functions.php`) stores events an admin explicitly published in the booking admin, and `wola_events_merged()` in `inc/wola-events.php` appends them to the hand-written array. **The hand-written array always wins on a slug clash** — synced events can never overwrite or delete a flyer maintained by hand. Do not delete the `require_once .../inc/wola-booking-sync.php` line in `functions.php` or the `wola_events_merged()` function. Rendering makes no HTTP calls, so the booking app being down cannot blank the flyers. Placement: a booking-published bingo event shows on the **Bingo page only** unless its Events-page/Homepage boxes are ticked in the booking admin; `wola_events_upcoming( $type, $surface )` takes the surface as its second argument and each template passes its own. Events without placement flags — every hand-written one — are never filtered out. Full write-up: `PUBLISH-EVENTS-TO-WEBSITE.md`.

## Booking app (this repository) — rules for ALL agents, all tools

The booking app is a live production system taking real payments; `git push origin main` deploys it. The full, binding rules are in `CLAUDE.md` at the repo root and apply to every agent regardless of vendor (Claude, Codex, Cursor, Copilot, or any other). Summary:

1. **Report before you act.** Investigate, write up findings + a precise plan (files, approach, risks, verification), and wait for Sir Hilbert's explicit go-ahead before changing anything. Approval is per plan, not per session.
2. **Never delete or rewrite files wholesale.** Patch the existing file. Never `rm -rf`, never recreate a file from scratch, never `git reset --hard` / `git clean` / `git push --force`. Do not commit or push unless asked.
3. **Never write to production data by hand.** Read-only `SELECT` for investigation only. Never delete bookings, sessions, seats, customers, payments, or audit rows.
4. **Never touch secrets or infrastructure** (`server/.env`, Render env vars, Authorize.Net, DNS) without approval. Never Netlify; never a new Render service.
5. **Production is Postgres, tests are SQLite.** Quote camelCase SQL aliases (`AS "isMyHold"`), keep `GROUP BY` strict, wrap `LIKE` in `LOWER()`, no literal `?` in SQL strings. `npm run check` must be green before you claim done — check exit codes, not piped output.
6. All payment/seat state changes go through `markBookingPaid` / `markBookingRefunded` / `markBookingVoided` in `server/src/index.js`. Add a `scripts/*-check.mjs` test for any behaviour you change.
