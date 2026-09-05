# Phase 2: Bingo System Enhancements
## Detailed Task Breakdown & Implementation Guide

**Status:** Ready for deployment on client approval  
**Parent Task:** [PHWA-54](/PHWA/issues/PHWA-54) (Bingo Full Build)  
**Dependency:** [PHWA-56](/PHWA/issues/PHWA-56) must be live (✅ Complete)  

---

## PHWA-59: Stripe Payment Integration

### Overview
Replace mock payment processing with live Stripe integration for real transaction handling.

### Requirements
- Integrate Stripe SDK for Node.js backend (`stripe` npm package)
- Create Stripe payment intent API endpoints
- Handle Stripe webhook events (payment.intent.succeeded, payment.intent.failed)
- Update React frontend checkout flow with Stripe Elements
- Store payment metadata and transaction records in database
- Update admin panel to display real payment status and revenue

### Implementation Steps

**Backend (Node.js/Express):**
1. Install Stripe: `npm install stripe`
2. Create `/api/checkout/create-intent` endpoint that:
   - Accepts booking details and total amount
   - Creates Stripe payment intent
   - Returns clientSecret to frontend
3. Create `/api/webhooks/stripe` endpoint for webhook events:
   - Verify webhook signature with Stripe secret
   - Update booking status on payment success
   - Handle payment failures and refunds
4. Add database migrations to track payment status:
   - `bookings.payment_status` field (pending, completed, failed)
   - `bookings.stripe_payment_id` field
   - `bookings.transaction_date` field

**Frontend (React):**
1. Install Stripe React: `npm install @stripe/react-stripe-js @stripe/js`
2. Wrap checkout with StripeProvider
3. Add StripeElements component to payment form
4. Replace mock payment button with real Stripe submission
5. Handle payment confirmation and error states

**Admin Panel:**
1. Add payment status filter to booking list
2. Display transaction date and payment ID
3. Add revenue summary showing total payments
4. Export transaction reports

### Testing
- Test with Stripe test keys and test cards
- Verify webhook receipt and database updates
- Test payment failures and refund handling
- Verify SSL/HTTPS requirement for Stripe

### Acceptance Criteria
- ✅ Real Stripe payments accepted in live system
- ✅ Webhook events processed correctly
- ✅ Database records updated on payment success
- ✅ Admin panel shows accurate payment status and revenue
- ✅ Transaction data exportable
- ✅ No customer payment data stored locally (PCI compliance)

**Estimated Duration:** 5-7 business days

---

## PHWA-60: Email Confirmation Notifications

### Overview
Implement SendGrid transactional email integration for automated booking confirmations and updates.

### Requirements
- Integrate SendGrid API for email delivery
- Send booking confirmation email with reference number and details
- Send booking cancellation confirmation email
- Send admin notification of new bookings
- Support HTML email templates
- Track email delivery status

### Implementation Steps

**Backend Setup:**
1. Install SendGrid: `npm install @sendgrid/mail`
2. Store SendGrid API key in environment variables
3. Create email service module: `src/services/emailService.js`

**Email Templates:**
1. Booking Confirmation Email:
   - Customer name and booking reference
   - Date, time, and seat details
   - Party size and total cost
   - Cancellation instructions
   - Link to view booking

2. Cancellation Confirmation Email:
   - Reference number
   - Cancellation date/time
   - Refund information
   - Support contact

3. Admin New Booking Notification:
   - Booking details summary
   - Customer contact info
   - Link to admin dashboard

**API Endpoints:**
1. POST `/api/email/send-confirmation` (triggered on booking completion)
2. POST `/api/email/send-cancellation` (triggered on booking cancellation)

**Database:**
1. Add `email_log` table:
   - `booking_id`, `email_type`, `recipient`, `status`, `sent_at`

### Testing
- Test email delivery with SendGrid sandbox
- Verify template rendering with test data
- Test with real email addresses
- Monitor delivery status and bounce rates

### Acceptance Criteria
- ✅ Confirmation emails sent automatically on booking
- ✅ Email contains accurate booking details
- ✅ Cancellation emails sent with refund info
- ✅ Admin notified of new bookings
- ✅ Email delivery tracked and logged
- ✅ No emails lost or duplicated

**Estimated Duration:** 3-4 business days

---

## PHWA-61: Customer Accounts & Login System

### Overview
Build customer registration and login system for viewing booking history and managing reservations.

### Requirements
- Customer registration with email/password
- Secure login with JWT authentication
- Customer dashboard showing booking history
- Ability to view and cancel own bookings
- Password reset functionality
- Session persistence

### Implementation Steps

**Backend (Authentication):**
1. Install dependencies: `npm install jsonwebtoken bcryptjs`
2. Create `customers` table:
   - `id`, `email`, `password_hash`, `name`, `created_at`
3. Create auth endpoints:
   - POST `/api/auth/register` - Create new account
   - POST `/api/auth/login` - Login and return JWT
   - POST `/api/auth/logout` - Clear session
   - POST `/api/auth/reset-password` - Password reset
4. Create JWT middleware for protected routes
5. Update booking routes to filter by customer ID

**Frontend (React):**
1. Create login/register pages
2. Add JWT token management (store in localStorage)
3. Create ProtectedRoute component
4. Build customer dashboard showing:
   - Past bookings
   - Upcoming bookings
   - Cancel booking option
   - Account settings
5. Add navigation to profile/account
6. Implement session persistence on page reload

**Database Migrations:**
1. Create `customers` table
2. Add `customer_id` foreign key to `bookings` table
3. Index on `customers.email` for login lookups

**Email Integration:**
1. Send welcome email on registration
2. Include password reset link in reset email
3. Require email verification (optional but recommended)

### Testing
- Test registration with valid/invalid emails
- Test login with correct/incorrect passwords
- Test JWT expiration and refresh
- Test password reset flow
- Test booking history accuracy
- Test cancellation from customer dashboard

### Acceptance Criteria
- ✅ Customers can register with email and password
- ✅ Login creates valid JWT token
- ✅ Customer dashboard shows accurate booking history
- ✅ Cancel booking works from customer dashboard
- ✅ Password reset email sent and works
- ✅ Session persists across page reloads
- ✅ Passwords securely hashed (bcrypt)

**Estimated Duration:** 7-10 business days

---

## PHWA-62: Production Domain & SSL Configuration

### Overview
Move Bingo system from Render's default domain (bingo-jk2h.onrender.com) to custom production domain.

### Requirements
- Register or transfer custom domain (e.g., bingo.smec.ca, bingo.wolastoq.ca)
- Configure DNS records to point to Render deployment
- Set up SSL/HTTPS certificate (auto with Render)
- Update all environment variables for production
- Verify security headers and HTTPS enforcement

### Implementation Steps

**Domain Setup:**
1. Determine domain name with client (e.g., bingo.smec.ca)
2. Register domain or transfer existing domain
3. Update Render environment with custom domain:
   - Settings → Custom Domains
   - Add domain name
   - Get verification instructions
4. Configure DNS records in domain registrar:
   - CNAME record: point subdomain to onrender.com
   - Or A record: point to Render IP (if available)
5. Verify DNS propagation (can take 24-48 hours)
6. Update SSL certificate (Render auto-provisions Let's Encrypt)

**Environment Configuration:**
1. Update `.env.production`:
   - `NEXT_PUBLIC_API_URL` → https://bingo.smec.ca
   - `DATABASE_URL` → Production database path
   - `ADMIN_USERNAME` → Production credentials
   - `ADMIN_PASSWORD` → Strong production password
   - `NODE_ENV` → production
2. Update Render environment variables in dashboard
3. Redeploy application with new environment

**Security Verification:**
1. Test HTTPS works (padlock icon in browser)
2. Verify all pages served over HTTPS
3. Check HTTP → HTTPS redirect
4. Verify security headers:
   - Strict-Transport-Security
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
5. Run SSL Labs test: https://www.ssllabs.com/ssltest/

**Application Updates:**
1. Update confirmation emails with production domain
2. Update admin dashboard links with production domain
3. Update any marketing materials with new domain
4. Test full booking flow on production domain

### Testing
1. Test website accessible via new domain
2. Verify all pages load correctly
3. Test booking flow end-to-end
4. Verify admin panel access
5. Test mobile responsiveness
6. Check email confirmations include correct domain
7. Monitor logs for any errors post-deployment

### Acceptance Criteria
- ✅ Custom domain resolves to Render deployment
- ✅ HTTPS/SSL working (green padlock)
- ✅ All content served over HTTPS
- ✅ HTTP → HTTPS redirect configured
- ✅ Security headers present and correct
- ✅ All internal links use HTTPS
- ✅ Email confirmations use production domain
- ✅ Admin credentials updated for production
- ✅ Zero downtime during configuration

**Estimated Duration:** 2-3 business days (+ 24-48h DNS propagation)

---

## Phase 2 Deployment Sequence

### Timeline
1. **Phase 2a (Stripe):** Weeks 1-2 (Days 1-7)
2. **Phase 2b (Email):** Weeks 2 (Parallel with 2a, Days 5-8)
3. **Phase 2c (Accounts):** Weeks 2-3 (Days 8-15)
4. **Phase 2d (Domain):** Week 3 (Days 16-18)

### Critical Path
- Stripe integration must complete before Phase 2b/2c
- Email integration can run in parallel with Stripe
- Customer accounts integration can start after Stripe (Week 2)
- Domain configuration is last (depends on all phases)

### Go-Live Checklist
- [ ] All Phase 2 tasks completed and tested
- [ ] Staging environment fully tested
- [ ] Production environment configured
- [ ] Backups configured and tested
- [ ] Monitoring alerts set up
- [ ] Support documentation prepared
- [ ] Team trained on new features
- [ ] Client approval for go-live
- [ ] DNS propagation verified (24-48h)

---

## Risk Mitigation

**Risks & Mitigations:**
1. **Stripe API delays** → Have alternative payment processors researched
2. **Email delivery issues** → Monitor SendGrid logs, test with real emails
3. **Customer data security** → Use bcrypt for passwords, HTTPS everywhere
4. **DNS propagation delays** → Prepare domain early, allow 48h buffer
5. **Database migration failures** → Test migrations in staging first

---

**Phase 2 Readiness:** ✅ ALL PREPARED  
**Trigger:** Client approval on Bingo UAT  
**Status:** Awaiting signal to deploy
