# Codebase health scorecard

A fixed rubric so that grades taken at different times can be compared honestly. Score every
area against the same criteria and measurements below, record the numbers, and add a row to the
history at the bottom. Do not change a criterion without noting it in the history.

The overall grade is the **weighted average** of the areas, rounded to the nearest 0.5.

## Areas, weights and criteria

| Area | Weight | 9–10 looks like | 5 looks like |
|---|---|---|---|
| **Payment safety** | 25% | Every payment transition goes through one state machine; refunds need an audited approval; webhook-independent reconciliation and a gateway audit run; ambiguous gateway results are quarantined, never guessed; money in integer cents | Payment status changed from several places; no reconciliation; refunds without an audit trail |
| **Testing** | 20% | API checks cover every money path and run on SQLite **and** Postgres in CI; the admin and customer screens that move money have component tests; any behaviour change ships with a test | API checks only, or tests that run on a different database than production with no CI on the real one |
| **Process & docs** | 10% | Branch per change, CI gate before deploy, incident write-ups and runbooks, repo hygiene enforced by a check | Pushes straight to production, no written history of incidents |
| **Server structure** | 10% | Routes thin, logic in services, no source file over ~800 lines, one meaning per database flag | One large entry file, business rules inside routes |
| **Admin/customer UI structure** | 15% | Each screen owns its own state; no component over ~600 lines; 0 lint warnings; no dead components | One component holding most state, files over 1,000 lines, a lint-warning backlog |
| **Design & data model** | 10% | Each column means one thing; the dev database matches production behaviour; financial actions use in-app dialogs with validation | Flags reused for unrelated meanings; `window.prompt` / `alert` for money actions |
| **Upkeep & monitoring** | 10% | `npm audit` clean; runtime errors reported to a monitoring service; health endpoints checked after each deploy | Audit red; errors only noticed when staff report them |

## Measurements to record each time

Run from the repository root on `main`:

| Measurement | Command |
|---|---|
| Full check passes | `npm run check` (exit code 0) |
| API check scripts | `ls scripts/*-check.mjs \| wc -l` |
| Client component tests | `git ls-files \| grep -cE "\.(test\|spec)\.(js\|jsx)$"` |
| Client lint warnings / errors | `npm run lint:client` |
| Production dependency advisories | `npm run audit:prod` |
| Largest source files | `git ls-files 'server/src/*.js' 'client/src/*.js' 'client/src/*.jsx' \| xargs wc -l \| sort -rn \| head` |
| `window.prompt/alert/confirm` in admin | `grep -rnoE "window\.(prompt\|alert\|confirm)\(" client/src/admin \| wc -l` |
| Error monitoring configured | yes / no |

## History

### 2026-10-12 (later) — 7.5 / 10 (commit `09c5562`)

| Area | Score | Change |
|---|---|---|
| Payment safety | 9 | Unchanged |
| Testing | 8 | +1: 23 component tests (refund buttons, Booking Sales date view, Archive reasons, money dialogs) run in `npm run check` and CI; new API checks for the date view and `deleted_reason`, passing on SQLite and Postgres |
| Process & docs | 8 | Unchanged; added a verified production backup + `RESTORE.md` (kept off-repo) and this scorecard |
| Server structure | 7 | Unchanged |
| Admin/customer UI structure | 5.5 | +0.5: dead `SoldTicketsModal` and customer `Confirmation` retired, unused-variable warnings cleared (42 → 30); `AdminDashboard.jsx` still 1,518 lines |
| Design & data model | 7 | +1: `sessions.deleted_reason` records why a session is hidden; refunds and other money actions use validated in-app dialogs (browser dialogs 57 → 27) |
| Upkeep & monitoring | 6 | Unchanged: audit clean, still no error monitoring |

Measurements: `npm run check` passes · 32 check scripts · 4 component test files (23 tests) ·
0 lint errors / 30 warnings · 0 advisories · largest file 1,518 lines · 27 browser dialogs in
admin · no monitoring.

Weighted: 9×.25 + 8×.20 + 8×.10 + 7×.10 + 5.5×.15 + 7×.10 + 6×.10 = **7.475 → 7.5**.

To reach 8.5+: split `AdminDashboard.jsx` per tab and clear the 30 react-hooks warnings
(UI structure → 8), add error monitoring (upkeep → 8.5), move the remaining 27 browser dialogs
(design → 8).

### 2026-10-12 — 7 / 10 (baseline, commit `9f556cf`)

| Area | Score | Notes |
|---|---|---|
| Payment safety | 9 | Central state machine (`bookingPayments.js`), refund approval workflow with reconciliation states, reconciliation poller, 6-hourly gateway audit, integer cents |
| Testing | 7 | 26 API check scripts in `test:api`, CI on SQLite and Postgres; **0** client component tests |
| Process & docs | 8 | Branch → CI → merge, incident docs and runbooks, hygiene check |
| Server structure | 7 | Routes/services split; `index.js` 1,302 lines, `email.js` 1,110 lines |
| Admin/customer UI structure | 5 | `AdminDashboard.jsx` 1,521 lines with 73 `useState`; `BulkPrintTab.jsx` 1,384; 42 lint warnings; unused `SoldTicketsModal` |
| Design & data model | 6 | `sessions.deleted_at` means both "archived because the date passed" and "deleted by staff" (caused the 2026-10-11 past-refund bug); 57 `window.prompt/alert/confirm` in admin; tests on SQLite vs production Postgres (mitigated by CI) |
| Upkeep & monitoring | 6 | Audit cleared on 2026-10-11 (was 9 advisories); no error monitoring |

Measurements: `npm run check` passes · 31 check scripts · 0 component tests · 0 lint errors /
42 warnings · 0 advisories · largest file 1,521 lines · 57 browser dialogs in admin · no
monitoring.

Weighted: 9×.25 + 7×.20 + 8×.10 + 7×.10 + 5×.15 + 6×.10 + 6×.10 = **7.1 → 7**.

An earlier "9" was recalled from a previous session but no record of its scope or method exists;
this scorecard replaces informal grades from here on.
