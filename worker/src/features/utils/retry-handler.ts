import {
  convertQueueNameToMetricName,
  logger,
  recordDistribution,
  RetryBaggage,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

const LLM_QUEUE_RETRY_FIRST_DELAY_SECONDS = 5 * 60;
const LLM_QUEUE_RETRY_JITTER_FACTOR = 0.2;

const getLLMQueueRetryTargetOffsetSeconds = ({
  attempt,
  maxRetryAttempts,
  maxAgeSeconds,
}: {
  attempt: number;
  maxRetryAttempts: number;
  maxAgeSeconds: number;
}) => {
  if (attempt < 1 || attempt > maxRetryAttempts) return 0;

  const firstRetryDelaySeconds = Math.min(
    LLM_QUEUE_RETRY_FIRST_DELAY_SECONDS,
    maxAgeSeconds / maxRetryAttempts,
  );

  if (maxRetryAttempts === 1) return firstRetryDelaySeconds;

  // With the default 4 retries over 120m this is roughly 5m, 43m, 82m, 120m.
  const retryProgress = (attempt - 1) / (maxRetryAttempts - 1);

  return Math.round(
    firstRetryDelaySeconds +
      (maxAgeSeconds - firstRetryDelaySeconds) * retryProgress,
  );
};

const getLLMQueueRetryDelaySeconds = ({
  attempt,
  elapsedSeconds,
  maxRetryAttempts,
  maxAgeSeconds,
}: {
  attempt: number;
  elapsedSeconds: number;
  maxRetryAttempts: number;
  maxAgeSeconds: number;
}) => {
  const targetOffsetSeconds = getLLMQueueRetryTargetOffsetSeconds({
    attempt,
    maxRetryAttempts,
    maxAgeSeconds,
  });
  const delaySeconds = Math.max(0, targetOffsetSeconds - elapsedSeconds);
  const jitterMultiplier =
    1 -
    LLM_QUEUE_RETRY_JITTER_FACTOR +
    Math.random() * LLM_QUEUE_RETRY_JITTER_FACTOR * 2;
  const jitteredDelaySeconds = Math.round(delaySeconds * jitterMultiplier);
  const remainingAgeSeconds = Math.max(0, maxAgeSeconds - elapsedSeconds);

  return Math.min(jitteredDelaySeconds, remainingAgeSeconds);
};

const getInitialQueueDelayMs = (delay: unknown) =>
  typeof delay === "number" && Number.isFinite(delay) ? Math.max(0, delay) : 0;

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
    const maxRetryAttempts = env.LANGFUSE_LLM_AS_JUDGE_QUEUE_RETRY_MAX_ATTEMPTS;
    const maxAgeSeconds = env.LANGFUSE_LLM_AS_JUDGE_QUEUE_RETRY_MAX_AGE_SECONDS;

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

    // The retry budget starts when the LLM call is first attempted, not when a
    // delayed evaluation job row was created.
    const retryWindowStartTimeMs =
      record.createdAt.getTime() +
      getInitialQueueDelayMs(job.data.payload.delay);

    const elapsedSeconds = Math.max(
      0,
      (Date.now() - retryWindowStartTimeMs) / 1000,
    );

    if (elapsedSeconds >= maxAgeSeconds) {
      logger.info(`Job ${jobId} exceeded retry age limit. Stop retrying.`);

      return {
        outcome: "skipped",
        reason: "too_old",
      };
    }

    const currentAttempt = (job.data.retryBaggage?.attempt ?? 0) + 1;

    if (currentAttempt > maxRetryAttempts) {
      logger.info(`Job ${jobId} exceeded retry attempt limit. Stop retrying.`);

      return {
        outcome: "skipped",
        reason: "max_attempts",
      };
    }

    const delaySeconds = getLLMQueueRetryDelaySeconds({
      attempt: currentAttempt,
      elapsedSeconds,
      maxRetryAttempts,
      maxAgeSeconds,
    });
    const delayMs = Math.round(delaySeconds * 1000);

    const retryWindowStart = new Date(retryWindowStartTimeMs);
    const retryBaggage: RetryBaggage =
      job.data.retryBaggage && job.data.retryBaggage.attempt > 0
        ? {
            originalJobTimestamp: new Date(
              job.data.retryBaggage.originalJobTimestamp,
            ),
            attempt: currentAttempt,
          }
        : {
            originalJobTimestamp: retryWindowStart,
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
