# Performance & Load Testing Guide

**Guide for testing system performance, identifying bottlenecks, and planning capacity**

---

## Overview

This guide provides procedures for:
- Baseline performance measurement
- Load testing methodology
- Bottleneck identification
- Capacity planning
- Performance optimization strategies

---

## Section 1: Baseline Performance Measurement

### 1.1 Measure Current Performance

**Objective**: Establish baseline metrics before any load testing

**Prerequisites**:
- System deployed and stable
- No heavy traffic
- Monitoring configured (Datadog)

**Metrics to collect**:
```
1. API Response Times
   - GET /api/sessions: target < 100ms
   - GET /api/sessions/:id/seats: target < 150ms
   - POST /api/bookings: target < 200ms

2. Database Performance
   - Query response time (p50, p95, p99)
   - Database file size
   - Write frequency

3. Server Resources
   - CPU usage (idle)
   - Memory usage (baseline)
   - Disk I/O (writes per second)

4. Client Performance
   - Page load time: target < 3 seconds
   - First contentful paint: target < 1.5 seconds
   - Time to interactive: target < 2 seconds
```

**How to measure**:

```bash
# API Performance
for i in {1..100}; do
  curl -w "%{time_total}\n" -o /dev/null -s https://bingo-jk2h.onrender.com/api/sessions
done | awk '{sum+=$1; if($1>max)max=$1; if(NR==1||$1<min)min=$1} END {print "Avg: " sum/NR " Min: " min " Max: " max}'

# Page Load Time (from browser DevTools)
1. Open https://bingo-jk2h.onrender.com
2. F12 → Network tab
3. Record page load time

# Database Performance (from Datadog)
1. Dashboard → Query Duration
2. Check p95 latency for each query type
```

### 1.2 Record Baseline

**Create baseline.json**:
```json
{
  "measurement_date": "2026-04-03",
  "api_performance": {
    "get_sessions": {
      "avg_ms": 75,
      "p95_ms": 120,
      "p99_ms": 150
    },
    "get_seats": {
      "avg_ms": 110,
      "p95_ms": 180,
      "p99_ms": 220
    },
    "post_booking": {
      "avg_ms": 150,
      "p95_ms": 220,
      "p99_ms": 280
    }
  },
  "page_load": {
    "load_time_ms": 2500,
    "fcp_ms": 1200,
    "tti_ms": 1800
  },
  "server_resources": {
    "cpu_idle_percent": 10,
    "memory_baseline_mb": 128,
    "disk_io_writes_per_sec": 5
  }
}
```

---

## Section 2: Load Testing

### 2.1 Load Testing Tools

**Recommended options**:

1. **k6** (recommended)
   ```bash
   # Installation
   brew install k6
   
   # Simple load test
   k6 run load_test.js
   ```

2. **Apache JMeter**
   - GUI-based
   - Complex scenarios
   - Good reporting

3. **Locust**
   - Python-based
   - Distributed load
   - Real-time stats

### 2.2 Load Test Script (k6)

**Create load_test.js**:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },    // Ramp up
    { duration: '5m', target: 50 },    // Stay at 50
    { duration: '2m', target: 100 },   // Ramp to 100
    { duration: '3m', target: 100 },   // Hold
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // p95 response < 200ms
    http_req_failed: ['rate<0.1'],     // < 10% errors
  },
};

export default function() {
  // Test 1: Get sessions
  let res = http.get('https://bingo-jk2h.onrender.com/api/sessions');
  check(res, {
    'sessions status 200': (r) => r.status === 200,
    'sessions response < 100ms': (r) => r.timings.duration < 100,
  });
  sleep(1);

  // Test 2: Get seats for first session
  let sessionId = JSON.parse(res.body)[0].id;
  res = http.get(`https://bingo-jk2h.onrender.com/api/sessions/${sessionId}/seats`);
  check(res, {
    'seats status 200': (r) => r.status === 200,
    'seats response < 150ms': (r) => r.timings.duration < 150,
  });
  sleep(1);

  // Test 3: Lock a seat
  let seatId = JSON.parse(res.body)[0].id;
  let holderId = `holder-${__VU}-${__ITER}`;
  res = http.post(
    `https://bingo-jk2h.onrender.com/api/seats/${seatId}/lock`,
    JSON.stringify({ holderId, holdMinutes: 10 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, {
    'lock seat status 200': (r) => r.status === 200,
  });
  sleep(2);

  // Test 4: Unlock seat
  res = http.post(
    `https://bingo-jk2h.onrender.com/api/seats/${seatId}/unlock`,
    JSON.stringify({ holderId }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, {
    'unlock status 200': (r) => r.status === 200,
  });
  sleep(1);
}
```

**Run the test**:
```bash
k6 run load_test.js
```

**Expected output**:
```
    ✓ sessions status 200
    ✓ sessions response < 100ms
    ✓ seats status 200
    ✓ seats response < 150ms
    ✓ lock seat status 200
    ✓ unlock status 200

  http_reqs...................: 6000  100/s
  http_req_duration..........: avg=125ms p(95)=180ms p(99)=220ms
  http_req_failed............: 0.00%
```

### 2.3 Load Testing Scenarios

**Scenario 1: Normal Load** (baseline)
- 50 concurrent users
- Normal browsing patterns
- Duration: 10 minutes
- Ramp up: 2 minutes

**Scenario 2: Peak Load** (expected peak)
- 200 concurrent users
- Rapid booking attempts
- Duration: 15 minutes
- Ramp up: 3 minutes

**Scenario 3: Stress Test** (breaking point)
- Start at 0, increase by 50 users every 2 minutes
- Until system breaks or response time exceeds threshold
- Identify breaking point

**Scenario 4: Soak Test** (endurance)
- 100 concurrent users
- Duration: 4 hours
- Identify memory leaks, connection issues

---

## Section 3: Bottleneck Identification

### 3.1 Common Bottlenecks

| Bottleneck | Symptom | Check |
|-----------|---------|-------|
| CPU | CPU > 80%, high query times | Render dashboard metrics |
| Memory | Memory > 85%, gradual slowdown | Monitor memory trend |
| Database | Slow queries, high disk I/O | Datadog query duration |
| Network | High latency, timeouts | Check Render logs |
| I/O | Slow disk writes, high latency | Database commit time |

### 3.2 Find Bottlenecks

**Step 1: Run load test and monitor**
```bash
# During load test, watch Datadog dashboard
# Look for metrics exceeding targets:
# - CPU > 80%
# - Memory > 80%
# - Response time p95 > 200ms
# - Error rate > 5%
```

**Step 2: Analyze slow queries**
```sql
-- Find slow queries
SELECT query, COUNT(*) as count, AVG(duration_ms) as avg_duration
FROM query_log
WHERE duration_ms > 100
GROUP BY query
ORDER BY avg_duration DESC
LIMIT 10;
```

**Step 3: Check resource contention**
```bash
# In Render dashboard:
1. Metrics → CPU Usage (look for sustained > 80%)
2. Metrics → Memory Usage (look for sustained > 80%)
3. Logs → Look for ERROR or WARN messages
```

### 3.3 Common Optimizations

**If Database is bottleneck**:
1. Add indexes on frequently searched columns
2. Optimize N+1 queries
3. Increase connection pool size
4. Consider query caching with Redis

**If CPU is bottleneck**:
1. Profile hot code paths
2. Add caching for expensive operations
3. Reduce computation per request
4. Scale up to more powerful instance

**If Memory is bottleneck**:
1. Fix memory leaks (check WebSocket connections)
2. Reduce cache size
3. Stream large responses
4. Scale up instance memory

**If Network is bottleneck**:
1. Add CDN for static assets
2. Compress responses (gzip)
3. Optimize API payload sizes
4. Add caching headers

---

## Section 4: Capacity Planning

### 4.1 Calculate Capacity

**Formula**:
```
Users_Supported = (Requests_Per_Second_Limit) / (Requests_Per_User_Per_Second)

Example:
- Database can handle: 100 requests/sec
- Each user makes: 5 requests/sec (during booking)
- Users = 100 / 5 = 20 concurrent users

But add safety margin (2x):
- Safe capacity: 20 / 2 = 10 concurrent users
```

### 4.2 Growth Projections

**Current capacity**: 50 concurrent users  
**Max response time**: < 200ms

**Growth projections**:
```
Users    Date          Action Needed
50       2026-04 (now) Monitor
100      2026-06       Add caching
250      2026-09       Scale database
500      2026-12       Multi-region deployment
1000     2027-Q2       Microservices
```

### 4.3 Scaling Strategies

**Vertical Scaling** (easier, cheaper):
- Upgrade instance size (more CPU/RAM)
- Cost: +$50-200/month
- Effort: 5 minutes
- Limit: ~1000 concurrent users

**Horizontal Scaling** (complex, costly):
- Multiple app servers (load balancer)
- Separate database server
- Redis for caching
- Cost: +$500+/month
- Effort: 2-4 weeks
- Capacity: 10,000+ concurrent users

**Caching Strategy** (fast win):
- Redis for session data
- CDN for static assets
- Database query caching
- Cost: +$50/month
- Effort: 1 week
- Benefit: 3-5x capacity increase

---

## Section 5: Performance Monitoring

### 5.1 Key Metrics to Monitor

**Real-time** (every minute):
- API response times (p50, p95, p99)
- Error rate (%)
- Active users
- Database queries/sec

**Hourly**:
- Memory trends
- CPU trends
- Request rate trends
- Cache hit rate

**Daily**:
- Peak load hour
- Slowest endpoints
- Error rate trends
- Resource utilization trends

### 5.2 Alert Thresholds

```
CRITICAL (page immediately):
- Response time p95 > 500ms
- Error rate > 10%
- Service down (no response)

WARNING (notify team):
- Response time p95 > 200ms
- Error rate > 5%
- Memory > 80%
- CPU > 80%

INFO (log for analysis):
- Response time p95 > 150ms
- Any sustained growth trend
```

### 5.3 Datadog Dashboard Setup

**Widget 1: Response Time Trend**
```
Query: trace.web.request.duration
Aggregation: p95
Time window: 24 hours
```

**Widget 2: Error Rate**
```
Query: trace.web.request{status:error}
Aggregation: count
Time window: 24 hours
```

**Widget 3: Resource Usage**
```
Query: system.cpu.user, system.memory.usage
Aggregation: avg
Time window: 24 hours
```

---

## Section 6: Optimization Checklist

**After identifying bottlenecks, use this checklist**:

- [ ] Add database indexes for slow queries
- [ ] Implement query result caching
- [ ] Enable response compression (gzip)
- [ ] Add HTTP caching headers
- [ ] Optimize N+1 queries
- [ ] Add Redis for session caching
- [ ] Implement pagination for large result sets
- [ ] Minify and bundle JavaScript/CSS
- [ ] Use CDN for static assets
- [ ] Implement rate limiting
- [ ] Add connection pooling
- [ ] Profile and optimize hot code paths
- [ ] Implement lazy loading for seat map
- [ ] Add request batching for bulk operations
- [ ] Monitor and cleanup memory leaks

---

## Example Performance Test Report

**Test Date**: 2026-04-10  
**Duration**: 30 minutes  
**Peak Load**: 100 concurrent users

**Results**:
```
PASSED ✓
- Response time p95: 180ms (target: 200ms)
- Error rate: 0.5% (target: < 5%)
- Memory stable: avg 250MB, peak 350MB
- CPU stable: avg 45%, peak 75%

Bottleneck Found: None (system healthy)
Capacity Estimate: ~200 concurrent users (4x current)
Recommendation: Current setup is stable. Monitor weekly.
```

---

**Document Version**: 1.0  
**Last Updated**: April 3, 2026  
**CTO Approval**: ✅ Approved  
**For Questions**: Contact CTO
