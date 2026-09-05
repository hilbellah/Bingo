# Wolastoq BINGO — Security, Performance & Maintainability Checklist
**Date:** 2026-07-02 · **Scope:** full repo, deploy config (`render.yaml`), dependencies, and follow-up on the 2026-06-10 security review.

## Headline

The app's security fundamentals remain strong (parameterized SQL, verified payment webhooks, bcrypt, magic-byte upload validation, CSP, rate limiting). But the **critical item from the June 10 review was never done**: the live Postmark token is still in the source code and still matches the live `.env`, meaning it was never rotated. Two new operational risks were found: `render.yaml` no longer matches production reality (Postgres), and uploaded images are stored on the ephemeral disk and are silently lost on every deploy.

---

## 🔴 DO TODAY (critical)

- [ ] **1. Rotate the Postmark token — still leaked, still live.**
  `server/src/services/email.js` line 26 still contains the real token `9f5f28…` in a comment, and `server/.env` confirms it's still the active production value (never rotated since the June 10 review flagged it). It's on GitHub in a multi-agent repo.
  *Fix:* Postmark → Servers → Wolastoq Bingo → API Tokens → regenerate. Paste the new token into the Render dashboard (`POSTMARK_SERVER_TOKEN`, it's `sync: false`) and `server/.env`. Replace the comment value in `email.js` with `xxxxxxxx-xxxx-...`. Commit, push, redeploy. Then send yourself a test booking email to confirm.

- [ ] **2. Fix the 2 high-severity dependency vulnerabilities (nodemailer).**
  `npm audit --omit=dev` in `server/` reports 2 high vulns in `nodemailer@8`. The fix is `nodemailer@9` (breaking major). Postmark is the primary provider (HTTP API), so nodemailer only backs the Gmail SMTP path — low blast radius, but upgrade and test the Gmail fallback path. Client build: 0 vulnerabilities.

---

## 🟠 THIS WEEK (high — reliability & config drift)

- [ ] **3. Sync `render.yaml` with production reality (Postgres).**
  Production runs `DB_DRIVER=postgres` + `DATABASE_URL_POSTGRES` set only in the Render dashboard. `render.yaml` still declares SQLite (`DATABASE_URL=/var/data/bingo.db`, persistent disk) and its comments claim "production stays on SQLite." If a new service is ever created from this file, or env vars are re-synced from blueprint, the site silently boots on a stale SQLite file with old bookings. Add `DB_DRIVER=postgres` and `DATABASE_URL_POSTGRES: sync: false` to `render.yaml` and fix the comments in `render.yaml` and `server/src/database.js`.

- [ ] **4. Move uploaded images off the ephemeral disk.**
  `server/src/uploads.js` writes admin-uploaded images to `server/uploads/` — Render's ephemeral filesystem. **Every deploy wipes them** (broken event/theme images after each push). Add an `UPLOADS_DIR` env var and point it at the persistent disk (e.g. `/var/data/uploads`), or move to object storage (Cloudflare R2 / S3). Re-upload current images after switching.

- [ ] **5. Confirm and document database backups.**
  The old habit of "the SQLite file is on the persistent disk" no longer protects anything — data lives in Render Postgres `wolastoq-bingo-db`. Verify Render's automated daily backups are active on that instance, and add a monthly manual `pg_dump` downloaded off-Render (Render → database → Recovery, or `pg_dump "$DATABASE_URL_POSTGRES" > backup.sql`). Test one restore into a scratch DB once so the procedure is known-good.

- [ ] **6. Clean the working tree and git history.**
  The local repo has ~20+ modified files uncommitted and a stash from 2026-06-01. With two AIs (Claude + Codex) pushing to this repo, a dirty tree is how work gets clobbered. Commit or discard the changes, review/drop the stash (an earlier stash carried a `.env.bak` with secrets — verify before dropping). After rotating the Postmark token (#1), optionally purge the old value from git history with `git filter-repo` (coordinate with Codex so it re-clones).

---

## 🟡 THIS MONTH (hardening)

- [ ] **7. Timing-safe admin password comparison** *(carryover L3 — not fixed)*.
  `adminAuth.js:29` and `/api/admin/login` (`index.js:~2290`) still use plain `===` against `ADMIN_PASSWORD`. Use `crypto.timingSafeEqual` on hashed buffers (the codebase already does this correctly for webhook signatures and ticket tokens). Low practical risk (password is Render `generateValue`), but it's a 5-line fix.

- [ ] **8. Rate-limit failed admin auth on all admin routes** *(carryover L2 — not fixed)*.
  Only `/api/admin/login` has the strict 10/15-min limiter; every other `/api/admin/*` route re-validates Basic credentials under the general 600/15-min limit, allowing ~600 guesses/window. Add a limiter keyed on failed `Authorization` attempts across `/api/admin`, or move admin sessions to short-lived server-issued tokens instead of replaying base64(user:pass) from the browser.

- [ ] **9. Pin the Node version.**
  No `engines` field in any `package.json` and no `NODE_VERSION` in `render.yaml`. Render's default Node can shift under you on a future deploy. Add e.g. `"engines": { "node": "22.x" }` to `server/package.json` and `client/package.json` (match what production currently runs — check the Render deploy logs).

- [ ] **10. Postgres TLS verification.**
  `db/postgres.js` uses `ssl: { rejectUnauthorized: false }`. Harmless today (internal Render network URL), but if the DB is ever reached over an external URL this accepts any certificate. Note it, and switch to verified TLS if the connection ever leaves Render's internal network.

- [ ] **11. Log hygiene (PII).**
  `email.js` logs full customer email addresses on every send (3 call sites, ~lines 794/826/886). Mask the local-part (`j***@gmail.com`) so shipped/retained logs don't accumulate PII.

- [ ] **12. Name-field character allowlist** *(carryover L4 — defense in depth)*.
  `isValidCustomerName` only checks length. Downstream CSV/print sinks are currently escaped correctly, but add an allowlist (letters, spaces, hyphens, apostrophes, accented chars) so hostile input can never reach them if the rendering path changes.

---

## ⚡ PERFORMANCE

Current state is healthy: ~12 ms Postgres queries over Render's internal network, 24 indexes in the schema, hashed assets served with `immutable` 1-year caching, `index.html` correctly `no-store`, pool of 10 connections, zero 5XX since cutover. Keep it that way with:

- [ ] **13. Add response compression.** No `compression` middleware is installed, and Render's proxy does not gzip web-service responses. The seat-map JSON alone is ~57 KB (compresses ~10×), and the JS bundle benefits similarly. `npm i compression`, add `app.use(compression())` before routes — one line, biggest cheap win.
- [ ] **14. Remove the SQLite leftovers** (also a security-surface win). `sql.js` (a whole WASM SQLite engine), `server/src/db/sqlite.js`, `migrate.js`, `seed.js`, and the stale `bingo.db` copies are still in the repo/dependency tree. Production has been stable on Postgres since 2026-05-25. Removing them shrinks install size, deploy time, and the amount of code an attacker or a confused future edit can touch. **Keep the Render `/var/data` disk + SQLite file for now as the documented rollback until you're ready — then detach it to save cost.** *(Don't delete without a final decision — flagging, not doing.)*
- [ ] **15. Watch the free-tier spin-down / plan.** Service is `plan: starter` — confirm it stays on a paid plan so the booking site doesn't cold-start during a live bingo night. Add an external uptime monitor (UptimeRobot / Better Stack, free) on `https://booking.wolastoqcasino.ca/api/sessions` with email alerts.
- [ ] **16. Make `/health` actually probe Postgres.** It currently only probes when the driver exposes `prepare()` (SQLite-only), so on Postgres it reports "ok" without touching the DB. Change it to run `SELECT 1` through the active driver so Render's health check catches DB outages.

---

## 🔧 MAINTAINABILITY (easy to fix and adjust)

- [ ] **17. Split up `server/src/index.js` (101 KB, ~2,600 lines).** It holds config, middleware, and dozens of routes. The pattern already exists — `routes/adminBookingRoutes.js` etc. Extract the remaining route groups (bookings, email-verification, payments/webhooks, admin login/users, theme/config) into `routes/` modules the same way. Do it incrementally, one group per commit, testing after each. This is the single biggest "easy to adjust later" improvement.
- [ ] **18. Clean the repo root.** ~30 dated status docs (CTO-*, WEEK2-*, PHASE-2-*), 25+ screenshots, two 4 MB Netlify zips, and log files sit at top level. Move docs to `docs/archive/`, screenshots to `screenshots/`, delete the zips from git (they're build artifacts) and add `*.zip` to `.gitignore`. *(Ask-first list — nothing deleted; I'd archive, not destroy.)*
- [ ] **19. Resolve the 3 dropped foreign keys.** `001_initial_schema.sql` still declares `booking_items.package_id`, `booking_addons.package_id`, and `payment_events.booking_id` FKs that were dropped during cutover (data violates them — the package_id ones are polymorphic by design). Update the schema file to match live Postgres and document the polymorphic pattern in ARCHITECTURE.md, or the next fresh migration will fail to load real data.
- [ ] **20. Add a minimal safety net (CI).** There are no tests and no CI. A tiny GitHub Actions workflow that runs `npm ci && npm audit --omit=dev --audit-level=high` in `server/` and `client/`, plus `node --check` over `src/`, catches broken deploys and new CVEs before Render auto-deploys `main`. Enable Dependabot (or Renovate) for weekly dependency PRs. Later, add 3–5 supertest smoke tests (booking initiate, admin login reject, health).
- [ ] **21. Keep AGENTS.md/README as the single source of truth.** With two AIs on the repo, record the non-obvious invariants where both will see them: production is Postgres (dashboard env, not render.yaml — until #3 is fixed), never run `seed.js` in prod (drops tables), always `git fetch` before push, don't touch `codex-pipeline-test*` branches.

---

## 🔁 RECURRING ROUTINE (put on the calendar)

| Cadence | Task |
|---|---|
| Weekly | Glance at Render logs for 5XX / `[email]` failures; `git status` clean check |
| Monthly | `npm audit --omit=dev` in server + client; manual `pg_dump` stored off-Render; check Render disk/DB usage |
| Quarterly | Rotate `POSTMARK_SERVER_TOKEN`, `ANET_*` keys where practical, and Render admin credentials; re-run a security pass; test a backup restore |
| After any deploy | Load the booking page, make a test hold, check the admin dashboard, confirm uploaded images render |

---

## ✅ Verified still GOOD (no action needed)

- SQL injection: all queries parameterized; dynamic SQL builds placeholders only.
- Payments: Authorize.Net webhook HMAC-SHA512 + `timingSafeEqual`, plus independent server-to-server transaction re-verification of invoice **and** amount before marking paid.
- Ticket access: 32-byte constant-time-compared tokens; UUIDs everywhere (no IDOR enumeration).
- Uploads: admin-only, 5 MB cap, magic-byte validation, UUID filenames, `nosniff`.
- Headers: helmet CSP with `script-src 'self'`; CORS origin allowlist; `trust proxy` set correctly for Render.
- Secrets in deploy config: all real secrets `sync: false`; admin creds `generateValue`.
- Client dependencies: 0 vulnerabilities; modern Vite/React stack.
- Rate limiting: general 600/15 min, booking 30/15 min, admin login 10/15 min, webhook exempted correctly.

**Priority order: #1 today, #2–#6 this week, #7–#12 this month, #13–#21 as time allows.**
