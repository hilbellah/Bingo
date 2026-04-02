# Monitoring Stack Setup Guide

This document provides step-by-step instructions for setting up Datadog monitoring for the Wolastoq Bingo system.

## Prerequisites

- Active Datadog account (https://www.datadoghq.com)
- Datadog API key & app key
- Access to Render.com dashboard
- Node.js server with health endpoint deployed (`GET /health`)

## Phase 2: Datadog Setup (Days 3-5)

### Step 1: Datadog Account & API Key

1. Go to https://www.datadoghq.com/free and create free account (or use existing)
2. Navigate to **Organization Settings** → **API Keys**
3. Create new API key, name it "Wolastoq-Bingo-API"
4. Copy and securely store the API key
5. Create app key: **Organization Settings** → **Application Keys** → **New Key**
6. Name it "Wolastoq-Bingo-App"

### Step 2: Install Datadog Agent on Render

The Datadog Agent collects logs, metrics, and traces from your services.

**Option A: Dockerfile Integration (Recommended)**

Add to Render service's `Dockerfile`:

```dockerfile
FROM node:20-alpine

# Install Datadog agent
RUN wget -O - https://keys.datadoghq.com/DATADOG_APM_KEY.public | apt-key add - && \
    echo "deb https://apt.datadoghq.com/ stable 7" > /etc/apt/sources.list.d/datadog.list && \
    apt-get update && \
    apt-get install -y datadog-agent

# ... rest of your Dockerfile
```

**Option B: Environment Variable Setup (Simpler)**

Set these environment variables on Render service:

```
DD_API_KEY=<your-api-key-from-step-1>
DD_SITE=datadoghq.com
DD_ENV=production
DD_SERVICE=wolastoq-bingo
DD_VERSION=1.0.0
DD_LOGS_INJECTION=true
DD_TRACE_ENABLED=true
```

### Step 3: Configure Log Collection

In your Render service build settings:

1. **Build Command**:
   ```bash
   npm install
   ```

2. **Start Command**:
   ```bash
   node server/src/index.js
   ```

3. **Add Log Collection**:
   Set environment variable:
   ```
   DD_LOGS_CONFIG_PROCESSING_RULES=[{"type":"mask_sequences","name":"mask-secrets","pattern":"(?i)(password|token|secret)[=:][^ ]+"}]
   ```

### Step 4: Verify Health Endpoint

The server now has a `/health` endpoint for monitoring:

```bash
curl https://bingo-jk2h.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-03T12:00:00.000Z",
  "uptime": 3600,
  "db": "connected"
}
```

### Step 5: Create Datadog Dashboard

1. In Datadog, go to **Dashboards** → **New Dashboard**
2. Name it "Wolastoq Bingo - Production Health"
3. Add widgets:

**Widget 1: Service Status (HTML)**
```
<h2>Wolastoq Bingo Status</h2>
<p>Service: <span id="status">Checking...</span></p>
<p>Uptime: <span id="uptime">Checking...</span></p>
```

**Widget 2: Response Time (p95)**
```
Query: avg:trace.http.request.duration{service:wolastoq-bingo}
```

**Widget 3: Error Rate**
```
Query: sum:trace.http.errors{service:wolastoq-bingo}
```

**Widget 4: Log Stream**
```
Query: service:wolastoq-bingo status:error
```

### Step 6: Configure Synthetic Checks

For uptime monitoring:

1. Go to **Synthetic Monitoring** → **Create Test** → **HTTP**
2. **URL**: `https://bingo-jk2h.onrender.com/health`
3. **Request Timeout**: 10 seconds
4. **Assertion**: Response contains `"status":"ok"`
5. **Locations**: Select 2-3 regions
6. **Frequency**: Check every 1 minute
7. **Alert Threshold**: Fail if 2+ locations fail
8. **Notifications**: Email + Slack (configure notification channels)

### Step 7: Set Up Alerts

**Alert 1: Service Down**
```
Alert when response from /health endpoint is not "ok" for 2 minutes
Notification: Email + Slack #ops-channel
```

**Alert 2: High Error Rate**
```
Alert when error rate > 5% for 5 minutes
Notification: Email + PagerDuty
```

**Alert 3: Slow Response Time**
```
Alert when API response time (p95) > 200ms for 10 minutes
Notification: Email
```

### Step 8: Team Training

Document in team wiki:
- How to access the dashboard
- How to interpret metrics
- How to acknowledge alerts
- On-call incident response procedures

## Performance Targets

Based on framework requirements:

- **99.5% Uptime**: Synthetic checks monitor continuously
- **Response Time < 200ms (p95)**: Tracked in dashboard
- **Error Rate < 5%**: Alerts configured
- **Database Health**: /health endpoint checks DB connection
- **Log Retention**: 30 days (default Datadog free tier)

## Troubleshooting

### Logs not appearing in Datadog

1. Verify API key is correct: `curl -H "DD-API-KEY: $DD_API_KEY" https://api.datadoghq.com/api/v1/validate`
2. Check Render logs for errors: `render logs <service-id>`
3. Verify JSON log format: `echo '{"timestamp":"2026-04-03T12:00:00Z","level":"info"}' | curl -d @- -H "DD-API-KEY: $DD_API_KEY" https://http-intake.logs.datadoghq.com/v1/input/`

### Alerts not firing

1. Verify alert conditions in Datadog: **Monitors** → View recent alerts
2. Check notification channels are configured
3. Test with manual trigger: **Monitors** → Select monitor → **Test Notification**

### High cost

- Use Datadog free tier for up to 2 hosts
- For production, consider 3-month commitment plan
- Archive older logs to S3 for long-term retention

## Next Steps

After Datadog is live:

1. **Phase 2 Completion**: Verify dashboard shows real metrics
2. **Phase 3**: Configure PagerDuty integration for on-call alerts
3. **Phase 4**: Team training on dashboard & alert response
4. **Ongoing**: Review dashboards daily, tune alert thresholds
