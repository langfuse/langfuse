import { Job } from "bullmq";
import {
  ExperimentCreateQueue,
  ExperimentMetadataSchema,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { createExperimentJob } from "../features/experiments/experimentService";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { handleRetryableError } from "../features/utils";
import { delayInMs } from "./utils/delays";

export const experimentCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ExperimentCreate]>,
) => {
  try {
    logger.info("Starting to process experiment create job", {
      jobId: job.id,
      attempt: job.attemptsMade,
      data: job.data,
    });
    await createExperimentJob({
      event: job.data.payload,
    });
    return true;
  } catch (e) {
    // If creating any of the dataset run items associated with this experiment create job fails with a 429, we want to retry the experiment creation job unless it's older than 24h.
    const wasRetried = await handleRetryableError(e, job, {
      table: "dataset_runs",
      idField: "runId",
      queue: ExperimentCreateQueue.getInstance(),
      queueName: QueueName.ExperimentCreate,
      jobName: QueueJobs.ExperimentCreateJob,
      metricName: "langfuse.experiment-create.rate-limited",
      delayFn: delayInMs,
    });

    if (wasRetried) {
      return;
    }

    // we are left with 4xx and application errors here.

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

        if (
          !currentRun ||
          !currentRun.metadata ||
          !ExperimentMetadataSchema.safeParse(currentRun.metadata).success
        ) {
          throw new LangfuseNotFoundError(
            `Dataset run ${job.data.payload.runId} not found`,
          );
        }

        // update experiment run metadata field with error
        await kyselyPrisma.$kysely
          .updateTable("dataset_runs")
          .set({
            metadata: {
              ...currentRun.metadata,
              error: e.message,
            },
          })
          .where("id", "=", job.data.payload.runId)
          .where("project_id", "=", job.data.payload.projectId)
          .execute();

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
