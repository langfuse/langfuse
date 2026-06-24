import {
  convertQueueNameToMetricName,
  logger,
  recordDistribution,
  RetryBaggage,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";

const LLM_QUEUE_RETRY_MAX_ATTEMPTS = 4;
const LLM_QUEUE_RETRY_MAX_AGE_SECONDS = 120 * 60;
const LLM_QUEUE_RETRY_JITTER_FACTOR = 0.2;
const LLM_QUEUE_RETRY_OFFSETS_SECONDS = [5, 20, 55, 120].map(
  (minutes) => minutes * 60,
);

const getLLMQueueRetryDelaySeconds = ({
  attempt,
  elapsedSeconds,
}: {
  attempt: number;
  elapsedSeconds: number;
}) => {
  const targetOffsetSeconds = LLM_QUEUE_RETRY_OFFSETS_SECONDS[attempt - 1];

  if (targetOffsetSeconds === undefined) return 0;

  const delaySeconds = Math.max(0, targetOffsetSeconds - elapsedSeconds);
  const jitterMultiplier =
    1 -
    LLM_QUEUE_RETRY_JITTER_FACTOR +
    Math.random() * LLM_QUEUE_RETRY_JITTER_FACTOR * 2;
  const jitteredDelaySeconds = Math.round(delaySeconds * jitterMultiplier);
  const remainingAgeSeconds = Math.max(
    0,
    LLM_QUEUE_RETRY_MAX_AGE_SECONDS - elapsedSeconds,
  );

  return Math.min(jitteredDelaySeconds, remainingAgeSeconds);
};

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
}

export type RetryScheduleResult =
  | {
      outcome: "scheduled";
      delaySeconds: number;
      retryBaggage: RetryBaggage;
    }
  | {
      outcome: "skipped";
      reason: "too_old" | "max_attempts";
    }
  | {
      outcome: "queue_unavailable";
    };

/**
 * Handles rate limiting and retry logic for queue jobs.
 * Automatically retries jobs that fail with 429/5xx errors unless they exceed
 * the configured retry budget or age limit.
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

    const elapsedSeconds = Math.max(
      0,
      (Date.now() - record.createdAt.getTime()) / 1000,
    );

    if (elapsedSeconds >= LLM_QUEUE_RETRY_MAX_AGE_SECONDS) {
      logger.info(`Job ${jobId} exceeded retry age limit. Stop retrying.`);

      return {
        outcome: "skipped",
        reason: "too_old",
      };
    }

    const currentAttempt = (job.data.retryBaggage?.attempt ?? 0) + 1;

    if (currentAttempt > LLM_QUEUE_RETRY_MAX_ATTEMPTS) {
      logger.info(`Job ${jobId} exceeded retry attempt limit. Stop retrying.`);

      return {
        outcome: "skipped",
        reason: "max_attempts",
      };
    }

    const delaySeconds = getLLMQueueRetryDelaySeconds({
      attempt: currentAttempt,
      elapsedSeconds,
    });
    const delayMs = Math.round(delaySeconds * 1000);

    const retryBaggage: RetryBaggage = job.data.retryBaggage
      ? {
          originalJobTimestamp: new Date(
            job.data.retryBaggage.originalJobTimestamp,
          ),
          attempt: currentAttempt,
        }
      : {
          originalJobTimestamp:
            record.createdAt ?? new Date(job.data.timestamp),
          attempt: currentAttempt,
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
      `Job ${jobId} is rate limited. Retrying in ${delaySeconds}s. Attempt: ${retryBaggage?.attempt}. Total delay: ${retryBaggage ? new Date().getTime() - new Date(retryBaggage?.originalJobTimestamp).getTime() : "unavailable"}ms.`,
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
        { delay: delayMs },
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
      delaySeconds,
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
