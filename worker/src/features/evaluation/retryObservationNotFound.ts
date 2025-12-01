import {
  convertQueueNameToMetricName,
  logger,
  recordDistribution,
  RetryBaggage,
  QueueName,
  QueueJobs,
  DatasetRunItemUpsertQueue,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import type { ObservationNotFoundError } from "../../errors/ObservationNotFoundError";

const MAX_RETRY_ATTEMPTS = 5; // Initial attempt + 4 retries
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Exponential backoff delay function for observation-not-found retries
 * Returns: 30s, 1m (60s), 2m (120s), 4m (240s)
 */
export const observationRetryDelayInMs = (attempt: number): number => {
  // Exponential backoff with 30s base: 30s * 2^(attempt-1)
  const baseDelayMs = 30 * 1000;
  return baseDelayMs * Math.pow(2, attempt - 1);
};

/**
 * Handles observation-not-found errors with exponential backoff retry logic
 * @returns true if retry was scheduled, false if max attempts reached (should log warning and complete)
 */
export async function retryObservationNotFound(
  error: ObservationNotFoundError,
  job: {
    data: {
      projectId: string;
      datasetItemId: string;
      traceId: string;
      observationId?: string;
      retryBaggage?: RetryBaggage;
    };
  },
): Promise<boolean> {
  try {
    const currentAttempt = (job.data.retryBaggage?.attempt ?? 0) + 1;
    const originalTimestamp =
      job.data.retryBaggage?.originalJobTimestamp ?? new Date();

    // Check if job is older than max age
    const ageMs = Date.now() - new Date(originalTimestamp).getTime();
    if (ageMs > MAX_AGE_MS) {
      logger.warn(
        `Observation ${error.observationId} not found after ${MAX_AGE_MS / 1000}s. Giving up.`,
        {
          projectId: job.data.projectId,
          datasetItemId: job.data.datasetItemId,
          observationId: error.observationId,
          traceId: job.data.traceId,
          ageMs,
          attempts: currentAttempt,
        },
      );
      return false; // Max age reached, don't retry
    }

    // Check if max attempts reached
    if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
      logger.warn(
        `Observation ${error.observationId} not found after ${MAX_RETRY_ATTEMPTS} attempts. Giving up.`,
        {
          projectId: job.data.projectId,
          datasetItemId: job.data.datasetItemId,
          observationId: error.observationId,
          traceId: job.data.traceId,
          ageMs,
          attempts: currentAttempt,
        },
      );
      return false; // Max attempts reached, don't retry
    }

    // Calculate delay for next attempt
    const delay = observationRetryDelayInMs(currentAttempt);

    const retryBaggage: RetryBaggage = {
      originalJobTimestamp: new Date(originalTimestamp),
      attempt: currentAttempt,
    };

    // Record retry attempt distribution
    recordDistribution(
      `${convertQueueNameToMetricName(QueueName.DatasetRunItemUpsert)}.retries`,
      retryBaggage.attempt,
      {
        queue: QueueName.DatasetRunItemUpsert,
        reason: "observation_not_found",
      },
    );

    logger.info(
      `Observation ${error.observationId} not found. Retrying in ${delay}ms. Attempt ${currentAttempt}/${MAX_RETRY_ATTEMPTS}.`,
      {
        projectId: job.data.projectId,
        datasetItemId: job.data.datasetItemId,
        observationId: error.observationId,
        traceId: job.data.traceId,
        delayMs: delay,
        totalDelayMs: ageMs,
        attempt: currentAttempt,
      },
    );

    // Re-queue the job with delay
    const queue = DatasetRunItemUpsertQueue.getInstance();
    await queue?.add(
      QueueJobs.DatasetRunItemUpsert,
      {
        name: QueueJobs.DatasetRunItemUpsert,
        id: randomUUID(),
        timestamp: new Date(),
        payload: {
          projectId: job.data.projectId,
          datasetItemId: job.data.datasetItemId,
          traceId: job.data.traceId,
          observationId: job.data.observationId,
        },
        retryBaggage,
      },
      { delay },
    );

    return true; // Retry scheduled
  } catch (innerErr) {
    logger.error(
      `Failed to handle observation-not-found retry for observation ${error.observationId}. Job will fail.`,
      {
        error: innerErr,
        projectId: job.data.projectId,
        datasetItemId: job.data.datasetItemId,
        observationId: error.observationId,
      },
    );
    throw innerErr;
  }
}
