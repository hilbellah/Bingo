# Admin Change Log

Running record of admin/backend changes, where to access them, and the save-point commits.

## 2026-06-25

### Sales Report Ranges

**What changed**
- Expanded the backend daily sales report endpoint to support:
  - Daily reports
  - Multi-day custom ranges
  - Weekly ranges
  - Monthly ranges
- Added range metadata to report responses:
  - `dateFrom`
  - `dateTo`
  - `range`
  - `rangeLabel`
  - `dailyTotals`
  - `sessionTotals`
- Preserved the existing single-day daily report behavior for compatibility.

**Where to access**
- Admin backend: `https://booking.wolastoqcasino.ca/admin`
- Go to `Bookings` / `Sales & Transactions`
- Open `Daily Sales`
- Use the buttons:
  - `Daily`
  - `Multi-day`
  - `Weekly`
  - `Monthly`

**Backend/API access**
- Daily: `/api/admin/daily-sales?date=YYYY-MM-DD`
- Multi-day: `/api/admin/daily-sales?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
- Weekly: `/api/admin/daily-sales?range=weekly&date=YYYY-MM-DD`
- Monthly: `/api/admin/daily-sales?range=monthly&date=YYYY-MM-DD`

**Save points**
- `a8215b1` - Expand admin daily sales report ranges
- `100524b` - Add daily sales report range controls

### Overview Report Ranges

**What changed**
- Added the same report range options to the Overview dashboard.
- Overview metrics can now switch between:
  - Daily
  - Multi-day
  - Weekly
  - Monthly
- Existing From/To date fields still work.

**Where to access**
- Admin backend: `https://booking.wolastoqcasino.ca/admin`
- Go to `Overview`
- Use the range buttons above the summary cards.

**Save point**
- `a637ce0` - Add overview report range controls

### Admin User Editing

**What changed**
- Super users can now edit existing admin users after creation.
- Added controls to:
  - Edit email
  - Edit display name
  - Reset password
  - Toggle super user access
  - Activate/deactivate user
- Changes require confirmation before saving.

**Where to access**
- Admin backend: `https://booking.wolastoqcasino.ca/admin`
- Go to `System` -> `Users`
- Click `Edit / Reset` beside a user.

**Current role behavior**
- `Super user`: can manage admin users and reset passwords.
- `Admin`: can access the admin dashboard but cannot access the Users tab.

**Recommended next role tiers**
- `Super user`: full access, add/edit/remove users, reset passwords, assign roles.
- `Admin`: operational manager access, no user/role management.
- `Print staff`: limited access for printing/packaging workflows only.

**Save point**
- `19055fc` - Add admin user edit and password reset controls

### Move Booked Seats

**What changed**
- Admins and super users can move an active paid ticket to another vacant enabled seat in the same session.
- This avoids refunding and repurchasing just to change seats.
- The system:
  - Keeps the booking paid
  - Updates the ticket's assigned seat
  - Frees the old seat
  - Marks the new seat as sold
  - Refreshes seat maps
  - Writes an audit record
- Added regression coverage for the admin seat move API.

**Where to access: Sales & Transactions**
- Admin backend: `https://booking.wolastoqcasino.ca/admin`
- Go to `Bookings` / `Sales & Transactions`
- Open `Booking Sales`
- Click a session row or ticket count to open booking details.
- Click `Move Seat` beside an active paid ticket.
- Enter the target table number and chair number.
- Confirm the move.

**Where to access: Manage Chairs**
- Admin backend: `https://booking.wolastoqcasino.ca/admin`
- Go to `Bingo` -> `Manage Chairs`
- Select the session.
- Click a sold chair.
- Enter the target table number and chair number.
- Confirm the move.

**Rules**
- Target seat must be in the same session.
- Target seat must be vacant.
- Target seat must be enabled.
- Refunded tickets cannot be moved.
- Pending, failed, cancelled, refunded, or voided bookings cannot be moved.

**Save points**
- `b864659` - Allow admins to move booked seats
- `811a962` - Add seat move option to chair management

## How To Update This File

For each future change, add:
- Date
- Feature/issue name
- What changed
- Where to access it
- Any rules or limitations
- Verification performed
- Save-point commit hash
