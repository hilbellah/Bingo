# Incident: live-event tickets could not be purchased online (Aug 22 - Sep 4, 2026)

**Reported:** 2026-09-04 evening, by staff - "when they choose how many tickets to buy, it doesn't add up."
**Affected period:** 2026-08-22 (commit `b03d83b`) to 2026-09-04 23:33 UTC (commit `a3a78dd` live).
**Affected events:** every live-event listing on sale in that window - Pearl Jam Tribute (Oct 3), Ozzy / Led Zeppelin Tribute (Oct 31), Cold Play (Nov 5).
**Money impact:** none. No customer could reach the payment step, so nobody was charged. Impact is lost sales and customer frustration. The `bookings` table has zero live-event booking attempts between Aug 22 and Sep 4; the last event sale before the fix was Aug 5 (Fred Rod).

## What customers experienced

Open an event -> *Buy Tickets* -> press **+** on "Entry Ticket". The count dropped straight back to 0, a red banner behind the panel read *"Your chair hold expired, so your selection was cleared. Please pick your chairs again,"* and the total stayed at CA$0.00. After two attempts the + button greyed out.

## Root cause

`GET /api/sessions/:id/seats` marks each seat with `isMyHold` (is this seat held by the requesting browser?) via `CASE ... END as isMyHold`. **Postgres lower-cases unquoted column aliases**, so production returned the key as `ismyhold`. The client reads `seat.isMyHold`, got `undefined`, and the selection-reconcile effect added on Aug 22 (`client/src/App.jsx`, "Reconcile the local selection against seat reality") treated the browser's own held seat as someone else's and cleared it.

Live-event checkout (`reserveEventTickets` in `App.jsx`) locks one seat per ticket and immediately refetches the seat map, so every increment was undone within a second. Regular bingo was affected only when the server broadcast `seats:refresh` (every ~30 s when expired holds are swept), because socket `seat:locked` events carry the flag with the correct casing.

The same defect zeroed the admin dashboard chair tiles (`availableChairs`, `soldChairs`, `heldChairs`, `totalTables`, `totalChairs`) since the Postgres cutover on 2026-05-25.

## Why it was not caught

- The test suite (`scripts/*-check.mjs`) runs on SQLite, which preserves alias case. Every test was green.
- No automated test exercises a live-event purchase end to end.
- The alias had been wrong since May 25; nothing read it until Aug 22.

## Fix (commit `a3a78dd`)

1. `server/src/index.js`: `AS "isMyHold"` (quoted - valid on SQLite and Postgres).
2. `client/src/api.js` `fetchSeats`: normalises `isMyHold ?? ismyhold` so a casing regression can never again make the client disown its seat.
3. `server/src/routes/adminReportRoutes.js`: quoted the dashboard chair-stat aliases.
4. `scripts/safety-invariants-check.mjs`: fails `npm run check` on any unquoted camelCase alias in server SQL, and (commit `46289cf`) on any literal `?` inside a SQL string literal (the other Postgres-translator hazard).

Verified live 2026-09-04 23:33 UTC: seat API returns `isMyHold`; Pearl Jam Tribute -> + -> + gives 2 tickets / CA$57.50 with name fields; test holds released.

## Follow-ups

- `CLAUDE.md` (repo root) now documents the Postgres-vs-SQLite differences for every agent.
- Tell customers online concert ticketing is open (Bingo/Events page note, socials); anyone who tried since Aug 31 bounced.
- Consider a Postgres-backed smoke test or staging database so dialect-only bugs surface before deploy.
