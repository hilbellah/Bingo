# Contributing to Wolastoq BINGO

This is a live booking and payment system for Wolastoq Casino. **Anything merged
into `main` is deployed to production within about 3 minutes.** That is why
`main` is protected:

- Nobody can push to `main` directly. Every change arrives as a pull request.
- Every pull request needs approval from the code owner (@hilbellah).
- Both CI checks must pass first: **full check (SQLite)** and
  **api + hold checks (Postgres)**.
- Force-pushes and deleting `main` are blocked.

## How to send a change

1. **Fork** the repository (or, if you were added as a collaborator, create a
   branch named `fix/...`, `feat/...`, `refactor/...` or `chore/...`).
2. Make a small, focused change. One change per pull request.
3. Run the checks locally from the repository root:
   ```
   npm ci && npm ci --prefix client --include=dev && npm ci --prefix server
   npm run check
   ```
   `npm run check` must pass with **0 lint warnings**.
4. Open a pull request against `main` and fill in the template.
5. Wait for review. Do not ask for the merge before both CI checks are green.

## Rules that are not negotiable

Read [`CLAUDE.md`](../CLAUDE.md) in full. In short:

- Never commit secrets, `.env` files, database dumps, customer data, logs or
  archives. The repository is public.
- Money is stored as integer cents. Every payment status change goes through
  `server/src/services/bookingPayments.js`.
- Production runs Postgres; tests also run on SQLite. Quote camelCase SQL
  aliases (`AS "camelName"`) and never put a literal `?` inside SQL.
- Every behaviour change comes with a test (`scripts/*-check.mjs` for the
  server, `*.test.jsx` for screens).
- Never weaken a safeguard (rate limits, payment guards, safety invariants,
  the reconciler, the audit) to make a test pass.

You will not get access to Render, the production database, Authorize.Net or
DNS. Those stay with the owner.
