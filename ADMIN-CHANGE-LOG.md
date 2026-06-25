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

### Seat Management for Live Event Bookings

**Case**
- Table 44 Seat 1 was booked by mistake.
- Refund was processed in Authorize.Net.
- Customer rebooked elsewhere.
- Interim workaround was to manually block a table for overflow.

**Current status**
- Partially addressed.

**Fixed**
- Authorized admin users can move an active paid ticket to a different vacant enabled seat in the same session.
- Seat move is available from:
  - `Bookings` / `Sales & Transactions` -> `Booking Sales` -> booking details -> `Move Seat`
  - `Bingo` -> `Manage Chairs` -> click a sold chair
- Moving a seat keeps the booking paid, frees the old seat, marks the new seat sold, refreshes seat maps, and writes an audit record.

**Partially covered**
- Platform refund/void exists for paid bookings and individual tickets when initiated from the admin system.
- Direct cancel exists for legacy/admin bookings without payment processor records.

**Not fully fixed yet**
- Refunds processed directly in Authorize.Net are not guaranteed to be linked back to the in-platform booking and seat state.
- No-show handling does not yet support a formal credit workflow.
- Promo/donation seat blocking with assigned names is not built yet.
- Bulk-printed promo/donation tickets do not yet pull assigned-person names from a dedicated comp/hold workflow.
- Direct paid-order cancellation should be clarified as either refund/void, cancel-with-credit, or admin comp transfer.

**Requested future features**
- Move an order to a different seat. Status: fixed for active paid tickets in the same session.
- Cancel orders directly in the platform. Status: partially covered; needs clearer paid-order workflow.
- Handle no-shows via refund or credit. Status: refund covered when initiated in platform; credit not built.
- Block seats and assign names for promos/donations so bulk-printed tickets include the assigned person. Status: not built.
- Link external Authorize.Net refunds back to booking and seat status. Status: not fully fixed.

**Timeline note**
- These changes were requested for follow-up after July 12; the current bingo/live event exposed the operational gap.

### System Stabilization Pass

**What changed**
- Ran a full health check before starting the next feature update.
- Confirmed existing platform features so future work does not duplicate what already exists:
  - Seat moves already exist for active paid tickets.
  - Platform refund/void already exists when initiated from admin.
  - Legacy/admin booking cancel exists for bookings without payment processor records.
  - Super user management exists for admin user edits and password resets.
- Updated server dependencies to clear production audit issues:
  - `multer` lockfile resolved to `2.2.0`
  - `nodemailer` updated to `^9.0.1`
- Strengthened the admin seat move API regression check to verify:
  - Successful seat move
  - Old seat is freed
  - New seat is sold
  - Cannot move to the same seat
  - Cannot move to an occupied/sold seat
  - Cannot move to a disabled seat

**Verification performed**
- `npm run check`
  - Syntax check passed
  - Production client build passed
  - Receipt rendering check passed
  - Smoke check passed
  - Hold config check passed
  - API regression suite passed
  - Client production audit passed with 0 vulnerabilities
  - Server production audit passed with 0 vulnerabilities

**Remaining known gaps**
- External refunds made directly in Authorize.Net still need live/payment-event verification before relying on them to update seat state automatically.
- No-show credit workflow is not built.
- Promo/donation assigned-seat workflow is not built.
- Print-staff limited role is recommended but not built yet.

**Save point**
- `f463209` - Stabilize admin seat move checks and dependencies

## How To Update This File

For each future change, add:
- Date
- Feature/issue name
- What changed
- Where to access it
- Any rules or limitations
- Verification performed
- Save-point commit hash
