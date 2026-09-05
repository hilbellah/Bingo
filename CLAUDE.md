# Wolastoq BINGO — Rules for every AI agent working in this repo

This is a **live, revenue-taking production system**. Real customers are buying bingo seats and concert tickets from it right now, real money moves through Authorize.Net, and `git push origin main` **deploys to production automatically** (Render). Treat every action accordingly.

Owner: Sir Hilbert (hilbert_magculang@yahoo.com). Client: Saint Mary's Entertainment Centre / Wolastoq Casino.

---

## 0. The one rule that overrides everything: REPORT BEFORE YOU ACT

Before changing **anything** — code, data, config, files, git state — you must:

1. **Investigate and write a report** to Sir Hilbert: what you found, what is wrong, what you propose to change, which files, what the risk is, and how you will verify it.
2. **Wait for an explicit "go ahead"** for that specific plan. Approval for one change is not approval for the next.
3. Only then make the change, **exactly as reported**. If you discover mid-way that the plan must differ, stop and report again.

This applies even to "obvious" fixes and even when the request sounds urgent. Investigation is always allowed (read files, run read-only queries, run the test suite, take screenshots). Changing things is not, until approved.

If you are unsure whether something counts as a change: it does.

---

## 1. Things you must NEVER do (no approval can make these OK)

- **Never delete or rewrite files wholesale.** No `rm -rf`, no deleting directories, no "recreating" a file from scratch. Patch the existing file. Other agents have wiped entire sections of this project this way; it is the #1 way AI has damaged this codebase.
- **Never run destructive git commands**: `git reset --hard`, `git checkout -- .`, `git clean`, `git push --force`, `git branch -D`, rebasing shared history, or deleting `.git`. Never commit or push without being asked.
- **Never write to the production database** except through the application's own code paths that were approved for deployment. Read-only queries for investigation are fine (`DB_DRIVER=postgres`, `SELECT` only). No `UPDATE`/`DELETE`/`INSERT` by hand, ever, without a written plan and explicit approval — and even then prefer a reviewed, dry-run-capable script.
- **Never delete bookings, sessions, seats, customers, payments, or audit rows.** Not test data, not "obviously stale" data. Sir Hilbert decides what gets deleted.
- **Never touch `server/.env`, Render environment variables, Authorize.Net settings, or DNS** without approval. Never print secrets into the conversation or commit them.
- **Never refund, void, or charge** anything through the gateway outside the app's refund-approval workflow.
- **Never create a new Render service or use Netlify** for this project. The deployment is the existing Render service `bingo-jk2h` behind `https://booking.wolastoqcasino.ca`.
- **Never disable a safeguard to make a test pass** (rate limits, payment guards, safety invariants, the reconciler, the audit).
- **Never spawn parallel agents to edit the same files.**

---

## 2. How to work here

### Before touching code
- Read `docs/INCIDENT-2026-09-04-LATE-PAYMENT-WEBHOOKS.md` and `INCIDENT-RUNBOOKS.md` §7 if the task involves payments, seats, holds, or bookings.
- Run `npm run check` (from the repo root) to establish a green baseline. If it is red before you start, report that first.
- State your plan (files, approach, verification) and wait.

### While changing code
- Small, surgical edits. Match the surrounding style and comment density.
- **Production is Postgres; the tests run on SQLite.** They differ:
  - Postgres lower-cases unquoted column aliases. Always write `AS "camelName"` (quoted). A safety invariant fails the build on unquoted camelCase aliases — do not weaken it.
  - Postgres is strict about `GROUP BY`; SQLite is not.
  - `LIKE` is case-sensitive on Postgres; wrap with `LOWER()`.
  - `datetime()` / `strftime()` work on both only because of shim functions in `server/migrations/postgres/001_initial_schema.sql`.
  - `?` placeholders are translated positionally — never put a literal `?` inside a SQL string.
  - When a bug reproduces only in production, `curl` the live API and check the JSON key names first.
- Money is stored as **integer cents** everywhere.
- Every payment transition goes through `markBookingPaid` / `markBookingRefunded` / `markBookingVoided` in `server/src/index.js`. Do not add new paths that change `payment_status` or seat `status` directly.
- Add or extend a test in `scripts/*-check.mjs` for any behaviour you change, and register it in `package.json` → `test:api`.

### Running the checks against Postgres (what production runs)
CI does this automatically (`.github/workflows/check.yml`, job "postgres"). Locally, with Docker:
```
docker run -d --name bingo-test-pg -p 5433:5432 -e POSTGRES_USER=bingo -e POSTGRES_PASSWORD=bingo -e POSTGRES_DB=bingo_test postgres:16
TEST_DB_DRIVER=postgres DATABASE_URL_POSTGRES=postgres://bingo:bingo@localhost:5433/bingo_test PGSSL=disable NODE_ENV=test npm run test:api
```
`scripts/lib/test-db.mjs` drops and recreates the schema for every check script and refuses any host that is not local/CI (never `*.render.com`). Any check that passes on SQLite but fails here is a production bug - fix the code, not the test, unless the test itself used SQLite-only SQL.

### Before you say "done"
- `npm run check` passes (build, migrations, safety invariants, syntax, all API checks, audit).
- Do not report success on the strength of a piped command — check the exit code of the build and the tests themselves.
- Report what you changed, what you verified, and what you did **not** do.

### Deploying
- Only when Sir Hilbert asks. `git push origin main` = production deploy within ~3 minutes.
- Stage only the files for the change (`git add <paths>`); the working tree contains many unrelated untracked files that must not be swept in.
- Commit messages: explain *why*, end with the attribution trailers the session provides.
- After deploy, verify from outside: `curl https://booking.wolastoqcasino.ca/health` (uptime resets, `paymentReconciliation.errors` is 0) and `https://booking.wolastoqcasino.ca/health/payments` (`status` is `ok` or `attention`, never `error`).
- If a deploy fails to build, Render keeps the previous version live. Fix forward; never force-push.

---

## 3. Where things are

| Area | Location |
|---|---|
| API server (Express, all booking + payment logic) | `server/src/index.js` (large), `server/src/routes/*`, `server/src/services/*` |
| Payment gateway (Authorize.Net Accept Hosted) | `server/src/services/payments.js` |
| Webhook-independent payment confirmation | `server/src/services/paymentReconciliation.js` (poller), `paymentAudit.js` (6-hourly gateway audit) |
| Admin payment attention panel (bell icon) | `server/src/routes/adminPaymentReviewRoutes.js`, `client/src/admin/NotificationsBell.jsx` |
| Seat holds | `server/src/services/holds.js`, `server/src/routes/seatRoutes.js`; heartbeat in `GET /api/bookings/:id/status` |
| Customer app (React/Vite) | `client/src/App.jsx`, `client/src/components/*` |
| Admin app | `client/src/admin/*` |
| DB adapters | `server/src/db/sqlite.js` (tests/dev), `server/src/db/postgres.js` (production) |
| Migrations | `server/src/migrate.js` (SQLite), `server/migrations/postgres/*.sql` (Postgres, applied by `migratePostgres.js` on boot) |
| Tests | `scripts/*-check.mjs`, run via `npm run check` / `npm run test:api` |
| Deployment config | `render.yaml` (env var *documentation*; real values live in the Render dashboard) |
| Marketing site (WordPress on Cloudways) rules | `AGENTS.md` — separate, equally strict rules |
| Incident history and runbooks | `docs/INCIDENT-*.md`, `INCIDENT-RUNBOOKS.md` |

Production secrets (Authorize.Net production keys, Postmark, admin credentials) exist **only** in the Render dashboard. `server/.env` holds sandbox keys plus a read-only-usable Postgres URL for investigation.

---

## 4. Read-only investigation you may do without asking

- Read any file. Run `npm run check`, `npm run smoke`, individual `scripts/*-check.mjs` (they use a throwaway SQLite DB).
- `SELECT` queries against production Postgres via `DB_DRIVER=postgres node -e "import('./src/db/postgres.js')..."` from `server/`.
- `curl` the public endpoints of the live site. Browse the live site as a customer up to — but not including — submitting a payment. Release any seat you lock (`POST /api/seats/:id/unlock`).
- Read Render health endpoints.

Everything else: report first, then wait.

---

## 5. Working style Sir Hilbert expects

Reason thoroughly; treat every request as complex unless told otherwise. Explain in plain language what happened and why, with evidence (queries, screenshots, log lines) — not assertions. Give a recommendation, then wait for the decision. Never quietly narrow or widen the scope. When something goes wrong on your side, say so plainly and immediately.

The `/report-first` command in `.claude/commands/` restates the protocol in §0 — invoke it (or ask the agent to) at the start of any session that will touch this repo.
