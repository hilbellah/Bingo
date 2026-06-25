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
- Full-booking refunds and voids processed directly in Authorize.Net are automatically linked back when Authorize.Net sends a signed webhook with the booking reference, or when the platform can resolve the booking reference from the transaction details.
- No-show handling does not yet support a formal credit workflow.
- Promo/donation seat blocking with assigned names is not built yet.
- Bulk-printed promo/donation tickets do not yet pull assigned-person names from a dedicated comp/hold workflow.
- Direct paid-order cancellation should be clarified as either refund/void, cancel-with-credit, or admin comp transfer.

**Requested future features**
- Move an order to a different seat. Status: fixed for active paid tickets in the same session.
- Cancel orders directly in the platform. Status: partially covered; needs clearer paid-order workflow.
- Handle no-shows via refund or credit. Status: refund covered when initiated in platform; credit not built.
- Block seats and assign names for promos/donations so bulk-printed tickets include the assigned person. Status: not built.
- Link external Authorize.Net refunds back to booking and seat status. Status: automated for signed full-booking refund/void webhooks with a resolvable booking reference.

**How to move a booked seat today**
- Use this when the customer is keeping the same paid order but needs a different chair.
- Option 1:
  - Go to `https://booking.wolastoqcasino.ca/admin`
  - Open `Bookings` / `Sales & Transactions`
  - Open `Booking Sales`
  - Click the session row or ticket count.
  - Find the ticket.
  - Click `Move Seat`.
  - Enter the new table number.
  - Enter the new chair number.
  - Confirm the warning prompt.
- Option 2:
  - Go to `https://booking.wolastoqcasino.ca/admin`
  - Open `Bingo` -> `Manage Chairs`
  - Select the correct session.
  - Click the sold chair that needs to move.
  - Enter the new table number.
  - Enter the new chair number.
  - Confirm the warning prompt.
- The target chair must be vacant and enabled.
- The system keeps the booking paid, frees the old chair, marks the new chair sold, and logs the move.

**How to refund or void inside the platform today**
- Use this when money should be returned through the admin platform, not directly through Authorize.Net.
- Go to `https://booking.wolastoqcasino.ca/admin`
- Open `Bookings` / `Sales & Transactions`
- Open the booking details from `Booking Sales` or the sold-ticket details.
- For a full booking refund/void, use the booking-level `Refund` action.
- For a single-ticket refund, use the ticket-level refund action beside that ticket.
- Confirm the warning prompt.
- The system checks Authorize.Net and chooses the valid action:
  - `Void` for unsettled payments.
  - `Refund` for settled payments.
- Seats tied to refunded/voided tickets are released by the platform.

**How direct Authorize.Net refunds are handled now**
- If a full booking is refunded or voided directly in Authorize.Net, Authorize.Net sends a webhook to the platform.
- When the webhook is signed and includes the booking reference, the platform automatically:
  - Marks the booking as `refunded` or `voided`
  - Marks the ticket items as refunded
  - Releases the seats
  - Refreshes the seat map
  - Logs the payment event and audit record
  - Sends the refund/void notification when email is configured
- If the webhook does not include the booking reference, the platform now tries to resolve the reference from Authorize.Net transaction details.
- Recommended staff workflow:
  - Prefer refunding/voiding from the admin platform when possible.
  - If a refund was done directly in Authorize.Net, wait briefly for the webhook to arrive.
  - Check `Bookings` / `Sales & Transactions` and confirm the booking changed to `refunded` or `voided`.
  - Check `Bingo` -> `Manage Chairs` and confirm the chair is vacant.
  - If the booking still shows paid and the chair still shows sold, the webhook likely did not contain a usable booking reference or was not delivered; correct it before reselling the seat.

**How to block overflow or unavailable chairs today**
- Go to `https://booking.wolastoqcasino.ca/admin`
- Open `Bingo` -> `Manage Chairs`
- Select the correct session.
- Click an available chair to disable it, or use the table/bulk controls for multiple chairs.
- Confirm the warning prompt.
- Disabled chairs cannot be purchased by customers.
- This only blocks availability. It does not assign a promo/donation name or create printable assigned tickets.

**What staff should not try yet**
- Do not use chair blocking as a replacement for named promo/donation tickets if the printed ticket must show a person's name.
- Do not promise a no-show credit workflow yet; credit handling is not built.
- Do not resell a chair after an external Authorize.Net refund until the platform shows the booking as refunded/voided and the chair as vacant.

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
- External Authorize.Net full-booking refund/void webhooks are automated and covered by regression tests. Staff should still verify the booking state before reselling a chair if the refund was done outside the admin platform.
- No-show credit workflow is not built.
- Promo/donation assigned-seat workflow is not built.
- Print-staff limited role is recommended but not built yet.

**Save point**
- `f463209` - Stabilize admin seat move checks and dependencies

### External Authorize.Net Refund Automation

**What changed**
- Strengthened the Authorize.Net webhook handler for external refund/void events.
- Signed `net.authorize.payment.refund.created` webhooks now automatically mark the matching booking as refunded and release the seats.
- Signed `net.authorize.payment.void.created` webhooks continue to mark the matching booking as voided and release the seats.
- If the webhook payload does not include the booking reference, the platform now attempts to resolve it from Authorize.Net transaction details before giving up.
- Full external refunds can now complete the remaining cleanup even if the booking was already `partially_refunded`.
- Added an automated regression check for an external Authorize.Net refund webhook releasing Table 44 Seat 1.

**How it works**
- Authorize.Net must be configured to send webhooks to:
  - `https://booking.wolastoqcasino.ca/api/webhooks/authorize-net`
- The webhook must be signed using the configured `ANET_SIGNATURE_KEY`.
- The webhook must include, or allow the platform to resolve, the booking reference number.
- When those conditions are met, no staff action is required to free the seat.

**Verification performed**
- `node scripts/authorize-net-refund-webhook-api-check.mjs`
- `npm run check`

**Save point**
- `edf4e4d` - Automate external Authorize.Net refund cleanup

### No-Show Credits, Promo/Donation Seats, and Print Staff Role

**What changed**
- Added a tracked no-show credit workflow for paid tickets.
- Added promo/donation assigned-seat ticket creation from `Manage Chairs`.
- Added a real `Print staff` admin role.
- Added database support for:
  - `customer_credits`
  - booking source labels such as `online`, `promo`, and `donation`
  - admin user roles: `super_user`, `admin`, `print_staff`
- Added Postgres migration `010_admin_roles_credits_assigned_tickets.sql`.
- Added automated regression coverage for all three workflows.

**How to issue a no-show credit**
- Go to `https://booking.wolastoqcasino.ca/admin`
- Open `Bookings` / `Sales & Transactions`.
- Open `Booking Sales`.
- Click the session row or ticket count.
- Find the active paid ticket.
- Click `No-Show Credit`.
- Enter the credit amount.
- Enter an optional note.
- Confirm the warning prompt.
- The platform creates a credit code and records it against the ticket.
- This does not refund Authorize.Net and does not change the paid booking status.

**How to assign a promo or donation seat**
- Go to `https://booking.wolastoqcasino.ca/admin`
- Open `Bingo` -> `Manage Chairs` or `Live Event / Venue` -> `Manage Chairs`.
- Select the correct session.
- Click an available chair.
- Type `P` to assign a promo ticket, or `N` to assign a donation ticket.
- Enter the person's first and last name.
- Enter an optional note.
- Confirm the warning prompt.
- The platform creates a zero-dollar paid ticket, marks the chair sold, and includes the assigned person in bulk printing.

**How to bulk print assigned promo/donation tickets**
- Go to `https://booking.wolastoqcasino.ca/admin`
- Open `Shared Operations` -> `Bulk Print`.
- Select the date or date range.
- Select the relevant department.
- Click `Load Tickets`.
- Promo/donation assigned seats appear with the assigned person's name.
- Print using `Print Special Paper` or `Print Thermal Copy`.

**How to create a print staff user**
- Sign in as a super user.
- Open `System` -> `Users`.
- Add or edit a user.
- Set `Role` to `Print staff`.
- Save the user.
- Print staff can access only:
  - `Shared Operations` -> `Bulk Print`
  - `System` -> `Printing Settings`
- Print staff cannot access management, live events, customer reports, sales reports, users, or chair management endpoints.

**Verification performed**
- `node scripts/admin-operations-workflows-api-check.mjs`
- `npm run check`

**Save point**
- `a97acf7` - Add admin credit assigned seat and print staff workflows

## How To Update This File

For each future change, add:
- Date
- Feature/issue name
- What changed
- Where to access it
- Any rules or limitations
- Verification performed
- Save-point commit hash
