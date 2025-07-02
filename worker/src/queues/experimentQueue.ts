import { Job } from "bullmq";
import {
  ExperimentCreateQueue,
  ExperimentMetadataSchema,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  logger,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { createExperimentJob } from "../features/experiments/experimentService";
import {
  ApiError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";

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
    if (
      (e instanceof ApiError && e.httpCode === 429) || // retry all rate limits
      (e instanceof ApiError && e.httpCode >= 500) // retry all 5xx errors
    ) {
      try {
        // Check if the dataset run is older than 24h
        const datasetRun = await kyselyPrisma.$kysely
          .selectFrom("dataset_runs")
          .select("created_at")
          .where("id", "=", job.data.payload.runId)
          .where("project_id", "=", job.data.payload.projectId)
          .executeTakeFirst();

        if (
          // Do nothing if dataset run is older than 24h. The dataset run is created upon triggering an experiment (API/UI).
          datasetRun &&
          datasetRun.created_at < new Date(Date.now() - 24 * 60 * 60 * 1000)
        ) {
          logger.info(
            `Creating dataset run items for run ${job.data.payload.runId} is rate limited for more than 24h. Stop retrying.`,
          );
        } else {
          // Add the experiment creation job into the queue with a random delay between 1 and 10min and return
          // It is safe to retry the experiment creation job as any dataset item for which a dataset run item has been created already will be skipped.
          const delay = Math.floor(Math.random() * 9 + 1) * 60 * 1000;
          logger.info(
            `Creating dataset run items for run ${job.data.payload.runId} is rate limited. Retrying in ${delay}ms.`,
          );
          recordIncrement("langfuse.experiment-creation.rate-limited");
          await ExperimentCreateQueue.getInstance()?.add(
            QueueName.ExperimentCreate,
            {
              name: QueueJobs.ExperimentCreateJob,
              id: randomUUID(),
              timestamp: new Date(),
              payload: job.data.payload,
            },
            {
              delay,
            },
          );
          return;
        }
      } catch (innerErr) {
        logger.error(
          `Failed to handle 429 retry for ${job.data.payload.runId}. Continuing regular processing.`,
          innerErr,
        );
      }
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
