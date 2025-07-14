import { ApiError } from "@langfuse/shared";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
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
  /** Metric name for rate limit tracking */
  metricName: string;
  /** Function to generate retry delay in milliseconds */
  delayFn: () => number;
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
export async function handleRetryableError(
  error: unknown,
  job: { data: { payload: { projectId: string; [key: string]: any } } },
  config: RetryConfig,
): Promise<boolean> {
  // Only handle specific retryable errors
  if (
    !(error instanceof ApiError) ||
    (error.httpCode !== 429 && error.httpCode < 500)
  ) {
    return false; // Not a retryable error
  }

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
      return false; // Don't retry
    } else {
      // Retry the job with delay
      const delay = config.delayFn();
      logger.info(`Job ${jobId} is rate limited. Retrying in ${delay}ms.`);

      recordIncrement(config.metricName);

      await config.queue?.add(
        config.queueName,
        {
          name: config.jobName,
          id: randomUUID(),
          timestamp: new Date(),
          payload: job.data.payload,
        },
        { delay },
      );

      return true; // Do not continue regular processing, job was added to the queue
    }
  } catch (innerErr) {
    const jobId = job.data.payload[config.idField];
    logger.error(
      `Failed to handle 429 retry for ${jobId}. Continuing regular processing.`,
      innerErr,
    );
    return false; // Failed to handle retry - fallback to regular processing
  }
}
