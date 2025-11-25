import {
  convertQueueNameToMetricName,
  logger,
  recordDistribution,
  RetryBaggage,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { kyselyPrisma } from "@langfuse/shared/src/db";

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
  // eslint-disable-next-line no-unused-vars
  delayFn: (attempt: number) => number;
}

/**
 * Handles rate limiting and retry logic for queue jobs
 * Automatically retries jobs that fail with 429/5xx errors unless they're older than 24h
 *
 * @param error - The error that occurred
 * @param job - The job that failed
 * @param config - Retry configuration
 * @returns true if retry was handled and job was added to the queue, false if regular processing should continue
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
): Promise<void> {
  try {
    const jobId = job.data.payload[config.idField];

    // Check if the job is older than 24h
    const record = await kyselyPrisma.$kysely
      .selectFrom(config.table)
      .select("created_at")
      .where("id", "=", jobId)
      .where("project_id", "=", job.data.payload.projectId)
      .executeTakeFirstOrThrow();

    if (record.created_at < new Date(Date.now() - ONE_DAY_IN_MS)) {
      logger.info(
        `Job ${jobId} is rate limited for more than 24h. Stop retrying.`,
      );

      return; // Don't retry
    }

    // Retry the job with delay
    const delay = config.delayFn((job.data.retryBaggage?.attempt ?? 0) + 1);

    const retryBaggage: RetryBaggage | undefined = job.data.retryBaggage
      ? {
          originalJobTimestamp: new Date(
            job.data.retryBaggage.originalJobTimestamp,
          ),
          attempt: job.data.retryBaggage.attempt + 1,
        }
      : undefined;

    // Record retry attempt distribution per queue
    if (retryBaggage) {
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
    }

    logger.info(
      `Job ${jobId} is rate limited. Retrying in ${delay}ms. Attempt: ${retryBaggage?.attempt}. Total delay: ${retryBaggage ? new Date().getTime() - new Date(retryBaggage?.originalJobTimestamp).getTime() : "unavailable"}ms.`,
    );

    await config.queue?.add(
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
  } catch (innerErr) {
    const jobId = job.data.payload[config.idField];
    logger.error(
      `Failed to handle 429 retry for ${jobId}. Continuing regular processing.`,
      innerErr,
    );

    throw innerErr;
  }
}
