# Queue Job Execution Anomaly Investigation Report

## Issue Summary

The `handleFreeTierClourUsageJob` is executing significantly more frequently than expected, causing approximately 10x the expected database writes (517,788 vs expected ~50,000 writes over 20 minutes).

## Root Cause Analysis

### Primary Issue: Multiple Container Instances Creating Duplicate Jobs

**Location**: `packages/shared/src/server/redis/cloudFreeTierUsageThresholdQueue.ts`

**Problem**: The `CloudFreeTierUsageThresholdQueue.getInstance()` method adds **TWO** jobs every time it's called, and multiple worker containers call this method during startup:

```typescript
// Line 50-57: Scheduled recurring job (INTENDED)
CloudFreeTierUsageThresholdQueue.instance.add(
  QueueJobs.CloudFreeTierUsageThresholdJob,
  {},
  {
    // Run at minute 35 of every hour (30 minutes after cloudUsageMetering at :05)
    repeat: { pattern: "35 * * * *" },
  },
);

// Line 59-63: Bootstrap job for immediate execution (INTENDED)
CloudFreeTierUsageThresholdQueue.instance.add(
  QueueJobs.CloudFreeTierUsageThresholdJob,
  {},
  {}, // Executes immediately to bootstrap the first run
);
```

**Root Cause**: Multiple worker containers each call `getInstance()` during startup, creating multiple copies of both the recurring schedule and bootstrap jobs, without deduplication.

### Impact Analysis

1. **Immediate Job Execution**: Every time `getInstance()` is called, an immediate job is queued and executed
2. **Multiple Container Instances**: In cloud deployments, multiple worker containers likely call `getInstance()` during startup
3. **Recurring Jobs**: Each container also adds a recurring job, leading to multiple hourly executions
4. **Queue Pressure**: This explains the "steady pressure of 2 jobs in the queue" observed in DataDog metrics

### Code Flow Analysis

1. **Worker Startup** (`worker/src/app.ts` lines 311-312):
   ```typescript
   // Instantiate the queue to trigger scheduled jobs
   CloudFreeTierUsageThresholdQueue.getInstance();
   ```

2. **Queue Access** (`packages/shared/src/server/redis/getQueue.ts` line 44):
   ```typescript
   case QueueName.CloudFreeTierUsageThresholdQueue:
     return CloudFreeTierUsageThresholdQueue.getInstance();
   ```

3. **Multiple Calls**: Each worker container and potentially other services call `getInstance()`, each triggering both jobs

### Job Processing Details

The job processes all organizations by:
- Fetching all projects and organizations (~50k organizations expected)
- Querying ClickHouse for usage data across multiple days
- Performing bulk database updates
- This explains the high write volume when executed multiple times

## Secondary Contributing Factors

### 1. Singleton Pattern Issues
- The singleton pattern prevents multiple queue instances but doesn't prevent multiple job additions
- Each container restart or service restart calls `getInstance()` again
- No protection against duplicate job scheduling

### 2. Container Scaling
- Cloud deployments likely run multiple worker containers
- Each container calls `getInstance()` during initialization
- No coordination between containers for job scheduling

### 3. Missing Job Deduplication
- No job ID or deduplication mechanism to prevent multiple identical jobs
- BullMQ allows multiple jobs with the same name but different IDs

## Comparison with Other Queues

Other queue implementations in the codebase follow the same pattern but may not show the same issues because:

1. **CloudUsageMeteringQueue**: Similar pattern but may have different scaling characteristics
2. **Other Queues**: Some use different initialization patterns or have natural deduplication

## Recommended Solutions

### 1. Add Job Deduplication (IMPLEMENTED)
**Priority: HIGH**

Add unique job IDs to prevent multiple containers from creating duplicate jobs:

```typescript
// Recurring job with unique ID
CloudFreeTierUsageThresholdQueue.instance.add(
  QueueJobs.CloudFreeTierUsageThresholdJob,
  {},
  {
    repeat: { pattern: "35 * * * *" },
    jobId: "cloud-free-tier-usage-threshold-recurring", // Prevents duplicate recurring jobs
  },
);

// Bootstrap job with unique ID
CloudFreeTierUsageThresholdQueue.instance.add(
  QueueJobs.CloudFreeTierUsageThresholdJob,
  {},
  {
    jobId: "cloud-free-tier-usage-threshold-bootstrap", // Prevents duplicate bootstrap jobs
  },
);
```

### 3. Centralized Job Scheduling
**Priority: MEDIUM**

Consider moving recurring job scheduling to a dedicated service or single container to prevent multiple containers from scheduling the same jobs.

### 4. Add Monitoring and Alerting
**Priority: MEDIUM**

- Monitor queue length and job execution frequency
- Alert when job execution exceeds expected thresholds
- Add metrics for job deduplication events

### 5. Review Other Queue Implementations
**Priority: LOW**

Audit other queue implementations for similar patterns:
- `CloudUsageMeteringQueue`
- `PostHogIntegrationQueue`
- `DataRetentionQueue`
- Others that follow the same initialization pattern

## Expected Outcomes

After implementing the immediate fix:
- Job executions should reduce to once per hour (as intended)
- Database writes should drop from ~517k to ~50k per execution cycle
- Queue pressure should show single jobs instead of constant pressure
- DataDog metrics should show proper job lifecycle (spike during execution, then zero)

## Testing Recommendations

1. **Staging Environment**: Deploy fix to staging and monitor for 24 hours
2. **Metrics Validation**: Confirm job execution frequency returns to hourly
3. **Database Load**: Verify write volume decreases to expected levels
4. **Queue Monitoring**: Ensure queue length patterns normalize

## Risk Assessment

- **Low Risk**: The fix only removes unintended immediate job execution
- **High Impact**: Should resolve the performance issue immediately
- **Rollback Plan**: Simple revert if issues arise

## Fixes Applied

### 1. ✅ Fixed CloudFreeTierUsageThresholdQueue
- **Kept** immediate job execution (it's intentional for bootstrapping)
- Added unique `jobId: "cloud-free-tier-usage-threshold-recurring"` for recurring job deduplication
- Added unique `jobId: "cloud-free-tier-usage-threshold-bootstrap"` for bootstrap job deduplication

### 2. ✅ Fixed CloudUsageMeteringQueue  
- **Kept** immediate job execution (it's intentional for bootstrapping)
- Added unique `jobId: "cloud-usage-metering-recurring"` for recurring job deduplication  
- Added unique `jobId: "cloud-usage-metering-bootstrap"` for bootstrap job deduplication

## Investigation Results

### ✅ (1) Why Immediate Job Execution is Needed

**BullMQ Behavior Confirmed:**
- When adding a recurring job with `repeat: { pattern: "35 * * * *" }`, BullMQ schedules it for the **NEXT** matching cron time
- If service starts at 14:40, the first execution would be at 15:35 (55-minute delay)
- If service starts at 14:20, the first execution would be at 14:35 (15-minute delay)
- **Bootstrap job is intentional** to ensure immediate processing on service startup

### ✅ (2) Cron Pattern Validation

**All patterns are correctly configured:**
- `CloudUsageMeteringQueue`: `"5 * * * *"` → Every hour at minute 5 (XX:05)
- `CloudFreeTierUsageThresholdQueue`: `"35 * * * *"` → Every hour at minute 35 (XX:35)
- **30-minute gap maintained** as intended (comment: "30 minutes after cloudUsageMetering")
- Standard 5-field cron format is valid for BullMQ

### 📋 Added Comprehensive Logging

**Job Scheduling Logs:**
- `[CloudFreeTierUsageThresholdQueue] Scheduling recurring job` with pattern and jobId
- `[CloudFreeTierUsageThresholdQueue] Scheduling bootstrap job` with jobId
- `[CloudUsageMeteringQueue] Scheduling recurring job` with pattern and jobId
- `[CloudUsageMeteringQueue] Scheduling bootstrap job` with jobId

**Job Execution Logs:**
- Enhanced logging in both queue processors with jobId, timestamp, and options
- Error handling with detailed context
- Re-queuing notifications for CloudUsageMeteringQueue

## Timeline

- **✅ Completed**: Add job deduplication with unique jobIds
- **✅ Completed**: Add comprehensive logging for job scheduling and execution
- **✅ Completed**: Validate cron patterns and BullMQ behavior
- **Within 1 week**: Monitor logs to confirm deduplication is working
- **Within 2 weeks**: Validate performance improvements in production