# Historical documents

Planning, status and setup documents from the April–July 2026 launch period,
moved here on 2026-09-05 so the repository root only carries documents that
are still current. Nothing was deleted; `git log --follow docs/history/<file>`
shows each file's full history.

Treat these as a record of what was planned and decided at the time, not as
instructions. Where they disagree with `CLAUDE.md`, `README.md`,
`INCIDENT-RUNBOOKS.md` or `docs/INCIDENT-*.md`, the current documents win.
In particular:

- Deployment is `git push origin main` → Render auto-deploy, gated by GitHub
  Actions (`.github/workflows/check.yml`). See `CLAUDE.md`.
- Monitoring is `/health` and `/health/payments` plus the admin bell; the
  Datadog guides here were never put into service.
- Cross-links between these files still work because they moved together.
