import {
  convertQueueNameToMetricName,
  logger,
  recordDistribution,
  RetryBaggage,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Configuration for retry handling with rate limiting and age checks
 */
interface RetryConfig {
  /** Database table to check age against */
  table: "dataset_runs" | "job_executions";
  /** Name of the ID field in the payload */
  idField: "runId" | "jobExecutionId";
  /** Queue instance to add retry job to */
  queue: any;
  /** Queue name for the retry job */
  queueName: string;
  /** Job name for the retry job */
  jobName: string;
  /** Function to generate retry delay in milliseconds */

  delayFn: (attempt: number) => number;
}

export type RetryScheduleResult =
  | {
      outcome: "scheduled";
      delay: number;
      retryBaggage: RetryBaggage;
    }
  | {
      outcome: "skipped";
      reason: "too_old";
    }
  | {
      outcome: "queue_unavailable";
    };

/**
 * Handles rate limiting and retry logic for queue jobs
 * Automatically retries jobs that fail with 429/5xx errors unless they're older than 24h
 */
export async function retryLLMRateLimitError(
  job: {
    data: {
      timestamp: Date;
      payload: { projectId: string; [key: string]: any };
      retryBaggage?: RetryBaggage;
    };
  },
  config: RetryConfig,
): Promise<RetryScheduleResult> {
  try {
    const jobId = job.data.payload[config.idField];

    // Check if the job is older than 24h
    const record =
      config.table === "dataset_runs"
        ? await prisma.datasetRuns.findFirstOrThrow({
            select: { createdAt: true },
            where: { id: jobId, projectId: job.data.payload.projectId },
          })
        : await prisma.jobExecution.findFirstOrThrow({
            select: { createdAt: true },
            where: { id: jobId, projectId: job.data.payload.projectId },
          });

    if (record.createdAt < new Date(Date.now() - ONE_DAY_IN_MS)) {
      logger.info(
        `Job ${jobId} is rate limited for more than 24h. Stop retrying.`,
      );

      return {
        outcome: "skipped",
        reason: "too_old",
      };
    }

    // Retry the job with delay
    const delay = config.delayFn((job.data.retryBaggage?.attempt ?? 0) + 1);

    const retryBaggage: RetryBaggage = job.data.retryBaggage
      ? {
          originalJobTimestamp: new Date(
            job.data.retryBaggage.originalJobTimestamp,
          ),
          attempt: job.data.retryBaggage.attempt + 1,
        }
      : {
          originalJobTimestamp: new Date(job.data.timestamp),
          attempt: 1,
        };

    if (!config.queue) {
      logger.warn(
        `Retry queue ${config.queueName} is not available for job ${jobId}. Falling back to normal error handling.`,
      );

      return {
        outcome: "queue_unavailable",
      };
    }

    // Record retry attempt distribution per queue
    recordDistribution(
      `${convertQueueNameToMetricName(config.queueName)}.retries`,
      retryBaggage.attempt,
      {
        queue: config.queueName,
      },
    );

    // Record delay distribution per queue
    recordDistribution(
      `${convertQueueNameToMetricName(config.queueName)}.total_retry_delay_ms`,
      new Date().getTime() -
        new Date(retryBaggage.originalJobTimestamp).getTime(), // this is the total delay
      {
        queue: config.queueName,
        unit: "milliseconds",
      },
    );

    logger.info(
      `Job ${jobId} is rate limited. Retrying in ${delay}ms. Attempt: ${retryBaggage?.attempt}. Total delay: ${retryBaggage ? new Date().getTime() - new Date(retryBaggage?.originalJobTimestamp).getTime() : "unavailable"}ms.`,
    );

    try {
      await config.queue.add(
        config.queueName,
        {
          name: config.jobName,
          id: randomUUID(),
          timestamp: new Date(),
          payload: job.data.payload,
          retryBaggage: retryBaggage,
        },
        { delay },
      );
    } catch (addErr) {
      logger.warn(
        `Failed to enqueue retry job for ${jobId}. Falling back to normal error handling.`,
        addErr,
      );

      return {
        outcome: "queue_unavailable",
      };
    }

    return {
      outcome: "scheduled",
      delay,
      retryBaggage,
    };
  } catch (innerErr) {
    const jobId = job.data.payload[config.idField];
    logger.error(
      `Failed to handle 429 retry for ${jobId}. Falling back to caller error handling.`,
      innerErr,
    );

    return {
      outcome: "queue_unavailable",
    };
  }
}
