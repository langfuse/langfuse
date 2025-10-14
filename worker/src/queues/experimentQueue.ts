import { Job } from "bullmq";
import {
  ExperimentCreateQueue,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { retryLLMRateLimitError } from "../features/utils";
import { delayInMs } from "./utils/delays";
import { createExperimentJobClickhouse } from "../features/experiments/experimentServiceClickhouse";

export const experimentCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ExperimentCreate]>,
) => {
  try {
    await createExperimentJobClickhouse({
      event: job.data.payload,
    });
    return true;
  } catch (e) {
    // If creating any of the dataset run items associated with this experiment create job fails with a 429, we want to retry the experiment creation job unless it's older than 24h.
    const hasScheduledLLMRateLimitRetry = await retryLLMRateLimitError(e, job, {
      table: "dataset_runs",
      idField: "runId",
      queue: ExperimentCreateQueue.getInstance(),
      queueName: QueueName.ExperimentCreate,
      jobName: QueueJobs.ExperimentCreateJob,
      delayFn: delayInMs,
    });

    if (hasScheduledLLMRateLimitRetry) {
      return;
    }

    if (
      e instanceof InvalidRequestError ||
      e instanceof LangfuseNotFoundError
    ) {
      logger.info(
        `Failed to process experiment create job for project: ${job.data.payload.projectId}`,
        e,
      );

      try {
        const currentRun = await kyselyPrisma.$kysely
          .selectFrom("dataset_runs")
          .selectAll()
          .where("id", "=", job.data.payload.runId)
          .where("project_id", "=", job.data.payload.projectId)
          .executeTakeFirst();

        if (!currentRun) {
          logger.info(
            `Dataset run configuration is invalid for run ${job.data.payload.runId}`,
          );
          // attempt retrying the job as the run may be created in the meantime
          throw new LangfuseNotFoundError(
            `Dataset run ${job.data.payload.runId} not found`,
          );
        }

        // error cases of invalid configuration (prompt, api key, etc) are handled on the DRI level
        // return true to indicate job was processed successfully and avoid retrying
        return true;
      } catch (e) {
        logger.error("Failed to process experiment create job", e);
        traceException(e);
        throw e;
      }
    }

    logger.error("Failed to process experiment create job", e);
    traceException(e);
    throw e;
  }
};
