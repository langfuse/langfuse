import { Job } from "bullmq";
import {
  ExperimentCreateQueue,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  isLLMCompletionError,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { retryLLMRateLimitError } from "../features/utils";
import { delayInMs } from "./utils/delays";
import { createExperimentJobClickhouse } from "../features/experiments/experimentServiceClickhouse";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

export const experimentCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ExperimentCreate]>,
) => {
  try {
    await createExperimentJobClickhouse({
      event: job.data.payload,
    });
    return true;
  } catch (e) {
    if (isLLMCompletionError(e) && e.isRetryable) {
      await retryLLMRateLimitError(job, {
        table: "dataset_runs",
        idField: "runId",
        queue: ExperimentCreateQueue.getInstance(),
        queueName: QueueName.ExperimentCreate,
        jobName: QueueJobs.ExperimentCreateJob,
        delayFn: delayInMs,
      });

      return;
    }

    if (isLLMCompletionError(e) || isUnrecoverableError(e)) return;

    logger.error(
      `Failed to process experiment create job for project: ${job.data.payload.projectId}`,
      e,
    );
    traceException(e);

    // Retry job by rethrowing error
    throw e;
  }
};
