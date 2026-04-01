# Wolastoq Bingo — Saint Mary's Entertainment Centre

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
- 10-minute seat hold with visible countdown timer
- Live order total calculation
- Mock payment form (demo mode)
- Booking confirmation with reference number

### Real-Time Seat Locking
- WebSocket (Socket.io) for instant seat status updates
- Pessimistic locking: seats are held server-side with 10-minute TTL
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
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # Booking page components
│   │   ├── admin/        # Admin panel components
│   │   ├── App.jsx       # Main booking page
│   │   ├── api.js        # API client functions
│   │   └── useSocket.js  # Socket.io hook
│   └── index.html
├── server/               # Express backend
│   ├── src/
│   │   ├── index.js      # Server + API routes + Socket.io
│   │   ├── database.js   # SQLite connection (sql.js)
│   │   ├── migrate.js    # Schema migrations
│   │   └── seed.js       # Sample data seeder
│   └── .env              # Environment config
├── exports/              # CSV report exports
└── package.json          # Root scripts
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
| `SESSION_HOLD_MINUTES` | `10` | Seat hold duration in minutes |
| `PORT` | `3001` | API server port |

## Seat Map Layout

12 tables arranged in a 4x3 grid, 6 seats per table (72 total):
- Left column: seats 1, 3, 5
- Right column: seats 2, 4, 6
- Color coded: Green (available), Blue (your selection), Yellow (held), Gray (sold)
