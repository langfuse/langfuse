# Queue Execution Anomaly Investigation Report

## Issue Summary

The `handleFreeTierClourUsageJob` is executing significantly more frequently than expected, with approximately 10x the expected execution rate (517,788 writes over 20 minutes vs. expected ~50k writes per hour).

## Root Cause Analysis

### Primary Issue: Missing Singleton Execution Pattern

The `CloudFreeTierUsageThresholdQueue` is missing the critical singleton execution pattern that prevents multiple concurrent executions of the same job. This is evident when comparing it to the properly implemented `CloudUsageMeteringQueue`.

### Key Findings

#### 1. **Missing CronJobs Table Integration**

**CloudUsageMeteringQueue (Correct Implementation):**
```typescript
// Uses cron_jobs table to track execution state
const cron = await prisma.cronJobs.upsert({
  where: { name: cloudUsageMeteringDbCronJobName },
  create: {
    name: cloudUsageMeteringDbCronJobName,
    state: CloudUsageMeteringDbCronJobStates.Queued,
    lastRun: new Date(Date.now() - ((Date.now() % 3600000) + 3600000)),
  },
  update: {},
});

// Prevents concurrent execution
if (cron.state === CloudUsageMeteringDbCronJobStates.Processing) {
  logger.info("[CLOUD USAGE METERING] Job already running, skipping");
  return;
}
```

**CloudFreeTierUsageThresholdQueue (Missing Implementation):**
```typescript
// No cron job tracking - MISSING!
export const handleCloudFreeTierUsageThresholdJob = async (job: Job) => {
  logger.info("[FREE TIER USAGE THRESHOLDS] Job started");
  // Directly executes without checking for concurrent runs
  const stats = await processUsageAggregationForAllOrgs(/*...*/);
};
```

#### 2. **Problematic Queue Initialization**

Both queues have the same problematic pattern in their `getInstance()` method:

```typescript
if (CloudFreeTierUsageThresholdQueue.instance) {
  // Adds scheduled job
  CloudFreeTierUsageThresholdQueue.instance.add(
    QueueJobs.CloudFreeTierUsageThresholdJob,
    {},
    {
      repeat: { pattern: "35 * * * *" }, // Hourly at :35
    },
  );

  // Adds immediate job - THIS IS THE PROBLEM!
  CloudFreeTierUsageThresholdQueue.instance.add(
    QueueJobs.CloudFreeTierUsageThresholdJob,
    {},
    {}, // No repeat, executes immediately
  );
}
```

#### 3. **Multiple Worker Instance Risk**

The queue is instantiated in `worker/src/app.ts` when:
- `QUEUE_CONSUMER_FREE_TIER_USAGE_THRESHOLD_QUEUE_IS_ENABLED === "true"`
- `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` is set (cloud deployment)
- `STRIPE_SECRET_KEY` is configured

If multiple worker instances are running, each will:
1. Create its own queue instance
2. Add both scheduled and immediate jobs
3. Process jobs concurrently without coordination

### Secondary Contributing Factors

#### 4. **High Computational Load**

The job processes all organizations in the system:
- Fetches all projects → org mappings
- Queries ClickHouse for trace/observation/score counts across ALL projects
- Processes up to 32 days of historical data per organization
- Performs bulk database updates

With ~50k organizations, this creates substantial load that may cause:
- Job timeouts leading to retries
- Memory pressure
- Database connection exhaustion

#### 5. **BullMQ Retry Configuration**

```typescript
defaultJobOptions: {
  removeOnComplete: true,
  removeOnFail: 100,
  attempts: 5, // Will retry failed jobs up to 5 times
  backoff: {
    type: "exponential",
    delay: 5000,
  },
}
```

Failed jobs are retried up to 5 times, potentially multiplying the execution count.

## Evidence Supporting the Analysis

### 1. **DataDog Metrics Pattern**
- Steady "pressure" of 2+ jobs in queue for hours
- Expected pattern: 1 job runs to completion, then queue goes to 0
- Observed pattern: Multiple jobs queued/processing simultaneously

### 2. **Execution Rate Calculation**
- Expected: ~50k organizations × 1 execution/hour = 50k writes/hour
- Observed: 431.39 calls/second × 1200 seconds = 517,788 writes/20min
- Ratio: 10.35x higher than expected

### 3. **Code Comparison**
The CloudUsageMeteringQueue has proper singleton patterns while CloudFreeTierUsageThresholdQueue lacks them entirely.

## Recommended Solutions

### Immediate Fix (High Priority)

1. **Implement Singleton Execution Pattern**
   ```typescript
   // Add to handleCloudFreeTierUsageThresholdJob.ts
   const FREE_TIER_CRON_JOB_NAME = "cloud_free_tier_usage_threshold";
   
   enum FreeTierCronJobStates {
     Queued = "QUEUED",
     Processing = "PROCESSING",
   }
   
   export const handleCloudFreeTierUsageThresholdJob = async (job: Job) => {
     // Check/create cron job state
     const cron = await prisma.cronJobs.upsert({
       where: { name: FREE_TIER_CRON_JOB_NAME },
       create: {
         name: FREE_TIER_CRON_JOB_NAME,
         state: FreeTierCronJobStates.Queued,
         lastRun: new Date(Date.now() - 3600000), // 1 hour ago
       },
       update: {},
     });
   
     // Prevent concurrent execution
     if (cron.state === FreeTierCronJobStates.Processing) {
       logger.info("[FREE TIER USAGE THRESHOLDS] Job already running, skipping");
       return;
     }
   
     // Mark as processing
     await prisma.cronJobs.update({
       where: { name: FREE_TIER_CRON_JOB_NAME },
       data: {
         state: FreeTierCronJobStates.Processing,
         jobStartedAt: new Date(),
       },
     });
   
     try {
       const stats = await processUsageAggregationForAllOrgs(/*...*/);
       
       // Mark as completed
       await prisma.cronJobs.update({
         where: { name: FREE_TIER_CRON_JOB_NAME },
         data: {
           state: FreeTierCronJobStates.Queued,
           lastRun: new Date(),
           jobStartedAt: null,
         },
       });
       
       logger.info("[FREE TIER USAGE THRESHOLDS] Job completed successfully", { stats });
     } catch (error) {
       // Reset state on failure
       await prisma.cronJobs.update({
         where: { name: FREE_TIER_CRON_JOB_NAME },
         data: {
           state: FreeTierCronJobStates.Queued,
           jobStartedAt: null,
         },
       });
       throw error;
     }
   };
   ```

2. **Remove Immediate Job Execution**
   ```typescript
   // In cloudFreeTierUsageThresholdQueue.ts, remove these lines:
   CloudFreeTierUsageThresholdQueue.instance.add(
     QueueJobs.CloudFreeTierUsageThresholdJob,
     {},
     {}, // This immediate execution should be removed
   );
   ```

### Medium-Term Improvements

3. **Add Job Concurrency Limits**
   ```typescript
   // In app.ts, ensure concurrency is 1
   WorkerManager.register(
     QueueName.CloudFreeTierUsageThresholdQueue,
     cloudFreeTierUsageThresholdQueueProcessor,
     {
       concurrency: 1, // Ensure only 1 job processes at a time
       limiter: {
         max: 1,
         duration: 3600_000, // 1 hour - prevent more than 1 job per hour
       },
     },
   );
   ```

4. **Implement Incremental Processing**
   - Process organizations in smaller batches
   - Add checkpointing to resume from failures
   - Implement exponential backoff for ClickHouse queries

5. **Enhanced Monitoring**
   - Add metrics for job duration and success/failure rates
   - Monitor queue depth and processing times
   - Alert on abnormal execution patterns

### Long-Term Considerations

6. **Architecture Review**
   - Consider splitting the job into smaller, organization-specific jobs
   - Implement distributed processing with proper coordination
   - Add circuit breakers for external service failures

## Risk Assessment

**High Risk:**
- Current implementation may cause database performance issues
- Potential for data inconsistency due to concurrent updates
- Resource exhaustion on worker instances

**Medium Risk:**
- Increased cloud costs due to excessive executions
- Stripe API rate limiting from over-reporting

**Low Risk:**
- User-facing functionality impact (threshold enforcement is separate from tracking)

## Testing Strategy

1. **Verify Fix in Staging:**
   - Deploy with singleton pattern
   - Monitor queue metrics for 24 hours
   - Confirm single job execution per hour

2. **Load Testing:**
   - Test with realistic organization count
   - Measure job completion time
   - Verify memory and CPU usage patterns

3. **Rollback Plan:**
   - Keep current implementation as backup
   - Monitor error rates post-deployment
   - Have database rollback scripts ready

## Conclusion

The root cause is the missing singleton execution pattern combined with immediate job scheduling. The CloudFreeTierUsageThresholdQueue should follow the same proven pattern as CloudUsageMeteringQueue to prevent concurrent executions and ensure proper job coordination across multiple worker instances.

The fix is straightforward but critical for system stability and cost control.