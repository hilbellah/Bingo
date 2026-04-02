# Datadog Monitoring - Complete Setup Guide

**Step-by-step guide for configuring Datadog monitoring for Bingo system**

> **Status**: Ready to execute. Datadog account setup required first.
> **Timeline**: 2-3 hours setup + configuration
> **Required**: Datadog API key & app key from administrator

---

## Prerequisites

- [ ] Datadog account created (https://www.datadoghq.com/free)
- [ ] API key generated
- [ ] App key generated  
- [ ] Render service admin access
- [ ] Slack workspace admin (optional, for notifications)

---

## Part 1: Get Your Datadog Credentials

### Step 1.1: Create Datadog Account

1. Visit https://www.datadoghq.com/free
2. Click **Sign up for free**
3. Fill in account details:
   - Name: "PH Website Builders"
   - Email: [company email]
   - Password: [strong password]
4. Verify email address
5. Complete account setup

### Step 1.2: Generate API Key

1. Go to Datadog dashboard: https://app.datadoghq.com
2. Navigate to **Organization Settings** (bottom left)
3. Click **API Keys**
4. Click **+ New API Key**
5. Name it: "Wolastoq-Bingo-Production"
6. **Copy and securely store** the API key
   - Save to password manager
   - DO NOT share in email/chat
   - This key should be guarded like a password

### Step 1.3: Generate App Key

1. In Organization Settings, click **Application Keys**
2. Click **+ New Application Key**
3. Name it: "Wolastoq-Bingo-Setup"
4. **Copy and securely store** the app key
5. Grant permissions: "Dashboards, Monitors, Logs"

**You now have:**
- [ ] Datadog API Key: `dd_xxxxxxxxxxxxx...`
- [ ] Datadog App Key: `aac_xxxxxxxxxxxxx...`
- [ ] Access to https://app.datadoghq.com

---

## Part 2: Configure Render Environment Variables

### Step 2.1: Set Datadog Environment Variables

1. Go to Render dashboard: https://dashboard.render.com
2. Navigate to: **Services** → **Wolastoq Bingo**
3. Go to **Environment** tab
4. Click **Edit** next to environment variables

**Add these variables** (keep existing ones):

```env
# Datadog APM Configuration
DD_API_KEY=<your-api-key-from-step-1.2>
DD_SITE=datadoghq.com
DD_ENV=production
DD_SERVICE=wolastoq-bingo
DD_VERSION=1.0.0

# Datadog Features
DD_LOGS_INJECTION=true
DD_TRACE_ENABLED=true
DD_METRICS_ENABLED=true

# Existing variables (keep these)
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
NODE_ENV=production
```

⚠️ **Important**: 
- Never commit API key to Git
- Environment variables are masked in Render dashboard
- Each environment (dev/staging/prod) should have separate API key

### Step 2.2: Deploy

1. Click **Deploy** button
2. Wait for deployment to complete (2-3 minutes)
3. Verify health endpoint: `curl https://bingo-jk2h.onrender.com/health`
4. Wait 5 minutes for logs to appear in Datadog

---

## Part 3: Verify Data Collection

### Step 3.1: Check Logs in Datadog

1. Go to Datadog: https://app.datadoghq.com
2. Click **Logs** (left sidebar)
3. In search box, enter: `service:wolastoq-bingo`
4. Press Enter

**Expected result:**
- You should see logs from your application
- Logs should be JSON formatted
- Each log has: timestamp, level, message, service
- Example log:
  ```json
  {
    "timestamp": "2026-04-03T12:00:00Z",
    "level": "info",
    "message": "Server started",
    "service": "wolastoq-bingo"
  }
  ```

**If no logs appear:**
- Wait 2-3 minutes (logs take time to index)
- Verify API key is correct
- Check Render logs for errors: `render logs <service-id>`
- Verify environment variables were set

### Step 3.2: Check Metrics

1. Click **Metrics** (left sidebar)
2. Search for: `system.cpu.user`
3. Should see CPU usage graph

**If no metrics:**
- This is normal for first few minutes
- Wait 5-10 minutes for Datadog agent to start collecting
- Check Render service is running

### Step 3.3: Verify APM Tracing

1. Click **APM** (left sidebar)
2. Click **Services**
3. Should see "wolastoq-bingo" service listed

**What to look for:**
- Service name: `wolastoq-bingo`
- Environment: `production`
- Response time graph
- Error rate (should be 0%)

---

## Part 4: Create Monitoring Dashboard

### Step 4.1: Create Dashboard

1. Click **Dashboards** (left sidebar)
2. Click **+ New Dashboard**
3. Name it: "Wolastoq Bingo - Production Health"
4. Set scope: 1 hour (for testing)

### Step 4.2: Add Widget 1 - Service Status

1. Click **+ Add Widget**
2. Select **Status**
3. Configure:
   ```
   Query: service:wolastoq-bingo
   Title: Service Status
   ```
4. Click **Done**

### Step 4.3: Add Widget 2 - Response Time

1. Click **+ Add Widget**
2. Select **Timeseries**
3. Configure:
   ```
   Query: trace.web.request.duration{service:wolastoq-bingo}
   Aggregation: p95 (95th percentile)
   Title: API Response Time (p95)
   Max Y-axis: 500 (milliseconds)
   ```
4. Click **Done**

### Step 4.4: Add Widget 3 - Error Rate

1. Click **+ Add Widget**
2. Select **Query Value**
3. Configure:
   ```
   Query: count:trace.web.request{status:error,service:wolastoq-bingo}
   Title: Error Count
   Unit: errors
   ```
4. Click **Done**

### Step 4.5: Add Widget 4 - Request Rate

1. Click **+ Add Widget**
2. Select **Timeseries**
3. Configure:
   ```
   Query: count:trace.web.request{service:wolastoq-bingo}
   Title: Request Rate
   ```
4. Click **Done**

### Step 4.6: Add Widget 5 - Recent Logs

1. Click **+ Add Widget**
2. Select **Log Stream**
3. Configure:
   ```
   Query: service:wolastoq-bingo
   Title: Recent Logs
   Lines: 50
   ```
4. Click **Done**

### Step 4.7: Save Dashboard

1. Click **Save** (top right)
2. Dashboard is now accessible at: https://app.datadoghq.com/dashboard/...

---

## Part 5: Configure Synthetic Uptime Monitoring

### Step 5.1: Create Synthetic Test

1. Click **Synthetic Monitoring** (left sidebar)
2. Click **Create Test**
3. Select **HTTP**

### Step 5.2: Configure Test

**Test URL**:
```
https://bingo-jk2h.onrender.com/health
```

**Test Details**:
```
Test Name: Bingo Health Check
Request Timeout: 10 seconds
Frequency: Check every 5 minutes
```

**Assertion**:
```
Response body contains: "status":"ok"
```

**Locations** (select at least 2):
- [ ] N. California (AWS)
- [ ] Montreal (AWS)
- [ ] London (AWS)

### Step 5.3: Configure Alert

**Alert Options**:
- [ ] Alert if 2+ locations fail
- [ ] Alert if test fails for 2 minutes
- [ ] Notify: Email notifications

### Step 5.4: Save Test

1. Click **Save**
2. Datadog will immediately start monitoring
3. You should see first results within 1 minute

---

## Part 6: Set Up Alerts

### Step 6.1: Create P1 Alert (Service Down)

1. Click **Monitors** (left sidebar)
2. Click **+ New Monitor**
3. Select **Metric** (or use Synthetic alert)

**Monitor Setup**:
```
Type: Metric Alert
Metric: trace.web.request.errors
Condition: When count > 0 for 2 minutes
For: service:wolastoq-bingo
```

**Alert Conditions**:
```
Alert if: Error rate > 5%
For at least: 2 minutes
```

**Alert Message**:
```
{{#is_alert}}
🚨 P1 ALERT: Bingo service error rate high
Service: {{service}}
Error Rate: {{value}}%
Impact: Users unable to complete bookings
Action: Check dashboard, investigate errors
{{/is_alert}}

{{#is_recovery}}
✅ RECOVERED: Error rate back to normal
{{/is_recovery}}
```

**Notify**:
- [ ] Email (critical@company.com)
- [ ] Slack: #incidents channel
- [ ] PagerDuty (if configured)

### Step 6.2: Create P2 Alert (Performance Degradation)

1. Click **+ New Monitor**
2. Select **Metric**

**Monitor Setup**:
```
Type: Metric Alert
Metric: trace.web.request.duration
Statistic: p95 (95th percentile)
Condition: When p95 > 200ms
For: service:wolastoq-bingo
```

**Alert Message**:
```
{{#is_alert}}
⚠️ P2 ALERT: Bingo API slow
P95 Response Time: {{value}}ms (target: <200ms)
Impact: Users experiencing slow bookings
Action: Check database, review slow queries
{{/is_alert}}
```

**Notify**:
- [ ] Email
- [ ] Slack #incidents

### Step 6.3: Create P3 Alert (Info)

1. Click **+ New Monitor**
2. Select **Metric**

**Monitor Setup**:
```
Type: Metric Alert
Metric: trace.web.request.errors
Condition: When error count > 5
For: service:wolastoq-bingo
```

**Alert Message**:
```
A few errors detected. Monitor situation.
Create ticket for investigation.
```

**Notify**:
- [ ] Slack #monitoring (not critical channel)

---

## Part 7: Slack Integration (Optional)

### Step 7.1: Connect Slack

1. Click **Integrations** (left sidebar)
2. Search for **Slack**
3. Click **Slack** integration
4. Click **Install** (or **Authorize**)
5. Select your Slack workspace
6. Grant permissions
7. Select channels:
   - Alerts → #incidents
   - Metrics → #monitoring (optional)

### Step 7.2: Test Slack Connection

1. In Datadog, create a test alert
2. Verify alert message appears in Slack #incidents
3. If working, delete test alert

---

## Part 8: Team Access

### Step 8.1: Create Team Members

1. Go to **Organization Settings**
2. Click **Users**
3. Click **+ Invite Users**
4. Add team email addresses:
   - Engineers: Viewer role
   - On-call lead: Editor role
   - CTO: Admin role

### Step 8.2: Set Up Role-Based Access

**Engineer (View only)**:
- Can view dashboards
- Can view logs/metrics
- Cannot create monitors

**On-Call (Edit)**:
- Can view dashboards
- Can acknowledge alerts
- Can create temporary monitors
- Can update dashboard widgets

**Admin (Full)**:
- Can do everything
- Can manage users
- Can change integrations

---

## Part 9: Testing & Verification

### Step 9.1: Generate Test Alert

1. In Render, temporarily stop the service
2. Wait 2-3 minutes
3. Check if Datadog alert fires
4. Verify Slack notification arrives
5. Restart service
6. Verify recovery alert

### Step 9.2: Verify All Features

- [ ] Health endpoint monitored (synthetic test)
- [ ] Logs visible in Datadog
- [ ] Response time metrics collected
- [ ] Error rate tracked
- [ ] Dashboard displays all metrics
- [ ] Alerts fire when needed
- [ ] Slack notifications work
- [ ] On-call engineers have access

### Step 9.3: Documentation

Update team documentation:
- [ ] Link to Datadog dashboard
- [ ] Link to alert definitions
- [ ] Explain dashboard widgets
- [ ] Document how to acknowledge alerts

---

## Troubleshooting

### Logs Not Appearing

**Check:**
1. API key is correct: `curl -H "DD-API-KEY: $DD_API_KEY" https://api.datadoghq.com/api/v1/validate`
2. Service is running: `curl https://bingo-jk2h.onrender.com/health`
3. Environment variables set correctly in Render
4. Wait 5-10 minutes (initial delay is normal)

**Fix:**
- Restart Render service
- Verify API key in environment variables
- Check Render logs for errors

### Metrics Not Appearing

**Check:**
1. Service is running and receiving traffic
2. APM tracing is enabled in code
3. Environment variable `DD_TRACE_ENABLED=true`

**Fix:**
- Generate test traffic: `curl https://bingo-jk2h.onrender.com/api/sessions`
- Wait 5 minutes for metrics to appear
- Restart service if still not appearing

### Alerts Not Firing

**Check:**
1. Monitor is enabled (check Monitors list)
2. Condition is correct
3. Service is generating the condition (traffic/errors)
4. Slack integration is authorized

**Fix:**
- Manually test alert: Generate error, check if fires
- Verify Slack channel spelling
- Check notification settings

---

## Success Criteria

✅ **Datadog monitoring is successful when:**
1. Logs appear within 5 minutes of service startup
2. Metrics (response time, error rate) are visible
3. Dashboard shows all 5 key widgets
4. Synthetic uptime test runs successfully
5. All alerts fire when conditions are met
6. Slack notifications arrive in #incidents
7. Team members can access dashboards
8. On-call engineers can acknowledge alerts

---

## Next Steps

1. **This setup completes**: PHWA-101 Phase 2
2. **Begin**: PHWA-103 on-call rotation (once team approves)
3. **Configure**: Alert escalation and PagerDuty integration
4. **Plan**: Team training on using dashboards and responding to alerts

---

## Support

- **Questions**: Ask CTO or DevOps
- **Datadog Docs**: https://docs.datadoghq.com
- **Render Logs**: https://dashboard.render.com → Service → Logs
- **On-Call Guide**: See ON-CALL-TEAM-TRAINING.md

---

**Document Version**: v1.0  
**Last Updated**: April 3, 2026  
**Estimated Setup Time**: 2-3 hours
