# Wolastoq Bingo - Saint Mary's Entertainment Centre

Online bingo ticket booking system with real-time seat selection, built for Saint Mary's Entertainment Centre (SMEC).

## Quick Start

```bash
# 1. Install all dependencies
npm run setup

# 2. Start both server and client
npm run dev
```

- **Booking page:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin
- **API server:** http://localhost:3001

### Admin Credentials (default)
- Username: `admin`
- Password: `bingo2026`

## Features

### Customer Booking Page
- Single scrolling page with progressive reveal (no multi-step wizard)
- Session date picker with availability counts
- Party size selector (1-6 people)
- Per-person attendee names and ticket package selection
- Real-time interactive seat map with 12 tables x 6 seats
- 20-minute seat hold with visible countdown timer
- Live order total calculation
- Mock payment form (demo mode)
- Booking confirmation with reference number

### Real-Time Seat Locking
- WebSocket (Socket.io) for instant seat status updates
- Pessimistic locking: seats are held server-side with 20-minute TTL
- Background sweep releases expired holds every 30 seconds
- All connected clients see seat changes in real-time

### Admin Panel
- Dashboard with today's bookings, revenue, and session overview
- Session management (create, enable/disable)
- Ticket package management
- Booking reports with sortable table view
- CSV export for any session
- Booking cancellation with automatic seat release

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Socket.io Client
- **Backend:** Node.js, Express, Socket.io, sql.js (SQLite)
- **Database:** SQLite (single file: `server/bingo.db`)

## Project Structure

```
wolastoq-bingo/
|-- client/               # React frontend
|   |-- src/
|   |   |-- admin/        # Admin panel components
|   |   |-- components/   # Booking page, floor plan, tickets, tutorial UI
|   |   |-- utils/        # Shared formatting/helpers
|   |   |-- App.jsx       # Customer booking page orchestration
|   |   |-- api.js        # API client functions
|   |   `-- useSocket.js  # Socket.io hook
|   `-- index.html
|-- server/               # Express backend
|   |-- src/
|   |   |-- index.js      # Server + API routes + Socket.io
|   |   |-- database.js   # SQLite connection (sql.js)
|   |   |-- migrate.js    # Schema migrations
|   |   `-- seed.js       # Sample data seeder
|   `-- .env              # Environment config
|-- exports/              # CSV report exports
`-- package.json          # Root scripts
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install deps, migrate DB, seed data |
| `npm run dev` | Start server + client concurrently |
| `npm run dev:server` | Start API server only (port 3001) |
| `npm run dev:client` | Start Vite dev server only (port 3000) |
| `npm run seed` | Re-seed the database with sample data |
| `npm run build` | Build frontend for production |

## Environment Variables

Set in `server/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USERNAME` | `admin` | Admin panel username |
| `ADMIN_PASSWORD` | `bingo2026` | Admin panel password |
| `DATABASE_URL` | `./bingo.db` | SQLite database file path |
| `SESSION_HOLD_MINUTES` | `20` | Seat hold duration in minutes, capped by the server at 20 |
| `PAYMENT_FAILURE_HOLD_MINUTES` | `5` | Hold duration after failed, cancelled, or errored booking attempts, capped by the server at 5 |
| `CHECKOUT_HEARTBEAT_MAX_MINUTES` | `90` | Longest an open checkout/confirming page can keep extending its seat hold (max 240) |
| `PAYMENT_RECONCILE_INTERVAL_MS` | `60000` | How often the server asks Authorize.Net which pending bookings were paid (webhook-independent) |
| `PAYMENT_RECONCILE_DISABLED` | unset | Set to `1` to stop the gateway reconciliation poller (emergency only) |
| `PAYMENT_REVIEW_EMAILS` | unset | Extra recipients for "paid booking has no seat" alerts; active super users always receive them |
| `PAYMENT_AUDIT_INTERVAL_MS` | `21600000` | How often the gateway-side audit compares every captured charge to bookings (min 15 min) |
| `PAYMENT_AUDIT_WINDOW_HOURS` | `48` | How far back the audit looks |
| `PAYMENT_AUDIT_ALWAYS_EMAIL` | unset | Set to `1` to email super users a summary after every audit, not just when something is wrong |
| `PAYMENT_AUDIT_DISABLED` | unset | Set to `1` to stop the audit (emergency only) |
| `CHECKOUT_HOLD_MINUTES` | `30` | Seat hold once a customer reaches the card form (browsing holds stay `SESSION_HOLD_MINUTES`); never below the browsing hold, max 120 |
| `CHECKOUT_INFLIGHT_WINDOW_MINUTES` | `30` | How long after reaching the card form a checkout blocks admin seat actions (disable/assign/move/delete); super users can override with `?force=1` |
| `CHECKOUT_PROTECT_MINUTES` | `60` | When the gateway is unreachable twice in a row, in-flight checkout seats are held for this long (re-applied each failed cycle) |
| `CHECKOUT_STALE_HOURS` | `168` | A checkout that reached the card form is never auto-cancelled before this (a late payment can still claim it) |
| `REVIEW_ESCALATION_HOURS` | `2` | A payment waiting for staff review longer than this turns `/health/payments` red and is re-emailed by the audit |
| `PORT` | `3001` | API server port |

## Working From Another Device

Use GitHub as the source of truth, not a copied backup folder.

Before switching machines:

```bash
git status --short
git add <changed app files>
git commit -m "Describe the change"
git push origin main
```

On the Mac:

```bash
git clone https://github.com/hilbellah/Bingo.git
cd Bingo
npm install
cd client && npm install
cd ../server && npm install
cd ..
npm run check
```

Create `server/.env` on the Mac from the live/local secret values. Do not commit `.env`, `.env.bak-*`, database files, PDFs, screenshots, or backup copies unless they are intentionally part of the app.

When returning to the project on any device:

```bash
git pull origin main
npm run check
```

Render should build from the repository. If the Render dashboard has a manual build command, keep it aligned with the repo and do not run the SQLite seed step on Postgres deploys:

```bash
cd client && npm install --include=dev && npm run build && cd ../server && npm install
```

## Seat Map Layout

12 tables arranged in a 4x3 grid, 6 seats per table (72 total):
- Left column: seats 1, 3, 5
- Right column: seats 2, 4, 6
- Color coded: Green (available), Blue (your selection), Yellow (held), Gray (sold)

## Production

- Customer site: https://booking.wolastoqcasino.ca
- Render host: https://bingo-jk2h.onrender.com
- Deploy: pushes to `main` auto-deploy via `render.yaml` (`autoDeploy: true`), health-checked on `/api/sessions`.
- Last verified live: 2026-05-25
