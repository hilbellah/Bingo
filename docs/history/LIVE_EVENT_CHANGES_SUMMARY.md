# Live Event and Special Bingo Changes Summary

Last updated: 2026-06-16

## Overall Status

The live event and special bingo fixes have been implemented and verified with targeted regression scripts, syntax checks, and a production build.

One requested item was intentionally not changed: the special bingo PHD description. A later correction confirmed that special bingo really does require/includes a PHD. The actual bug was live events showing PHD/bingo packages, and that has been fixed.

## Business Rules Now Enforced

- Live event + special bingo on the same date/hour: allowed.
- Live event + regular bingo on the same date/hour: allowed.
- Regular bingo + special bingo on the same date/hour: blocked.
- Special bingo + special bingo on the same date/hour: blocked.
- Live event + live event on the same date/hour: blocked.

## Deployment Change Record

Release target: `main` branch / Render auto-deploy.

### What Changed

- Live events were separated from bingo sessions in the customer UI.
- Live events now use general-admission ticket sales instead of the bingo floor plan.
- Multiple active live events can display at the same time.
- Live events have their own ticket package and no longer inherit bingo or PHD packages.
- Live events support an explicit sales cutoff date/time.
- Prices and payment formatting now use CAD/CA$.
- Special bingo no longer adds the per-player service charge.
- Special bingo still includes/requires the PHD package.
- The date/live-event rails no longer show the extra scrollbar/divider line.
- Production dependency audit vulnerabilities were patched before go-live.

### Conditions For This To Work Correctly

- Live events must be created from the Live Events admin tab with `session_type = event`.
- Every live event needs one live-event admission package configured before customers can buy tickets.
- Live events can be scheduled at the same date/hour as regular bingo or special bingo.
- A live event cannot be scheduled on top of another live event in the same date/hour.
- Special bingo can be scheduled at the same date/hour as a live event.
- Special bingo cannot be scheduled on top of regular bingo in the same date/hour.
- Special bingo cannot be scheduled on top of another special bingo in the same date/hour.
- Regular bingo and special bingo share the same bingo conflict group.
- Live events are a separate conflict group from bingo.
- Special bingo keeps its required PHD package; live events must not use PHD packages.
- Special bingo service charge must stay at `0`.
- Production must have the correct Authorize.Net production credentials and CAD currency setting.

### Cleanup Completed

Local active test sessions were soft-deleted through the admin API:

- `Special Bingo Test`
- `Test event dont buy`

No matching active local test sessions remained after cleanup.

### Startup Cleanup Hotfix

Production startup failed once because archived-session cleanup tried to permanently delete old seats that still had booking item history. The cleanup now only permanently removes old soft-deleted sessions when they have no bookings and no booking items referencing their seats. Sessions with booking history stay archived instead of being hard-deleted.

## Live Event Feature Issues

### Test live event disappeared after being enabled

Status: Done.

Live events are now handled as their own session type: `event`. They are no longer mixed into the special bingo display path.

### More than one active event could not display correctly

Status: Done.

The customer page now separates sessions into:

- Weekly Bingo Schedule
- Upcoming Live Events

All active live events returned by the API are shown in the Upcoming Live Events rail.

### Multiple live events on the same day

Status: Done.

Multiple active live events can be visible to customers. The page no longer assumes there is only one active live event.

## Live Event Configuration Requirements

### Floor plan / tables

Status: Done.

Live events use a general-admission ticket flow. Customers do not see the bingo floor plan or table/chair picker for live events.

Internally, the system still uses hidden seat rows for inventory locking so the existing booking, payment, reporting, and ticket tables remain stable.

### Sales cutoff

Status: Done.

Live events now support an explicit sales cutoff date and time through `sales_cutoff_at`.

Admin users can set:

- Event date
- Event time
- Sales cutoff date
- Sales cutoff time

When the cutoff passes, online ticket sales close automatically.

### Currency

Status: Done.

Prices now display as CAD/CA$ across customer UI, admin UI, receipts, email/payment formatting, and Authorize.Net defaults.

Authorize.Net defaults to CAD unless `ANET_CURRENCY` is explicitly set.

## Special Bingo Event Configuration

### Combined events

Status: Done.

Special bingo can exist on the same date/hour as a live event.

Special bingo cannot exist on top of a regular bingo session in the same date/hour.

### Description text / PHD

Status: No code change by design.

Special bingo still requires/includes the PHD. The special bingo admission description remains valid based on the latest correction.

Live events no longer inherit or show bingo/PHD packages.

### Service charges

Status: Done.

Special bingo bookings no longer add the per-player checkout service charge. The required special bingo admission/PHD package remains unchanged.

## How To Navigate Locally

### Customer booking page

Open:

```text
http://localhost:3000/
```

Use this page to verify:

- Weekly bingo sessions appear under Weekly Bingo Schedule.
- Live events appear under Upcoming Live Events.
- Selecting a live event shows a general-admission ticket purchase flow.
- Selecting bingo still shows the floor plan and chair picker.

### Admin page

Open:

```text
http://localhost:3000/admin
```

Use these tabs:

- Live Events: create/edit live events, set event title, date/time, sales cutoff date/time, and ticket price.
- Sessions: create one-off special bingo sessions.
- Auto Schedule: manage recurring regular/special bingo schedule.
- Packages: manage regular bingo package setup.
- PHD Inventory: manage PHD stock.

## Verification Run

Passed:

- `node scripts/live-event-packages-api-check.mjs`
- `node scripts/special-bingo-service-fee-api-check.mjs`
- `node scripts/receipt-rendering-check.mjs`
- `node scripts/bulk-ticket-session-types-api-check.mjs`
- `node scripts/customer-report-api-check.mjs`
- `node scripts/check-syntax.mjs`
- `npm run build`
- `git diff --check`
- `npm test`
- `npm run audit:prod`

Final go-live verification was run on 2026-06-16. The full `npm test` suite passed after allowing network access for the Authorize.Net sandbox checks. Production dependency audit also passed with zero vulnerabilities in both client and server.

## Go-Live Dependency Audit Fixes

During the release gate, production audit initially found vulnerable dependency versions. These were patched before the final test run:

- Client `react-router-dom` updated to `^6.30.4`.
- Client `ws` override updated to `8.21.0`.
- Server `ws` override updated to `8.21.0`.
- Server audit fix updated vulnerable `form-data` / `nodemailer` dependency paths.

After these updates:

- Client production audit: zero vulnerabilities.
- Server production audit: zero vulnerabilities.
- Full test suite: passed.

## Key Code Areas

- Customer live event and bingo display: `client/src/App.jsx`
- Weekly date rail UI: `client/src/components/SessionWeekPicker.jsx`
- Scrollbar cleanup under date/live-event rails: `client/src/index.css`
- Admin live event creation/editing: `client/src/admin/EventSalesTab.jsx`
- Admin event payload and cutoff handling: `client/src/admin/AdminDashboard.jsx`
- Session conflict grouping: `server/src/services/sessionPackages.js`
- Admin session conflict enforcement: `server/src/routes/adminSessionRoutes.js`
- Booking cutoff logic: `server/src/services/sessionBookingStatus.js`
- Public package behavior: `server/src/index.js`
- Authorize.Net currency default: `server/src/services/payments.js`
