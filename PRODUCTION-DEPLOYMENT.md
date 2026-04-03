# Production Deployment Runbook

**Step-by-step guide for deploying Bingo system to production on Render.com**

> **Status**: Ready to execute immediately  
> **Estimated Time**: 30 minutes setup + 5 minutes deployment  
> **Pre-requisites**: Render account, GitHub repo access, admin credentials ready

---

## Pre-Deployment Checklist (Do This First)

- [ ] Read this entire runbook
- [ ] Have DEPLOYMENT-CHECKLIST.md open for post-deployment verification
- [ ] Have admin username and password ready (strong passwords, 12+ chars)
- [ ] Ensure you have Render account access
- [ ] Ensure you have GitHub access to hilbellah/Bingo repo
- [ ] Alert team: "Deployment starting in 5 minutes"

---

## Step 1: Verify Code is Ready

**Check GitHub for latest code:**

```bash
# The code should have these commits:
# - 013e6ea: Graceful shutdown fix
# - 0173316: Datadog setup guide  
# - ffec1af: Team training guide
# (Earlier commits for monitoring, logging, health endpoint)
```

**Go to**: https://github.com/hilbellah/Bingo/commits/main

Expected: All recent commits should be merged and main branch should be green

---

## Step 2: Access Render Dashboard

1. Navigate to: https://dashboard.render.com
2. Sign in to your Render account (or create free account)
3. Click **New +** button (top right)
4. Select **Blueprint**

---

## Step 3: Connect GitHub Repository

1. Click **Connect Repository**
2. Search for or select: `hilbellah/Bingo`
3. Click **Connect**

**Expected result**: Render detects `render.yaml` and shows configuration

---

## Step 4: Review Auto-Detected Configuration

Render should automatically detect:
- **Service name**: Wolastoq Bingo
- **Build command**: `npm install`
- **Start command**: `npm start`
- **Instance**: Free tier (fine for launch)

✅ If all correct, proceed to next step  
❌ If anything is wrong, contact CTO before continuing

---

## Step 5: Set Environment Variables

Before clicking Deploy, you MUST set admin credentials:

1. Look for **Environment Variables** section
2. Add these variables:

```env
ADMIN_USERNAME=<choose-strong-admin-login>
ADMIN_PASSWORD=<choose-strong-admin-password>
NODE_ENV=production
LOG_LEVEL=info
```

**⚠️ CRITICAL**: 
- Use STRONG passwords (12+ chars, mixed case, numbers, symbols)
- Write these down securely - you'll need them for admin access
- Never commit credentials to GitHub
- After deployment, save credentials in password manager

**Example (DO NOT USE THESE)**:
```env
ADMIN_USERNAME=admin_bingo_prod_2026
ADMIN_PASSWORD=K9@mL#pQx2Rvs!8Dz
```

---

## Step 6: Deploy to Production

1. Click **Apply** button
2. Render will start building and deploying
3. Wait for deployment to complete (3-5 minutes)

**Deployment stages:**
- Building... (1-2 min)
- Deploying... (2-3 min)
- Live! (when you see green checkmark)

**Do NOT close this page during deployment**

---

## Step 7: Get Your Production URL

Once deployed, Render will assign a URL:

```
https://bingo-XXXXX.onrender.com
```

**Save this URL** - this is your production website

---

## Step 8: Immediate Post-Deployment Verification

### Quick Health Check (Do this immediately)

```bash
curl https://bingo-XXXXX.onrender.com/health
```

**Expected response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-04-03T00:30:00Z",
  "uptime": 120,
  "db": "connected"
}
```

✅ If you see this: **System is live!**

❌ If you get error or timeout: **Contact CTO immediately**

### Visual Verification

1. Open browser: https://bingo-XXXXX.onrender.com
2. Check that page loads (should see bingo interface)
3. Wait 10 seconds for styles to load
4. Verify layout looks correct (not broken)

---

## Step 9: Run Full Deployment Checklist

Use **DEPLOYMENT-CHECKLIST.md** for comprehensive verification:

1. Open DEPLOYMENT-CHECKLIST.md from repository
2. Go through "Post-Deployment Verification" section
3. Run all tests:
   - [ ] Service Health Check
   - [ ] Application Functionality Tests
   - [ ] Performance Validation
   - [ ] Security Checks
4. Document any issues found

---

## Step 10: Announce Go-Live

Once all checks pass, post in #announcements:

```
🎉 LIVE: Bingo booking system is now in production!
📍 URL: https://bingo-XXXXX.onrender.com
✅ Health: All systems green
⏱️ Uptime: 99.5% SLA
🔐 Admin access: [contact for credentials]

Users can now book seats for upcoming sessions.
```

---

## Post-Deployment Operations (First 24 Hours)

### Immediate (Hour 1)

- [ ] Monitor Render logs for errors
- [ ] Verify users can access the site
- [ ] Check that database saves are working (make test booking)
- [ ] Monitor error rate (should be 0%)

**Command to view logs:**
1. Render dashboard → Wolastoq Bingo service
2. Click **Logs** tab
3. Look for any ERROR or WARN messages
4. Healthy logs show info-level messages only

### Short-term (First 24 Hours)

- [ ] Set up Datadog monitoring (PHWA-101)
- [ ] Configure on-call rotation (PHWA-103)
- [ ] Alert team to test booking system
- [ ] Monitor performance metrics

### Ongoing (Week 1+)

- [ ] Check health endpoint daily
- [ ] Monitor error rates
- [ ] Verify uptime > 99.5%
- [ ] Collect user feedback
- [ ] Plan next features

---

## Troubleshooting

### Deployment Failed

**Symptom**: Render shows red error during build

**Check**:
1. Render logs for build error
2. Are all environment variables set?
3. Is GitHub repo accessible?

**Fix**:
1. Click **Retry Deploy**
2. If still fails, contact CTO
3. Potential issue: missing secrets or code error

### Service Down After Deployment

**Symptom**: Health endpoint returns 503 or timeout

**Check**:
1. Render service status (green/yellow/red)
2. Check logs for errors
3. Is database initialized?

**Fix**:
1. Try: Render dashboard → Suspend → Resume
2. Wait 1 minute for restart
3. Test health endpoint again
4. If still down, contact CTO

### Admin Login Not Working

**Symptom**: Admin username/password not accepted

**Check**:
1. Are credentials correctly set in env vars?
2. Spelling? Case-sensitive? Trailing spaces?

**Fix**:
1. Go to Render → Environment → Edit
2. Verify ADMIN_USERNAME and ADMIN_PASSWORD
3. Restart service: Suspend → Resume
4. Test login again

### Database Not Saving

**Symptom**: Data entered but not persisting after reload

**Check**:
1. Health endpoint - db connected?
2. Any errors in logs?
3. Disk space on Render?

**Fix**:
1. Check logs for database errors
2. Restart service
3. Contact CTO if persists

---

## Rollback Plan

**If critical issue found:**

### Immediate Rollback (If Service Down)

1. Render dashboard → Wolastoq Bingo
2. Click **Suspend** to take offline
3. Post status: "Service temporarily down for maintenance"
4. Contact CTO to diagnose

### Redeploy Previous Version

1. Render dashboard → Deployments tab
2. Find last successful deploy
3. Click **Redeploy**
4. Service will revert to previous version
5. Time to rollback: 2-3 minutes

### Full Restart

1. Delete Render service (nuclear option)
2. Redeploy from scratch using this runbook
3. Data is preserved (SQLite database)
4. Time: 10-15 minutes

---

## Success Criteria

✅ **Deployment is successful when:**

- [ ] Health endpoint returns 200 OK
- [ ] Website loads in browser
- [ ] Sessions display correctly
- [ ] No red errors in logs
- [ ] Admin can log in
- [ ] Test booking can be created
- [ ] DEPLOYMENT-CHECKLIST.md all items pass

---

## Support & Escalation

**Issues?** Contact in this order:

1. **First**: Check logs (Render dashboard → Logs)
2. **Then**: Review DEPLOYMENT-CHECKLIST.md
3. **Stuck?**: Contact CTO
   - Available 24/7 for production issues
   - Can diagnose and fix deployment problems

---

## What Happens Next

Once live:

1. **Week 1**: 
   - Monitor uptime (should be 99.5%+)
   - Set up Datadog monitoring
   - Activate on-call rotation

2. **Week 2-4**:
   - Deploy monitoring dashboards
   - Train team on incident response
   - Gather user feedback

3. **Month 2**:
   - Plan feature enhancements
   - Optimize based on usage data
   - Plan Q3 roadmap items

---

## Congratulations! 🎉

You've successfully deployed a production system with:
- ✅ Health monitoring
- ✅ Structured logging
- ✅ Graceful shutdown
- ✅ Error handling
- ✅ Database optimization

The system is ready to serve customers.

---

**Document Version**: 1.0  
**Last Updated**: April 3, 2026  
**CTO Approval**: ✅ APPROVED  
**Estimated Deployment Time**: 30 minutes
