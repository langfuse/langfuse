# Correct Cron Job Scheduling Pattern

This document shows the correct way to schedule cron jobs in a distributed system to ensure they are scheduled **exactly once** when the system starts, regardless of how many containers or instances are running.

## Problem Statement

In distributed systems with multiple worker containers:
- Each container calls `getInstance()` during startup
- Without proper deduplication, this creates multiple identical recurring jobs
- Results in jobs running multiple times instead of once per schedule

## Solution: Proper Job Deduplication

### ✅ Correct Implementation

```typescript
// packages/shared/src/server/redis/exampleQueue.ts
import { Queue } from "bullmq";
import { env } from "../../env";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class ExampleQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    // Only enable if required environment variables are set
    if (!env.EXAMPLE_FEATURE_ENABLED) {
      return null;
    }

    if (ExampleQueue.instance) {
      return ExampleQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ExampleQueue.instance = newRedis
      ? new Queue(QueueName.ExampleQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.ExampleQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    ExampleQueue.instance?.on("error", (err) => {
      logger.error("ExampleQueue error", err);
    });

    if (ExampleQueue.instance) {
      // 🔑 KEY POINT: Use unique jobId for deduplication
      logger.info("[ExampleQueue] Scheduling recurring job", {
        pattern: "0 2 * * *", // Daily at 2:00 AM
        jobId: "example-daily-recurring",
        timestamp: new Date().toISOString(),
      });

      ExampleQueue.instance.add(
        QueueJobs.ExampleJob,
        {},
        {
          repeat: { pattern: "0 2 * * *" }, // Daily at 2:00 AM
          jobId: "example-daily-recurring", // 🔑 CRITICAL: Unique ID prevents duplicates
        },
      );

      // 🔑 OPTIONAL: Bootstrap job for immediate execution
      // Only add if you need the job to run immediately on startup
      logger.info("[ExampleQueue] Scheduling bootstrap job", {
        jobId: "example-bootstrap",
        timestamp: new Date().toISOString(),
      });

      ExampleQueue.instance.add(
        QueueJobs.ExampleJob,
        {},
        {
          jobId: "example-bootstrap", // 🔑 CRITICAL: Unique ID prevents duplicates
        },
      );
    }

    return ExampleQueue.instance;
  }
}
```

### 🔑 Key Principles

1. **Always use `jobId` for recurring jobs**: This ensures BullMQ deduplicates identical jobs
2. **Use descriptive, unique job IDs**: Make them globally unique across your system
3. **Add comprehensive logging**: Track when jobs are scheduled and executed
4. **Bootstrap jobs are optional**: Only add if you need immediate execution on startup

## Job ID Naming Convention

Use a consistent naming pattern for job IDs:

```typescript
// For recurring jobs
jobId: "service-name-schedule-type"
// Examples:
jobId: "usage-metering-hourly"
jobId: "data-retention-daily" 
jobId: "backup-weekly"

// For bootstrap jobs  
jobId: "service-name-bootstrap"
// Examples:
jobId: "usage-metering-bootstrap"
jobId: "data-retention-bootstrap"
```

## Complete Working Example

### 1. Queue Definition

```typescript
// packages/shared/src/server/redis/reportGenerationQueue.ts
export class ReportGenerationQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (!env.REPORTS_ENABLED) {
      return null;
    }

    if (ReportGenerationQueue.instance) {
      return ReportGenerationQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    ReportGenerationQueue.instance = newRedis
      ? new Queue(QueueName.ReportGenerationQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.ReportGenerationQueue),
          defaultJobOptions: {
            removeOnComplete: 50,
            removeOnFail: 100,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 10000,
            },
          },
        })
      : null;

    ReportGenerationQueue.instance?.on("error", (err) => {
      logger.error("ReportGenerationQueue error", err);
    });

    if (ReportGenerationQueue.instance) {
      // Schedule daily report generation at 6:00 AM
      logger.info("[ReportGenerationQueue] Scheduling daily reports", {
        pattern: "0 6 * * *",
        jobId: "daily-reports-recurring",
        timestamp: new Date().toISOString(),
      });

      ReportGenerationQueue.instance.add(
        QueueJobs.ReportGenerationJob,
        { reportType: "daily" },
        {
          repeat: { pattern: "0 6 * * *" },
          jobId: "daily-reports-recurring",
        },
      );

      // Schedule weekly report generation on Sundays at 7:00 AM  
      logger.info("[ReportGenerationQueue] Scheduling weekly reports", {
        pattern: "0 7 * * 0",
        jobId: "weekly-reports-recurring", 
        timestamp: new Date().toISOString(),
      });

      ReportGenerationQueue.instance.add(
        QueueJobs.ReportGenerationJob,
        { reportType: "weekly" },
        {
          repeat: { pattern: "0 7 * * 0" }, // Sunday at 7:00 AM
          jobId: "weekly-reports-recurring",
        },
      );

      // Optional: Generate initial report on startup
      logger.info("[ReportGenerationQueue] Scheduling bootstrap report", {
        jobId: "reports-bootstrap",
        timestamp: new Date().toISOString(),
      });

      ReportGenerationQueue.instance.add(
        QueueJobs.ReportGenerationJob,
        { reportType: "startup" },
        {
          jobId: "reports-bootstrap",
        },
      );
    }

    return ReportGenerationQueue.instance;
  }
}
```

### 2. Job Processor with Logging

```typescript
// worker/src/queues/reportGenerationQueue.ts
import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleReportGenerationJob } from "../services/reportGeneration";

export const reportGenerationQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.ReportGenerationJob) {
    logger.info("Executing Report Generation Job", {
      jobId: job.id,
      jobName: job.name,
      jobData: job.data,
      timestamp: new Date().toISOString(),
      opts: {
        repeat: job.opts.repeat,
        jobId: job.opts.jobId,
      },
    });

    try {
      const result = await handleReportGenerationJob(job);
      
      logger.info("Report Generation Job completed successfully", {
        jobId: job.id,
        result: result,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      logger.error("Error executing Report Generation Job", {
        jobId: job.id,
        error: error,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
};
```

### 3. Worker Registration

```typescript
// worker/src/app.ts
if (env.REPORTS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  ReportGenerationQueue.getInstance();
  
  WorkerManager.register(
    QueueName.ReportGenerationQueue,
    reportGenerationQueueProcessor,
    {
      concurrency: 2,
      limiter: {
        max: 5, // Max 5 jobs per minute
        duration: 60_000,
      },
    },
  );
}
```

## Expected Log Output

With proper implementation, you should see logs like this **only once per container startup**:

```
[ReportGenerationQueue] Scheduling daily reports {"pattern":"0 6 * * *","jobId":"daily-reports-recurring","timestamp":"2024-01-15T10:30:00.000Z"}
[ReportGenerationQueue] Scheduling weekly reports {"pattern":"0 7 * * 0","jobId":"weekly-reports-recurring","timestamp":"2024-01-15T10:30:00.000Z"}
[ReportGenerationQueue] Scheduling bootstrap report {"jobId":"reports-bootstrap","timestamp":"2024-01-15T10:30:00.000Z"}
```

Then during execution:
```
Executing Report Generation Job {"jobId":"reports-bootstrap","jobName":"report-generation-job","opts":{"jobId":"reports-bootstrap"},"timestamp":"2024-01-15T10:30:01.000Z"}
Report Generation Job completed successfully {"jobId":"reports-bootstrap","timestamp":"2024-01-15T10:30:05.000Z"}
```

## Anti-Patterns to Avoid

### ❌ Wrong: No Job ID (Creates Duplicates)

```typescript
// BAD: Multiple containers will create multiple recurring jobs
queue.add(QueueJobs.ExampleJob, {}, {
  repeat: { pattern: "0 2 * * *" }
  // Missing jobId - each container creates a new recurring job!
});
```

### ❌ Wrong: Non-Unique Job ID

```typescript
// BAD: Generic job ID that might conflict
queue.add(QueueJobs.ExampleJob, {}, {
  repeat: { pattern: "0 2 * * *" },
  jobId: "daily-job" // Too generic, might conflict with other services
});
```

### ❌ Wrong: Dynamic Job IDs

```typescript
// BAD: Job ID changes each time, defeating deduplication
queue.add(QueueJobs.ExampleJob, {}, {
  repeat: { pattern: "0 2 * * *" },
  jobId: `daily-job-${Date.now()}` // Creates new job every time!
});
```

## Testing Your Implementation

### 1. Local Testing

```bash
# Start multiple worker instances to simulate production
pnpm run dev:worker &
pnpm run dev:worker &
pnpm run dev:worker &

# Check logs - you should see scheduling messages only once total,
# not once per worker instance
```

### 2. Redis Inspection

```bash
# Connect to Redis and check for duplicate jobs
redis-cli
> KEYS "*example-daily-recurring*"
# Should return only one key, not multiple
```

### 3. BullMQ Dashboard

If you have BullMQ dashboard enabled, check that:
- Only one recurring job exists per schedule
- Job counts match expectations
- No duplicate job IDs in the queue

## Cron Pattern Reference

Common patterns for reference:

```typescript
"0 2 * * *"     // Daily at 2:00 AM
"30 1 * * *"    // Daily at 1:30 AM  
"0 */6 * * *"   // Every 6 hours
"*/15 * * * *"  // Every 15 minutes
"0 9 * * 1"     // Every Monday at 9:00 AM
"0 0 1 * *"     // First day of every month at midnight
"0 0 * * 0"     // Every Sunday at midnight
```

## Summary

The key to correct cron job scheduling in distributed systems:

1. **Always use unique `jobId`s** for deduplication
2. **Add comprehensive logging** to track scheduling
3. **Test with multiple instances** to ensure no duplicates
4. **Use bootstrap jobs sparingly** - only when immediate execution is needed
5. **Follow consistent naming conventions** for job IDs

This pattern ensures your cron jobs are scheduled exactly once, regardless of how many containers or instances are running in your system.