# On-Call Rotation - Team Training Guide

**Complete guide for engineers implementing and operating the on-call rotation system**

---

## Table of Contents

1. [Overview](#overview)
2. [Setup Instructions](#setup-instructions)
3. [Your First On-Call Shift](#your-first-on-call-shift)
4. [Incident Response Walkthrough](#incident-response-walkthrough)
5. [Common Scenarios](#common-scenarios)
6. [Testing Your Setup](#testing-your-setup)
7. [FAQ & Troubleshooting](#faq--troubleshooting)

---

## Overview

### What is On-Call?

Being "on-call" means you're the first responder for production issues during your assigned shift (Monday 9am - Monday 9am UTC, one week at a time).

**Your responsibilities:**
- Monitor for alerts/issues
- Respond to incidents within SLA (P1: <15 min, P2: <1 hour)
- Investigate and resolve (or escalate)
- Document and postmortem

**You're not alone:**
- Backup on-call engineer is available for support
- CTO is escalation point for complex issues
- CEO is final escalation for business-critical issues

### Severity Levels Quick Reference

| Level | Impact | Response Time | Example |
|-------|--------|---------------|---------|
| **P1** | Service down | < 15 minutes | Bingo booking broken |
| **P2** | Degraded | < 1 hour | API slow (>200ms) |
| **P3** | Minor | < 4 hours | Typo in UI |

---

## Setup Instructions

### Step 1: Get Calendar Access

**What**: You'll be notified 24 hours before your shift starts via email

**How to prepare**:
1. Add `PHWA-OnCall-Schedule` to your Google Calendar
2. Enable notifications for the event (1 day before)
3. Note your assigned week

**Example**:
```
Week of April 7: You're Primary (Engineer A is Backup)
- Sunday April 6 at 9am: Reminder email
- Monday April 7 at 9am: Your shift starts
```

### Step 2: Request Access

You'll need access to:
- [ ] Render.com dashboard (ask manager)
- [ ] Datadog account (once configured)
- [ ] GitHub repository
- [ ] Database credentials (read-only)
- [ ] Slack #incidents channel (join)

**Request checklist**:
```
From: [Your name]
To: [Manager]
Subject: On-Call Access Request

Please grant me:
- Render dashboard read access
- Datadog viewer access
- GitHub bingo repo read access
- Slack #incidents channel invite
- DB read-only credentials

Starting: [Your shift date]
```

### Step 3: Set Up Your Alerts

**Mobile notifications**:
1. Install Slack app on phone
2. Enable notifications for #incidents channel
3. Test with: `@yourself test alert`

**Email alerts**:
1. Add work email to alert distribution list
2. Create email filter: Priority = High/Critical

**Optional - Chat bot integration**:
- Ask DevOps about SMS alerts for P1 incidents

### Step 4: Test Your Setup

**Before your shift:**
1. Test Render dashboard access
2. Verify you can view logs
3. Check health endpoint: `curl https://bingo-jk2h.onrender.com/health`
4. Test Slack notifications
5. Review incident runbooks

---

## Your First On-Call Shift

### Day Before (Sunday)

- [ ] Review on-call procedures one more time
- [ ] Ensure mobile notifications are working
- [ ] Check weather/plans (you may need to respond quickly)
- [ ] Get CTO contact info
- [ ] Share your contact with backup engineer

### First Day (Monday 9am UTC)

**Morning checklist**:

```bash
# 1. Verify you can access monitoring dashboard
curl https://bingo-jk2h.onrender.com/health
# Should return: {"status": "ok", ...}

# 2. Check Render service status
# https://dashboard.render.com → Wolastoq Bingo → Logs

# 3. Review Datadog dashboard (when available)
# Look for: any alerts, errors, or anomalies

# 4. Announce in #incidents channel:
# "Good morning! On-call starting now. [Your name] primary, [Backup] backup. Contact: +1-XXX-XXXX"
```

### During Your Shift

**You are primary responder for**:
- Alerts from monitoring system
- Slack mentions in #incidents
- Direct messages from stakeholders
- Health check failures

**Response expectations**:
- P1 incident: Acknowledge within 5 minutes
- P2 incident: Respond within 30 minutes
- P3 incident: Create ticket, no urgency

### End of Shift (Next Monday 9am UTC)

**Handoff checklist**:

```
Post in #incidents:
"End of shift handoff. Total incidents this week: X
- P1: [count, avg resolution X minutes]
- P2: [count]
- P3: [count]

Key learnings: [brief notes]

Handing off to: [Next engineer name]. Contact: +1-XXX-XXXX"

Send message to next engineer:
"You're on-call starting now. No critical issues. Last incident was on [date]. Service is healthy. Good luck!"
```

---

## Incident Response Walkthrough

### Scenario 1: You Get an Alert

```
[9:15 AM] Slack alert: "@oncall CRITICAL: Health check failed"

STEP 1: ACK IT (5 minutes)
└─ In #incidents: "Acknowledged. Investigating."
└─ Note time received

STEP 2: DIAGNOSE (5-15 minutes)
└─ Check: https://bingo-jk2h.onrender.com/health
   └─ Returns 503? → Database issue
   └─ Timeout? → Service crashed
   └─ 200 OK? → False alarm, dismiss
└─ Check logs in Render dashboard
└─ Check Datadog for errors

STEP 3: REPORT (Immediately)
└─ In #incidents: "Found issue: [description]"
└─ If obvious fix: Implement
└─ If unclear: Post: "Escalating to CTO for guidance" + @CTO

STEP 4: FIX IT (Varies)
└─ P1: Try quick fix (restart, rollback)
└─ If fix takes > 20 min: Notify CTO + CEO
└─ Once fixed: Test the health endpoint again
└─ Verify service is stable

STEP 5: REPORT RESOLUTION (Immediately)
└─ In #incidents: "[RESOLVED] Service is back. Fix was: [brief description]"
└─ Duration: X minutes
└─ Root cause: [what caused it]
```

### Scenario 2: You Receive Direct Message

```
[2:30 PM] Message from stakeholder:
"The booking page is loading really slow for me"

STEP 1: ACKNOWLEDGE
└─ "Thanks for reporting. Let me investigate."

STEP 2: VERIFY
└─ Check your own access: https://bingo-jk2h.onrender.com
└─ Load time: < 3 seconds? Normal
└─ Load time: > 5 seconds? Investigate
└─ Check Datadog response times

STEP 3: DETERMINE SEVERITY
└─ Affecting all users? P1/P2
└─ Affecting one user? P3
└─ Only during peak hours? P2

STEP 4: RESPOND
└─ If P1/P2 + no fix: Post in #incidents, investigate
└─ If P3: Create ticket, acknowledge to user
└─ If local user issue: Suggest clearing cache, restart browser
```

### Scenario 3: During a P1 Incident

```
Timeline Example:

14:30 - ALERT: Service down
14:32 - You: ACK in Slack
14:35 - You: Root cause found (bad deploy)
14:38 - CTO Notified via Slack ping
14:40 - You: Begin rollback
14:45 - SERVICE RESTORED
15:00 - You: Post resolution in #incidents
15:30 - Create postmortem doc
16:00 - Schedule postmortem meeting with team

[In #incidents channel]
14:32 - "Acknowledged. Service down, investigating"
14:35 - "Found: Deployment #245 broke API. Rolling back now."
14:40 - "@CTO Can you validate rollback approach?"
14:45 - "[RESOLVED] Service restored. Duration: 15 min. Cause: Deploy. Action: Review deploy checklist"
```

---

## Common Scenarios

### Scenario A: Slow Database Queries

**Symptoms**: API responding 500+ ms, timeout errors

**Quick Diagnosis**:
```bash
# Check database health
curl https://bingo-jk2h.onrender.com/health
# If db: disconnected → Database Issue

# Check error logs
# Datadog → Logs → "query timeout" or "connection refused"
```

**Fix Options**:
1. Restart service (clears connection pool)
2. Scale up database connection limit
3. Optimize slow query (if known)

**Escalate if**: Can't restart or restart doesn't help → CTO

---

### Scenario B: Memory Leak / Out of Memory

**Symptoms**: Service keeps getting slower, eventually crashes

**Quick Diagnosis**:
```bash
# Check Render metrics
# Render dashboard → Metrics → Memory Usage
# If trending upward → Memory leak

# Check logs for "OutOfMemory" or "heap"
```

**Fix Options**:
1. Restart service (immediate, clears memory)
2. Deploy fix for leak (requires code change)
3. Scale up to instance with more memory (temporary)

**When to restart**: Memory > 90%

---

### Scenario C: Recent Deploy Broke Something

**Symptoms**: Issue appeared in last 30 minutes, recent deploy happened

**Quick Diagnosis**:
```bash
# Check recent deployments
# Render dashboard → Deployments tab
# Is there a recent deploy?

# Check deploy logs for errors
```

**Fix Options**:
1. Rollback to previous commit
2. Fix the issue and redeploy
3. Disable feature temporarily with feature flag

**Recommended**: Rollback first (faster), fix/improve later

---

### Scenario D: Third-Party Service Down (e.g., Database can't reach external API)

**Symptoms**: 
- Error logs show "Connection refused" to external service
- Service functionality works, but features relying on external service fail

**Quick Diagnosis**:
- Check external service status page
- Check if firewall/network is blocking access
- Verify API keys are still valid

**Fix Options**:
1. If service is down: Wait for it to recover, no action needed
2. If API key expired: Update env variable, restart
3. If network issue: Contact DevOps/infrastructure team

**Escalate if**: Don't know what external service failed → CTO

---

## Testing Your Setup

### Pre-Shift Testing Checklist

**Do this before your shift starts:**

```bash
# TEST 1: Health endpoint
curl https://bingo-jk2h.onrender.com/health
# Expected: 200 OK, status: "ok"
# If fails: Service is down, contact CTO

# TEST 2: Render dashboard access
# Go to: https://dashboard.render.com
# Can you see logs and metrics?
# If no: Request access from manager

# TEST 3: GitHub access
# Go to: https://github.com/hilbellah/Bingo
# Can you view code?
# If no: Request access from manager

# TEST 4: Slack notifications
# Ask someone to message #incidents
# Did you get notified on phone?
# If no: Check phone notification settings

# TEST 5: Run through incident response
# Walkthrough: What would you do if service was down?
# Keep incident runbooks open
```

### During-Shift Testing (Optional)

**If nothing is happening:**

```bash
# Test 1: Practice reading logs
# Go to Render → Logs
# Can you identify:
#   - Normal startup logs?
#   - Error messages?
#   - Request latency?

# Test 2: Practice with Datadog (once configured)
# Learn where to find:
#   - Error rate dashboard
#   - Response time metrics
#   - Log search interface

# Test 3: Review incident runbooks
# Read through:
#   - Service down checklist
#   - Database issues procedures
#   - Performance degradation guide

# Keep learning: Every on-call shift teaches you something new
```

---

## FAQ & Troubleshooting

### Q: What if I can't reach someone when I need to escalate?

**A**: Escalation timeout procedure:
- Try to reach CTO: If no response in 15 minutes → Try CEO
- Try to reach CEO: If no response in 30 minutes → Mark as escalation failure, document in #incidents

**Prevent this**: Make sure contact numbers are current

---

### Q: What if an alert fires but the service is actually fine?

**A**: 
1. Check the alert condition in Datadog
2. If false positive, manually dismiss it
3. Post in #incidents: "Alert dismissed - false positive. [Brief reason]"
4. Create ticket to fix alert (if recurring problem)

---

### Q: Can I fix issues by modifying the database directly?

**A**: 
- **NO** - Never modify production database directly
- Always deploy code changes through normal process
- If emergency required: Contact CTO before any DB changes

---

### Q: What if I don't know how to fix something?

**A**: 
1. Don't panic - admitting you need help is fine
2. Post in #incidents: "Issue found but need CTO guidance"
3. Share:
   - What you found
   - What you've already tried
   - Error messages/logs
4. Tag CTO: `@CTO Blocked on [description]`
5. Continue investigating while waiting

---

### Q: Can I hand off to backup mid-shift if something comes up?

**A**: 
- **Minor issue**: You're still primary, backup can advise
- **Major incident**: Backup can take over while you hand off details
- **Personal emergency**: Tell manager + backup, pass off shift
- **Always inform #incidents channel** of any handoff

---

### Q: How do I access database for debugging?

**A**: 
- Database is SQLite in the application
- You have **read-only** access
- Commands: `sqlite3 bingo.db "SELECT * FROM sessions LIMIT 5"`
- **Never run INSERT/UPDATE/DELETE** without CTO approval

---

### Q: What if there are multiple issues at once?

**A**: 
1. Assess severity of each (P1/P2/P3)
2. Work on P1 first
3. Ask backup to help with P2
4. Post status updates every 15 minutes
5. Escalate if overwhelmed

---

### Q: Is there a log of past incidents I can learn from?

**A**: 
- Postmortems are stored in: [Google Drive folder - TBD]
- Read past postmortems to learn what happened
- Look for patterns of repeated issues
- Suggest improvements in team meetings

---

## Quick Reference Cards

### Incident Response Checklist (Laminate this!)

```
ALERT RECEIVED
└─ [ ] Acknowledge in Slack (5 min)
└─ [ ] Check health endpoint
└─ [ ] Check Render logs
└─ [ ] Check Datadog (if available)

DIAGNOSIS COMPLETE
└─ [ ] Post findings in #incidents
└─ [ ] Implement fix OR escalate
└─ [ ] Test fix
└─ [ ] Post resolution
└─ [ ] Note root cause

POST-INCIDENT
└─ [ ] Create postmortem doc (P1 only)
└─ [ ] Schedule postmortem meeting
└─ [ ] Add action items
```

### Emergency Contact Card

```
Primary On-Call: [Your name]
Phone: [Your number]
Slack: [Your handle]

Backup On-Call: [Name]
Phone: [Number]
Slack: [Handle]

CTO: [Name]
Phone: [Number]
Slack: [Handle]

CEO: [Name]
Phone: [Number]
Slack: [Handle]

Service Health: https://bingo-jk2h.onrender.com/health
Render Dashboard: https://dashboard.render.com
Datadog: https://app.datadoghq.com
GitHub Repo: https://github.com/hilbellah/Bingo
```

---

## Next Steps

1. **Week Before Your Shift**: Read this guide completely
2. **Day Before**: Run through testing checklist
3. **Shift Starts**: Follow incident response procedures
4. **Shift Ends**: Document learnings, handoff to next engineer
5. **Post-Shift**: Participate in postmortem if P1 incident occurred

**Questions?** Ask in #engineering-support or contact CTO

---

**Last Updated**: April 3, 2026  
**Version**: 1.0  
**Audience**: All engineers on on-call rotation
