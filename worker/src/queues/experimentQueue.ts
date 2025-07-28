import { Job } from "bullmq";
import {
  ExperimentCreateQueue,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  executeWithDatasetRunItemsStrategy,
  DatasetRunItemsOperationType,
} from "@langfuse/shared/src/server";
import { createExperimentJobPostgres } from "../features/experiments/experimentServicePostgres";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { handleRetryableError } from "../features/utils";
import { delayInMs } from "./utils/delays";
import { createExperimentJobClickhouse } from "../features/experiments/experimentServiceClickhouse";

export const experimentCreateQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.ExperimentCreate]>,
) => {
  await executeWithDatasetRunItemsStrategy({
    input: job,
    operationType: DatasetRunItemsOperationType.WRITE,
    postgresExecution: async (jobInput: typeof job) => {
      try {
        logger.info("Starting to process experiment create job", {
          jobId: jobInput.id,
          attempt: jobInput.attemptsMade,
          data: jobInput.data,
        });
        await createExperimentJobPostgres({
          event: jobInput.data.payload,
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
            `Failed to process experiment create job for project: ${jobInput.data.payload.projectId}`,
            e,
          );

          try {
            const currentRun = await kyselyPrisma.$kysely
              .selectFrom("dataset_runs")
              .selectAll()
              .where("id", "=", jobInput.data.payload.runId)
              .where("project_id", "=", jobInput.data.payload.projectId)
              .executeTakeFirst();

            if (!currentRun || !currentRun.metadata) {
              logger.info(
                `Dataset run configuration is invalid for run ${jobInput.data.payload.runId}`,
              );
              // attempt retrying the job as the run may be created in the meantime
              throw new LangfuseNotFoundError(
                `Dataset run ${jobInput.data.payload.runId} not found`,
              );
            }

            await kyselyPrisma.$kysely
              .updateTable("dataset_runs")
              .set({
                metadata: {
                  ...currentRun.metadata,
                  error: e.message,
                },
              })
              .where("id", "=", jobInput.data.payload.runId)
              .where("project_id", "=", jobInput.data.payload.projectId)
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
    },
    clickhouseExecution: async (jobInput: typeof job) => {
      try {
        await createExperimentJobClickhouse({
          event: jobInput.data.payload,
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
            `Failed to process experiment create job for project: ${jobInput.data.payload.projectId}`,
            e,
          );

          try {
            const currentRun = await kyselyPrisma.$kysely
              .selectFrom("dataset_runs")
              .selectAll()
              .where("id", "=", jobInput.data.payload.runId)
              .where("project_id", "=", jobInput.data.payload.projectId)
              .executeTakeFirst();

            if (!currentRun) {
              logger.info(
                `Dataset run configuration is invalid for run ${jobInput.data.payload.runId}`,
              );
              // attempt retrying the job as the run may be created in the meantime
              throw new LangfuseNotFoundError(
                `Dataset run ${jobInput.data.payload.runId} not found`,
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
    },
  });
};
