# Bingo System - Production Deployment Checklist

**CTO Verification for Production Readiness**

---

## Pre-Deployment Code Review ✅

### Backend (Node.js/Express)
- [x] Health endpoint implemented (`GET /health`)
- [x] Error handling implemented
- [x] Database connection pooling configured
- [x] Structured JSON logging enabled
- [x] Environment variables documented
- [x] No hardcoded secrets or credentials
- [x] Dependencies are pinned and vetted
- [x] Database migrations created and tested

### Frontend (Vite + React)
- [x] Production build verified locally
- [x] Build artifacts minified and optimized
- [x] No console.log or debug code in production
- [x] Error boundaries implemented
- [x] API endpoints point to production URL
- [x] Environment variables properly substituted

### Database
- [x] SQLite database properly initialized
- [x] Schema version tracked
- [x] Backup strategy documented
- [x] Sample data seeded

---

## Render.com Deployment Checklist

### Account Setup (Board/Operator)
- [ ] Create Render account at https://render.com
- [ ] Login to dashboard
- [ ] Review pricing tier (free tier available)

### GitHub Connection
- [ ] Verify GitHub repo is public: `hilbellah/Bingo`
- [ ] Grant Render access to GitHub repository
- [ ] Verify Render can access all branches

### Blueprint Deployment
- [ ] Navigate to Render dashboard: https://dashboard.render.com
- [ ] Click **New +** button
- [ ] Select **Blueprint** (auto-detects render.yaml)
- [ ] Select repository: `hilbellah/Bingo`
- [ ] Confirm `render.yaml` configuration is detected

### Environment Variables (CRITICAL)
Before deploying, set these environment variables in Render:

```
ADMIN_USERNAME = [set strong admin login]
ADMIN_PASSWORD = [set strong admin password]
NODE_ENV = production
LOG_LEVEL = info
```

⚠️ **Important**: Use strong, unique passwords (minimum 12 characters)

### Deploy
- [ ] Click **Apply** button
- [ ] Wait for deployment to complete (3-5 minutes)
- [ ] Monitor build logs for errors
- [ ] Verify no build errors occurred

---

## Post-Deployment Verification (Board/Operator)

### Service Health Check
```bash
# Check if service is running
curl https://bingo-XXXXX.onrender.com/health

# Expected response (200 OK):
{
  "status": "ok",
  "timestamp": "2026-04-03T12:00:00.000Z",
  "uptime": 120,
  "db": "connected"
}
```

### Application Functionality Tests

#### Test 1: View Sessions
1. Open https://bingo-XXXXX.onrender.com in browser
2. Verify page loads
3. Check that upcoming sessions are displayed
4. Verify session dates and times are shown

#### Test 2: Test Booking Flow
1. Click on a session to view available seats
2. Verify seat table displays correctly
3. Try to select a seat (may need to create booking)
4. Verify seat locking works (status shows as held)

#### Test 3: Verify Admin Access
1. Note the admin username/password used during deployment
2. Look for admin login option in app
3. If available, test admin login credentials
4. Verify admin can view stats/bookings

#### Test 4: Database Connection
1. Health endpoint returned `"db": "connected"` ✓
2. Sessions are loading (Test 1) ✓
3. Seats are displaying (Test 2) ✓
4. All indicates database is working

### Performance Validation

**Response Time Check**:
```bash
# Test API response time
time curl https://bingo-XXXXX.onrender.com/api/sessions

# Expected: < 500ms response time
```

**Page Load Check**:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Reload page
4. Check Load Time: Should be < 3 seconds
5. Check resources: Should see .js, .css, and static assets

**Error Check**:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Verify no red error messages
4. Verify no 4xx or 5xx HTTP errors

---

## Security Checks

- [ ] HTTPS is enforced (Render provides free SSL)
- [ ] Admin credentials are strong (12+ chars, mixed case, numbers)
- [ ] No sensitive data in git history (checked via `git log`)
- [ ] No API keys or secrets in code
- [ ] Environment variables are not logged
- [ ] CORS is configured appropriately

---

## Documentation Verification

- [x] DEPLOYMENT.md - Deployment instructions
- [x] MONITORING-SETUP.md - Monitoring configuration
- [x] INCIDENT-RUNBOOKS.md - Incident procedures
- [x] README.md - Project overview
- [x] Database schema documented
- [x] API endpoints documented

---

## Known Issues & Limitations

### Current (Production Ready)
- ✓ Booking system working
- ✓ Session management working
- ✓ Database functioning
- ✓ Health checks in place

### Future Improvements (Post-Launch)
- Payment processing integration
- Email notifications
- SMS alerts
- Advanced reporting
- Analytics dashboard
- User authentication system

### NOT in MVP (Will not block deployment)
- Mobile app
- Video recording
- Advanced scheduling rules

---

## Rollback Plan

**If deployment fails or critical issues found:**

1. Keep note of current production URL
2. If needed, delete Render service and redeploy
3. Previous commits available on GitHub for fallback
4. Database can be restored from backup (if configured)

**Estimated rollback time**: 5-10 minutes

---

## Success Criteria

✅ **Deployment is successful when:**
1. Health endpoint returns 200 OK
2. Website loads without errors
3. Sessions are displayed
4. Seats can be viewed
5. No errors in browser console
6. Response times are < 3 seconds
7. Admin can access system (if implemented)
8. All tests above pass

❌ **Do NOT go live if:**
1. Health endpoint returns 503 or error
2. Database connection fails
3. Console shows red errors
4. Sessions don't load
5. Response times > 5 seconds
6. Admin credentials not set

---

## Post-Deployment (Day 1)

### Monitoring
- [ ] Monitor service logs for first 24 hours
- [ ] Check uptime and performance metrics
- [ ] Monitor error rate (should be 0% initially)
- [ ] Verify users can complete bookings

### Communication
- [ ] Share live URL with stakeholders
- [ ] Announce successful deployment
- [ ] Provide admin credentials securely to authorized users
- [ ] Schedule team debrief/retrospective

### Next Steps
- [ ] Set up Datadog monitoring (PHWA-101)
- [ ] Configure on-call rotation (PHWA-103)
- [ ] Plan feature enhancements
- [ ] Gather user feedback

---

## CTO Approval

**Code Review**: ✅ APPROVED by CTO
- Production-ready code
- All critical checks passed
- Safe to deploy

**Blockers**: ⏳ Awaiting Render deployment by board

**Support**: CTO available for:
- Deployment troubleshooting
- Emergency rollback if needed
- Production incident response
- System monitoring and alerting setup

**Contact**: CTO on-call for deployment support

---

**Document Version**: v1.0  
**Last Updated**: April 3, 2026  
**CTO Approval Date**: April 3, 2026
