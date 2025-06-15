import { Job } from "bullmq";
import { ApiError, BaseError } from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { sql } from "kysely";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  EvalExecutionQueue,
  QueueJobs,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { createEvalJobs, evaluate } from "../features/evaluation/evalService";
import { randomUUID } from "crypto";

export const evalJobTraceCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.TraceUpsert]>,
) => {
  try {
    await createEvalJobs({
      event: job.data.payload,
      jobTimestamp: job.data.timestamp,
      enforcedJobTimeScope: "NEW", // we must not execute evals which are intended for existing data only.
    });
    return true;
  } catch (e) {
    logger.error(
      `Failed job Evaluation for traceId ${job.data.payload.traceId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const evalJobDatasetCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.DatasetRunItemUpsert]>,
) => {
  try {
    await createEvalJobs({
      event: job.data.payload,
      jobTimestamp: job.data.timestamp,
      enforcedJobTimeScope: "NEW", // we must not execute evals which are intended for existing data only.
    });
    return true;
  } catch (e) {
    logger.error(
      `Failed job Evaluation for dataset item: ${job.data.payload.datasetItemId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const evalJobCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.CreateEvalQueue]>,
) => {
  try {
    await createEvalJobs({
      event: job.data.payload,
      jobTimestamp: job.data.timestamp,
    });
    return true;
  } catch (e) {
    logger.error(
      `Failed to create evaluation jobs: ${JSON.stringify(job.data.payload)}`,
      e,
    );
    traceException(e);
    throw e;
  }
};

export const evalJobExecutorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>,
) => {
  try {
    logger.info("Executing Evaluation Execution Job", job.data);
    await evaluate({ event: job.data.payload });

    return true;
  } catch (e) {
    // If the job fails with a 429, we want to retry it unless it's older than 24h.
    if (e instanceof ApiError && e.httpCode === 429) {
      try {
        // Check if the job execution is older than 24h
        const jobExecution = await kyselyPrisma.$kysely
          .selectFrom("job_executions")
          .select("created_at")
          .where("id", "=", job.data.payload.jobExecutionId)
          .where("project_id", "=", job.data.payload.projectId)
          .executeTakeFirstOrThrow();
        if (
          // Do nothing if job execution is older than 24h
          jobExecution.created_at < new Date(Date.now() - 24 * 60 * 60 * 1000)
        ) {
          logger.info(
            `Job ${job.data.payload.jobExecutionId} is rate limited for more than 24h. Stop retrying.`,
          );
        } else {
          // Add the job into the queue with a random delay between 1 and 10min and return
          const delay = Math.floor(Math.random() * 9 + 1) * 60 * 1000;
          logger.info(
            `Job ${job.data.payload.jobExecutionId} is rate limited. Retrying in ${delay}ms.`,
          );
          recordIncrement("langfuse.evaluation-execution.rate-limited");
          await EvalExecutionQueue.getInstance()?.add(
            QueueName.EvaluationExecution,
            {
              name: QueueJobs.EvaluationExecution,
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
          `Failed to handle 429 retry for ${job.data.payload.jobExecutionId}. Continuing regular processing.`,
          innerErr,
        );
      }
    }

    const displayError =
      e instanceof BaseError ? e.message : "An internal error occurred";

    await kyselyPrisma.$kysely
      .updateTable("job_executions")
      .set("status", sql`'ERROR'::"JobExecutionStatus"`)
      .set("end_time", new Date())
      .set("error", displayError)
      .where("id", "=", job.data.payload.jobExecutionId)
      .where("project_id", "=", job.data.payload.projectId)
      .execute();

    // do not log expected errors (api failures + missing api keys not provided by the user)
    if (
      (e instanceof BaseError && e.message.includes("API key for provider")) || // api key not provided
      (e instanceof BaseError &&
        e.message.includes(
          "`No default model or custom model found for project",
        )) || // api key not provided
      (e instanceof ApiError && e.httpCode >= 400 && e.httpCode < 500) || // do not error and retry on 4xx errors. They are visible to the user in the UI but do not alert us.
      (e instanceof ApiError && e.message.includes("TypeError")) || // Zod parsing the response failed. User should update prompt to consistently return expected output structure.
      (e instanceof ApiError &&
        e.message.includes("Error: Unterminated string in JSON at position")) || // When evaluator model is configured with too low max_tokens, the structured output response is invalid JSON
      (e instanceof ApiError && e.message.includes("is not valid JSON")) || // When evaluator model is not consistently returning valid JSON on structured output calls
      (e instanceof BaseError &&
        e.message.includes(
          "Please ensure the mapped data exists and consider extending the job delay.",
        )) // Trace not found.
    ) {
      return;
    }

    traceException(e);
    logger.error(
      `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId}`,
      e,
    );
    throw e;
  }
};
