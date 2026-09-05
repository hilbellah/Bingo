# Week 2 Readiness Checklist

**Document Date**: April 3, 2026  
**Prepared By**: CTO  
**Status**: Awaiting board/team approvals

---

## Overview

Week 1 planning is complete. System is production-ready and live at https://bingo-jk2h.onrender.com. Week 2 requires board/team action to unblock monitoring and on-call initiatives.

---

## Board Action Items (PHWA-101: Monitoring Stack)

### Required Before Week 2 Execution

**1. Create Datadog Account**
- [ ] Sign up at datadog.com
- [ ] Use company email (CTO will get invite)
- [ ] Select "Pay-as-you-go" plan for flexibility
- [ ] Estimated cost: $15-50/month for this single service

**2. Generate Datadog API Key**
- [ ] In Datadog: Settings → API Keys
- [ ] Create new API key (label: "Render Integration")
- [ ] Send API key to CTO (will be added to Render env vars)

**3. Provide Details**
- [ ] Organization name (appears in dashboard)
- [ ] Admin email for team member access
- [ ] Preferred notification email

**Timeline**: Can be completed in 15 minutes

**Once Complete**: CTO will:
- Configure Render environment variables
- Create monitoring dashboard
- Set up alert channels
- Deploy monitoring to production

---

## Team Action Items (PHWA-103: On-Call Rotation)

### Required Before Week 2 Execution

**1. Review & Approve Framework**
- [ ] Review: PHWA-103 in Paperclip
- [ ] Review: ON-CALL-TEAM-TRAINING.md (team guide)
- [ ] Review: INCIDENT-RUNBOOKS.md (troubleshooting procedures)
- [ ] Team vote: Approve 2-engineer 1-week rotation model

**2. Assign Engineers**
- [ ] Primary on-call: [Engineer 1]
- [ ] Secondary on-call: [Engineer 2]
- [ ] Week 1 (Apr 8-14): [Assignment]
- [ ] Week 2 (Apr 15-21): [Rotation]

**3. Set Up Infrastructure**
- [ ] Create #incidents Slack channel
- [ ] Create Google Calendar: "Bingo On-Call"
- [ ] Add rotation schedule to calendar
- [ ] Configure Slack notification bot (CTO will set up integrations)

**Timeline**: Can be completed in 30 minutes (infrastructure) + 1 hour training

**Once Complete**: CTO will:
- Configure alert routing to on-call engineer
- Run team training session
- Activate rotation starting Week 2

---

## CTO Ready Items (Already Complete)

✅ **Monitoring Stack**
- Health endpoint deployed
- Structured JSON logging integrated
- MONITORING-SETUP.md created
- DATADOG-SETUP-GUIDE.md created
- Dashboard templates ready

✅ **On-Call Rotation**
- Rotation framework designed
- ON-CALL-TEAM-TRAINING.md complete (500 lines)
- INCIDENT-RUNBOOKS.md complete (270 lines)
- Alert configuration templates ready
- Escalation procedures documented

✅ **Production Deployment**
- PRODUCTION-DEPLOYMENT.md complete
- DEPLOYMENT-CHECKLIST.md complete
- ARCHITECTURE.md complete
- PERFORMANCE-TESTING.md complete

---

## Week 2 Timeline (Pending Approvals)

### Monday, April 8 (Day 1)

**Morning**:
- [ ] Board completes Datadog setup (15 min)
- [ ] CTO configures Render env vars (10 min)
- [ ] Deploy monitoring code to production (5 min)

**Afternoon**:
- [ ] Verify monitoring data flowing into Datadog (10 min)
- [ ] Create Datadog dashboard (20 min)
- [ ] Set up Slack alert integration (15 min)

**Status**: Monitoring live by end of Monday

### Tuesday-Thursday, April 9-11

**Preparation**:
- [ ] Team reviews on-call framework
- [ ] Team assigns engineers
- [ ] Infrastructure setup (calendar, Slack channel)

**Training**:
- [ ] CTO conducts team training (2 hours)
- [ ] Engineers shadow first incidents (if any)
- [ ] Practice incident response scenario (1 hour)

**Status**: On-call rotation ready to go live Friday

### Friday, April 12

**Go-Live**:
- [ ] Monitoring alerts active
- [ ] On-call rotation begins
- [ ] First on-call engineer assigned
- [ ] Alert routing to on-call Slack channel active

**Status**: Full technical standards framework operational

---

## Success Criteria for Week 2

✅ **Monitoring Stack Live**
- Datadog dashboard shows real-time metrics
- Alert thresholds configured (P1/P2/P3)
- Slack integration working
- Synthetic uptime checks running

✅ **On-Call Rotation Active**
- 2 engineers assigned to weekly rotation
- Calendar published
- Google Calendar synced with alerts
- First week's engineer acknowledged

✅ **Production Ready**
- Zero alerts during monitoring setup
- All health checks passing
- Database performing normally
- Team trained and confident

---

## Appendix: Quick Links

- **System Status**: https://bingo-jk2h.onrender.com
- **Health Endpoint**: https://bingo-jk2h.onrender.com/health
- **Documentation**:
  - Architecture: ARCHITECTURE.md
  - Deployment: PRODUCTION-DEPLOYMENT.md
  - On-Call: ON-CALL-TEAM-TRAINING.md
  - Runbooks: INCIDENT-RUNBOOKS.md
  - Monitoring: MONITORING-SETUP.md

---

**Next Step**: Board approves PHWA-99, creates Datadog account, team approves PHWA-103 and assigns rotation engineers. Once approvals received, Week 2 execution is on critical path.

**CTO Status**: Ready to execute monitoring stack and on-call activation immediately upon approvals.
