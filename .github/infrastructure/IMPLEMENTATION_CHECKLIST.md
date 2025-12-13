# CPU-Based Autoscaling Implementation Checklist

**Issue:** LFE-7918 - Add CPU based scaling to web containers  
**Goal:** Implement mixed scaling (HTTP requests OR CPU utilization) to prevent high latency from CPU constraints

## Quick Reference

| Current State | Target State |
|--------------|--------------|
| Scale only on HTTP request count | Scale on HTTP requests **OR** CPU utilization (whichever triggers first) |
| Risk: High CPU with low requests = no scaling | Protection: CPU threshold triggers scaling regardless of request count |
| Recent incident: High latency due to CPU | Prevention: Proactive scaling before latency impact |

## Implementation Phases

### Phase 1: Preparation (Week 1)

- [ ] **Review Current Configuration**
  - [ ] Document current autoscaling policies for all web services
  - [ ] Identify current request count thresholds
  - [ ] Record baseline CPU utilization patterns (7-day average)
  - [ ] Note current min/max capacity settings
  
- [ ] **Identify Infrastructure Location**
  - [ ] Determine where autoscaling is configured (Terraform/CloudFormation/CDK/Console)
  - [ ] Verify access to infrastructure repositories
  - [ ] Ensure proper AWS permissions for team members
  
- [ ] **Establish Monitoring Baselines**
  - [ ] Create CloudWatch dashboard for key metrics:
    - [ ] ECS CPU Utilization (per service)
    - [ ] Request Count Per Target
    - [ ] Task Count (Desired vs Running)
    - [ ] P95/P99 Response Times
    - [ ] 5xx Error Rates
  - [ ] Document current performance metrics (pre-implementation)

### Phase 2: Staging Implementation (Week 1-2)

- [ ] **Configure Staging Environment**
  - [ ] staging-web
    - [ ] Add CPU-based scaling policy (target: 70%)
    - [ ] Verify existing request-based policy remains active
    - [ ] Set scale-out cooldown: 60s
    - [ ] Set scale-in cooldown: 300s
  - [ ] staging-web-ingestion
    - [ ] Add CPU-based scaling policy (target: 70%)
    - [ ] Configure cooldown periods
  - [ ] staging-web-iso (if applicable)
    - [ ] Add CPU-based scaling policy (target: 70%)
    - [ ] Configure cooldown periods

- [ ] **Initial Validation**
  - [ ] Verify policies are active in AWS Console
  - [ ] Check CloudWatch alarms are created
  - [ ] Confirm no immediate scaling issues
  - [ ] Document any errors or warnings

- [ ] **Staging Monitoring (48-72 hours)**
  - [ ] Monitor CPU utilization trends
  - [ ] Watch for scaling events in ECS service history
  - [ ] Check if scaling triggers at expected thresholds
  - [ ] Verify scale-in behavior is appropriate
  - [ ] Review any unexpected scaling patterns
  - [ ] Document observations and anomalies

### Phase 3: Load Testing (Week 2)

- [ ] **Prepare Test Scenarios**
  - [ ] Scenario 1: High CPU, normal request count
    - Expected: CPU policy triggers scaling
  - [ ] Scenario 2: High requests, normal CPU
    - Expected: Request policy triggers scaling
  - [ ] Scenario 3: Both high CPU and high requests
    - Expected: Faster/more aggressive scaling
  - [ ] Scenario 4: Gradual ramp-up
    - Expected: Smooth scaling without oscillation

- [ ] **Execute Load Tests**
  - [ ] Run Scenario 1 and verify CPU-based scaling
  - [ ] Run Scenario 2 and verify request-based scaling
  - [ ] Run Scenario 3 and verify combined behavior
  - [ ] Run Scenario 4 and verify cooldown behavior
  - [ ] Document results for each scenario

- [ ] **Validate Results**
  - [ ] Scaling events occurred at expected CPU threshold
  - [ ] No flapping or oscillation observed
  - [ ] Latencies remained acceptable during scaling
  - [ ] Scale-in didn't occur too aggressively
  - [ ] No errors or service disruptions

### Phase 4: Production Rollout (Week 3)

#### Environment Order: EU → US → HIPAA

- [ ] **prod-eu Environment**
  - [ ] prod-eu-web
    - [ ] Add CPU-based scaling policy
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues
  - [ ] prod-eu-web-ingestion
    - [ ] Add CPU-based scaling policy
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues
  - [ ] prod-eu-web-iso
    - [ ] Add CPU-based scaling policy (if applicable)
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues

- [ ] **prod-us Environment** (after successful EU deployment)
  - [ ] prod-us-web
    - [ ] Add CPU-based scaling policy
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues
  - [ ] prod-us-web-ingestion
    - [ ] Add CPU-based scaling policy
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues
  - [ ] prod-us-web-iso
    - [ ] Add CPU-based scaling policy (if applicable)
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues

- [ ] **prod-hipaa Environment** (after successful US deployment)
  - [ ] prod-hipaa-web
    - [ ] Add CPU-based scaling policy
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues
  - [ ] prod-hipaa-web-ingestion
    - [ ] Add CPU-based scaling policy
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues
  - [ ] prod-hipaa-web-iso
    - [ ] Add CPU-based scaling policy (if applicable)
    - [ ] Monitor for 24 hours
    - [ ] Verify no issues

### Phase 5: Validation & Optimization (Week 4)

- [ ] **Performance Validation**
  - [ ] Compare pre/post implementation metrics:
    - [ ] Average CPU utilization
    - [ ] P95/P99 latency
    - [ ] Error rates
    - [ ] Scaling event frequency
  - [ ] Verify no performance degradation
  - [ ] Document improvements

- [ ] **Cost Analysis**
  - [ ] Calculate average task count before/after
  - [ ] Estimate cost impact (ECS task hours)
  - [ ] Compare against incident cost/impact
  - [ ] Document ROI

- [ ] **Threshold Tuning** (if needed)
  - [ ] Adjust CPU target values based on observations
  - [ ] Fine-tune cooldown periods
  - [ ] Update min/max capacity if needed
  - [ ] Document any changes made

- [ ] **Alert Configuration**
  - [ ] Review CloudWatch alarms
  - [ ] Set up alerts for:
    - [ ] Scaling failures
    - [ ] Rapid scaling events
    - [ ] Max capacity reached
    - [ ] Sustained high CPU despite scaling
  - [ ] Test alert delivery

### Phase 6: Documentation & Knowledge Transfer (Week 4)

- [ ] **Update Documentation**
  - [ ] Add autoscaling configuration to infrastructure docs
  - [ ] Update runbooks with new scaling behavior
  - [ ] Document troubleshooting procedures
  - [ ] Create incident response guidelines

- [ ] **Team Knowledge Transfer**
  - [ ] Share implementation learnings
  - [ ] Train on-call engineers on new behavior
  - [ ] Update monitoring dashboards
  - [ ] Document lessons learned

- [ ] **Post-Implementation Review**
  - [ ] Schedule team review meeting
  - [ ] Present before/after metrics
  - [ ] Discuss any issues encountered
  - [ ] Identify further optimization opportunities

## Success Criteria

✅ **Must Have:**
- CPU-based scaling policies active on all web services
- No service disruptions during implementation
- Scaling triggers at expected CPU threshold (70% ± 5%)
- Documented improvement in high-CPU scenarios

✅ **Should Have:**
- Reduced P95/P99 latencies under high CPU load
- No significant cost increase (< 10%)
- Clear monitoring and alerting for scaling events
- Updated documentation and runbooks

✅ **Nice to Have:**
- Automated scaling tests in CI/CD
- Predictive scaling based on traffic patterns
- Cost optimization through better resource utilization

## Rollback Procedures

If issues are encountered at any phase:

1. **Immediate Action:**
   ```bash
   # Remove CPU-based scaling policy
   aws application-autoscaling delete-scaling-policy \
     --service-namespace ecs \
     --resource-id service/[cluster]/[service] \
     --scalable-dimension ecs:service:DesiredCount \
     --policy-name cpu-tracking-policy
   ```

2. **Verify rollback:**
   - Check that request-based policy is still active
   - Monitor service stability for 30 minutes
   - Document the issue that triggered rollback

3. **Post-rollback:**
   - Investigate root cause
   - Adjust configuration parameters
   - Re-test in staging before retry

## Key Contacts

- **Infrastructure Team:** [To be filled]
- **On-Call Engineer:** [To be filled]
- **AWS Support:** [Account/Case information]
- **Project Owner:** [To be filled]

## Timeline

| Phase | Duration | Target Completion |
|-------|----------|------------------|
| Preparation | 3-5 days | [Date] |
| Staging Implementation | 2-3 days | [Date] |
| Load Testing | 2-3 days | [Date] |
| Production Rollout | 5-7 days | [Date] |
| Validation & Optimization | 5-7 days | [Date] |
| Documentation | 2-3 days | [Date] |
| **Total** | **3-4 weeks** | [Date] |

## Notes & Observations

### Staging Observations:
```
[Add notes during staging implementation]
```

### Production Observations:
```
[Add notes during production rollout]
```

### Issues Encountered:
```
[Document any issues and resolutions]
```

### Optimization Opportunities:
```
[Ideas for future improvements]
```

---

**Last Updated:** [Date]  
**Issue:** [LFE-7918](link-to-linear-issue)  
**Status:** ⬜ Not Started | 🔄 In Progress | ✅ Complete
