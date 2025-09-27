import { Job } from "bullmq";
import {
  RegressionRunCreateQueue,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { handleRetryableError } from "../features/utils";
import { delayInMs } from "./utils/delays";
import { createRegressionRunJobClickhouse } from "../features/regressionRuns/regressionRunServiceClickhouse";

export const regressionRunCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.RegressionRunCreate]>,
) => {
  try {
    await createRegressionRunJobClickhouse({
      event: job.data.payload,
    });
    return true;
  } catch (e) {
    // If creating any of the regression run items associated with this regression run create job fails with a 429, we want to retry the regression run creation job unless it's older than 24h.
    const wasRetried = await handleRetryableError(e, job, {
      table: "dataset_runs",
      idField: "runId",
      queue: RegressionRunCreateQueue.getInstance(),
      queueName: QueueName.RegressionRunCreate,
      jobName: QueueJobs.RegressionRunCreateJob,
      delayFn: delayInMs,
    });

    if (wasRetried) {
      return;
    }

    if (
      e instanceof InvalidRequestError ||
      e instanceof LangfuseNotFoundError
    ) {
      logger.info(
        `Failed to process regression run create job for project: ${job.data.payload.projectId}`,
        e,
      );

      try {
        const currentRun = await kyselyPrisma.$kysely
          .selectFrom("regression_runs")
          .selectAll()
          .where("id", "=", job.data.payload.runId)
          .where("project_id", "=", job.data.payload.projectId)
          .executeTakeFirst();

        if (!currentRun) {
          logger.info(
            `Regression run configuration is invalid for run ${job.data.payload.runId}`,
          );
          // attempt retrying the job as the run may be created in the meantime
          throw new LangfuseNotFoundError(
            `Regression run ${job.data.payload.runId} not found`,
          );
        }

        // error cases of invalid configuration (prompt, api key, etc) are handled on the DRI level
        // return true to indicate job was processed successfully and avoid retrying
        return true;
      } catch (e) {
        logger.error("Failed to process regression run create job", e);
        traceException(e);
        throw e;
      }
    }

    logger.error("Failed to process regression run create job", e);
    traceException(e);
    throw e;
  }
};
