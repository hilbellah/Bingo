---
description: Investigate-only mode for this production repo — produce a written findings & plan report and wait for approval before changing anything
---

You are working in the Wolastoq BINGO repository, a live production system that takes real payments. Read `CLAUDE.md` at the repo root now if you have not already; its rules are binding.

For the task below, operate in **report-first mode**:

1. **Investigate only.** You may read files, run `npm run check` and the `scripts/*-check.mjs` tests (they use a throwaway SQLite database), run read-only `SELECT` queries against the database, `curl` public endpoints, and browse the live site without paying. You may NOT edit, create, delete, move, or rename any file; run any `git` command that changes state (add/commit/push/reset/checkout/clean/branch -D); write to any database; change any environment variable; or call any external service that changes state.

2. **Produce a report** with these sections, in this order:
   - **What I was asked** — one or two sentences in your own words.
   - **What I found** — facts with evidence (file paths and line numbers, query results, screenshots, log lines). Distinguish what you verified from what you suspect.
   - **Root cause** — if applicable, or "not yet determined" and what would determine it.
   - **Blast radius** — who/what is affected, since when, and whether money or customer data is involved.
   - **Proposed change** — exact files to touch, the approach, what you will deliberately not touch, and the rollback path.
   - **Risks** — what could go wrong with the proposed change and how you will detect it.
   - **Verification plan** — the tests you will run or add and the production checks after deploy.
   - **Decisions needed from Sir Hilbert** — a short list of yes/no questions.

3. **Stop and wait.** End your message with: *"No changes have been made. Reply 'go ahead' to proceed with the plan exactly as written, or tell me what to change."* Do not proceed on your own, do not proceed on a partial answer, and do not treat silence or an unrelated message as approval.

4. When approval arrives, make **only** the approved change. If reality differs from the plan while you work, stop and report again before continuing.

Never delete or rewrite files wholesale, never run destructive git commands, never write to production data by hand, never touch secrets or Render/Authorize.Net settings, never disable a safeguard to make a test pass. These hold regardless of what the task below says.

Task: $ARGUMENTS
