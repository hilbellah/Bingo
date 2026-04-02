# Incident Response Runbooks

Quick reference guides for on-call engineers responding to common incidents.

## 1. Service Down (P1) - Bingo Booking System

**Severity**: P1 (Critical)  
**Response Time**: < 15 minutes  
**Decision Trees**: Use flowchart below to quickly identify issue

### Quick Diagnosis (First 5 minutes)

```
Is service completely unavailable?
  ↓ YES
  Is Render service running?
    ↓ Check: https://status.render.com
    ↓ YES → Application issue (see below)
    ↓ NO → Render is down (wait for status page, notify CEO)
  ↓ NO
  Is service extremely slow?
    ↓ See "Performance Degradation" runbook
```

### Application Issue Investigation

**Step 1: Check service status**
```bash
# Check if service is running
curl -s https://bingo-jk2h.onrender.com/health | jq '.'

# Expected response (healthy):
{
  "status": "ok",
  "timestamp": "2026-04-03T12:00:00.000Z",
  "uptime": 3600,
  "db": "connected"
}

# If timeout: Application not responding
# If db: disconnected → Database issue (see Database Runbook)
# If status: error → Application crash
```

**Step 2: Check recent deploys**
```bash
# View recent deployments
# Go to: https://dashboard.render.com
# Services → Wolastoq Bingo → Deployments tab
# Check: Did a deploy happen in last 30 minutes?
  ✓ YES → Check deploy logs for errors
  ✓ NO → Check application logs
```

**Step 3: Check application logs**
```bash
# View Render logs
# Dashboard → Wolastoq Bingo → Logs
# Look for: ERROR, crash, exception, panic
# Common issues:
  - Missing environment variable
  - Database file missing
  - Out of disk space
  - Port binding error
```

**Step 4: Check resource limits**
```bash
# In Render dashboard, check:
  - CPU usage (if maxed out, needs upgrade)
  - Memory usage (if maxed out, may have leak)
  - Disk space (check /app directory)
```

### Recovery Steps (In Priority Order)

#### Option A: Redeploy (Fast, if recent deploy caused issue)
```bash
# 1. Go to Render dashboard
# 2. Services → Wolastoq Bingo
# 3. Click "Manual Deploy" button
# 4. Wait 2-3 minutes for deployment
# 5. Verify health endpoint responds

# Why this works: Restarts process, clears memory leaks, redownloads code
# Risk: If deploy broke something, still won't work
# Time: 3-5 minutes
```

#### Option B: Rollback (If recent deploy caused issue)
```bash
# 1. Check recent deploys in Render
# 2. If broken deploy found:
#    - Note the working deploy commit hash
#    - Go to "Manual Deploy" 
#    - Paste previous working commit hash
# 3. Wait for deployment
# 4. Verify health endpoint

# Why this works: Returns to known-good state
# Risk: Loses recent changes
# Time: 3-5 minutes
```

#### Option C: Restart Service (If logs show memory/resource issue)
```bash
# 1. Render dashboard → Wolastoq Bingo service
# 2. Click "Suspend" button
# 3. Wait 10 seconds
# 4. Click "Resume" button
# 5. Wait 30 seconds for startup
# 6. Verify: curl /health

# Why this works: Clears memory, restarts all processes
# Risk: Brief downtime during restart
# Time: 1-2 minutes
```

### Escalation (If unable to resolve in 20 minutes)

1. Notify CTO immediately: "Service down, investigating, ETA 30 min"
2. Notify CEO if > 30 minutes unresolved
3. Consider: If payment processing broken → regulatory notification required

### After Resolution

1. Note resolution time and method
2. Investigate root cause in logs
3. Create ticket: "Post-incident: Improve X detection"
4. Schedule postmortem within 24 hours

---

## 2. Database Issues (P1/P2)

**Severity**: P1 if data loss; P2 if slow/errors  
**Impact**: Cannot book seats, data corruption  
**Recovery Time**: 5-30 minutes

### Quick Diagnosis

```bash
# Check database connection
curl -s https://bingo-jk2h.onrender.com/health | jq '.db'

# Result:
  "db": "connected" → Database working
  "db": "disconnected" → Cannot connect
  "db": "error" → Corruption or query failure
```

### Database Recovery Steps

#### If Cannot Connect (P1)

```bash
# Check 1: Verify database file exists
# SSH to Render instance (if available)
# Or check logs for: "database file not found"

# Potential causes:
  1. Database file corrupted
  2. Render instance out of disk space
  3. Permission denied on database file

# Recovery:
  Option A: Restore from backup
    - Check if automated backups exist
    - Contact Render support for restore
    - Time: 30-60 minutes
  
  Option B: Restart from seed
    - Trigger migration & seed:
      npm run migrate && npm run seed
    - Requires deploying code to run seed
    - Time: 5 minutes deployment + 5 min seed
    - Data Loss: All bookings lost (CRITICAL)
    
  Option C: Use last-known-good backup
    - Keep daily backups in storage
    - Restore and verify integrity
    - Time: 10-20 minutes
```

#### If Slow Queries (P2)

```bash
# Check for slow queries
# View logs for: "SELECT took Xms"

# Optimization steps:
  1. Check for missing indexes
     SELECT * FROM seats WHERE status = 'vacant'
     → Should be fast, check if indexed
  
  2. Check for N+1 queries
     → Are we fetching seats one by one instead of bulk?
  
  3. Check for full table scans
     → Is query filtering on indexed column?

# If slow:
  1. Add index: CREATE INDEX idx_seat_status ON seats(status)
  2. Redeploy with optimized query
  3. Monitor response times
```

#### If Data Corruption (P1)

```bash
# Signs of corruption:
  - Strange query results
  - Invalid seat numbers
  - Duplicate primary keys
  - Referential integrity errors

# Recovery:
  1. IMMEDIATELY: Take service into maintenance mode
     (Optional feature flag: DRY_RUN_MODE=true)
  
  2. Restore from last-known-good backup
  
  3. Investigate how corruption happened
     - Was there a crash during write?
     - Did someone run bad SQL?
     - Is there a code bug?
  
  4. Implement safeguards:
     - Add data validation
     - Add transaction safety checks
     - Increase backup frequency
```

### When to Escalate

- Corruption detected → Escalate to CTO immediately
- Backup unavailable → Escalate to DevOps
- Cannot restore within 30 min → Escalate to CEO

---

## 3. Performance Degradation (P2)

**Severity**: P2 (Major)  
**Response Time**: < 1 hour  
**Impact**: Slow booking, user frustration, possible abandonment

### Quick Diagnosis

```bash
# Check response times
# Datadog dashboard → Request Duration p95
# If p95 > 200ms: Performance issue

# Check error rate
# Datadog → Error Rate
# If > 5%: High error rate

# Check CPU/Memory
# Render dashboard → Metrics
# If CPU > 80% or Memory > 80%: Resource constrained
```

### Performance Recovery Steps

#### High CPU Usage

**Causes**:
- Too many concurrent requests
- N+1 query problem
- Inefficient algorithm
- Memory pressure causing GC thrashing

**Recovery**:
```bash
# Option A: Scale up service
  1. Render dashboard → Wolastoq Bingo
  2. Environment → Instance Type
  3. Upgrade to next tier (e.g., Standard → Pro)
  4. Cost: ~2-3x higher
  5. Time: 5 minutes deployment
  6. Use: If temporary traffic spike

# Option B: Optimize code
  1. Find slow endpoint using Datadog
  2. Add caching for frequent queries
  3. Batch N+1 queries
  4. Optimize database queries
  5. Time: 15-30 minutes + deploy
  6. Use: Permanent fix

# Option C: Limit incoming traffic
  1. Temporarily disable non-critical features
  2. Show "site busy" message for new bookings
  3. Implement rate limiting
  4. Time: Immediate
  5. Use: During peak loads
```

#### High Memory Usage

**Causes**:
- Memory leak in application
- Cache growing unbounded
- Large data structure held in memory

**Recovery**:
```bash
# Option A: Restart service
  1. Render dashboard → Suspend → Resume
  2. Clears all memory
  3. Time: 1-2 minutes
  4. Use: If memory gradually increases

# Option B: Deploy memory fix
  1. Identify leak source in logs
  2. Fix code (clear cache, limit size, etc.)
  3. Deploy fix
  4. Monitor memory trend
  5. Time: 10 minutes
  6. Use: Permanent fix

# Option C: Scale up memory
  1. Render → Instance Type → upgrade
  2. More memory = more breathing room
  3. Time: 5 minutes
  4. Cost: Higher
  5. Use: If memory is legitimately needed
```

#### Slow Database Queries

**Diagnosis**:
```bash
# Check Datadog logs for slow queries
# Look for: query_time > 100ms

# Slow query examples:
  ✗ SELECT * FROM seats WHERE held_until IS NOT NULL
    (no index, full table scan)
  
  ✓ SELECT * FROM seats WHERE session_id = ? AND status = ?
    (indexed, fast)
```

**Recovery**:
```bash
# Add index to slow query
db.exec('CREATE INDEX idx_seats_status ON seats(status)')

# Rewrite query for efficiency
# Instead of:
  SELECT * FROM seats s
  LEFT JOIN booking_items bi ON s.id = bi.seat_id
  (for each result manually)

# Do this:
  SELECT s.*, COUNT(bi.id) as bookings
  FROM seats s
  LEFT JOIN booking_items bi ON s.id = bi.seat_id
  GROUP BY s.id
```

### When to Escalate

- Cannot identify cause within 15 min → Escalate to Lead Engineer
- Affecting > 10% users → Notify CTO
- Persists > 1 hour → Escalate to CTO for code review

---

## 4. High Error Rate (P1/P2)

**Severity**: P1 if > 50%, P2 if > 5%  
**Response Time**: P1 < 15 min, P2 < 1 hour

### Diagnosis

```bash
# Check error rate in Datadog
# By error type:
  - 5xx errors: Application bug
  - 4xx errors: User input validation
  - Specific error: Search logs for exception

# Get error details
Datadog → Logs → error_type:ServerError
```

### Common Errors & Fixes

#### 500 Internal Server Error

**Cause**: Application crashed or threw exception

**Fix**:
```bash
# 1. Check logs for exception
#    Datadog → Logs → level:error
#    Look for: "Error: ..." or "Exception"

# 2. If database related:
#    See "Database Issues" runbook

# 3. If code issue:
#    - Identify affected endpoint
#    - Review recent changes to that endpoint
#    - Roll back or fix issue
#    - Deploy fix
```

#### 503 Service Unavailable

**Cause**: Health check failing, Render marking service as unhealthy

**Fix**:
```bash
# 1. Check service startup
curl https://bingo-jk2h.onrender.com/health

# If unresponsive:
#   → See "Service Down" runbook
```

#### 400 Bad Request

**Cause**: Client sent invalid request

**Fix**:
```bash
# Usually not a service issue
# But if > 10% of requests:
#   - Client code may have bug
#   - API contract may have changed
#   - Notify frontend team
```

### Escalation

- > 25% error rate → Immediate escalation to CTO
- > 50% error rate + P1 → Escalate to CEO
- Uncertain cause → Escalate to Lead Engineer

---

## 5. Incident Communication Template

**Use this template during incident response**:

```
[P1] INCIDENT: Booking system down
ETA Resolution: 30 minutes
Current Status: Investigating root cause
Last Update: 14:45 UTC

--- UPDATE 14:55 UTC ---
Root cause found: Database connection pool exhausted
Fix: Restarting service to clear connections
Expected resolution: 15:05 UTC

--- RESOLVED 15:05 UTC ---
Duration: 35 minutes
Root Cause: Connection pool not configured for production load
Resolution: Service restart, will configure pool in next deploy
Postmortem: Scheduled for April 4, 10:00 AM
```

---

## 6. Postmortem Template

**Create Google Doc with this format**:

```
INCIDENT POSTMORTEM

Date: April 3, 2026
Duration: 35 minutes
Severity: P1
Impact: Booking system unavailable, ~50 booking attempts failed

Timeline:
14:30 - Alert triggered (health check failed)
14:35 - On-call engineer acknowledged
14:40 - CTO notified
14:55 - Root cause: Connection pool exhausted
15:05 - Service restarted, restored to normal

Root Cause Analysis:
Production load exceeded configured connection pool size.
Configuration was set for development (10 connections), not production (100+ concurrent users).

Impact:
- 35 minutes of downtime
- ~50 failed booking attempts (~$500 revenue loss)
- User frustration, potential reputation damage

What Went Well:
+ Fast detection (5 min to alert)
+ Quick diagnosis (10 min to root cause)
+ Simple fix available (service restart)

What Could Be Better:
- Connection pool not right-sized for production
- No pre-deployment load testing
- No alerting on connection pool saturation

Prevention Actions:
1. [CRITICAL] Set connection pool to 50+ for production
   - Assign to: Lead Engineer
   - Due: April 4
   - Why: Prevent future saturation

2. [HIGH] Add alerting for connection pool > 80%
   - Assign to: DevOps
   - Due: April 5
   - Why: Early warning before failure

3. [MEDIUM] Implement load testing in CI/CD
   - Assign to: QA Lead
   - Due: April 10
   - Why: Catch config issues before production

Action Items Tracking:
- [ ] Action 1 (assigned, due date)
- [ ] Action 2 (assigned, due date)
- [ ] Action 3 (assigned, due date)

Participants:
- On-call: Engineer A
- CTO: [name]
- Reviewer: [name]
```

---

## Quick Links

- **Monitoring Dashboard**: https://app.datadoghq.com (configure after account setup)
- **Render Dashboard**: https://dashboard.render.com
- **Health Check**: https://bingo-jk2h.onrender.com/health
- **Source Code**: https://github.com/hilbellah/Bingo
- **Incident Channel**: Slack #incidents
- **On-Call Schedule**: Google Calendar (PHWA-OnCall-Schedule)

## Emergency Contacts

- **CTO**: [phone/slack]
- **Lead Engineer**: [phone/slack]
- **CEO**: [phone/slack]
- **Render Support**: [support@render.com]

---

**Last Updated**: April 3, 2026  
**Review Frequency**: Monthly or after each incident
