import { Job } from "bullmq";
import {
  ApiError,
  BaseError,
  LangfuseNotFoundError,
  QUEUE_ERROR_MESSAGES,
} from "@langfuse/shared";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { sql } from "kysely";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  EvalExecutionQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { createEvalJobs, evaluate } from "../features/evaluation/evalService";
import { delayInMs } from "./utils/delays";
import { handleRetryableError } from "../features/utils";

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
    const wasRetried = await handleRetryableError(e, job, {
      table: "job_executions",
      idField: "jobExecutionId",
      queue: EvalExecutionQueue.getInstance(),
      queueName: QueueName.EvaluationExecution,
      jobName: QueueJobs.EvaluationExecution,
      metricName: "langfuse.evaluation-execution.rate-limited",
      delayFn: delayInMs,
    });

    if (wasRetried) {
      return;
    }

    // we are left with 4xx and application errors here.

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
      e instanceof LangfuseNotFoundError ||
      (e instanceof BaseError &&
        e.message.includes(
          QUEUE_ERROR_MESSAGES.OUTPUT_TOKENS_TOO_LONG_ERROR,
        )) || // output tokens too long
      (e instanceof BaseError &&
        e.message.includes(QUEUE_ERROR_MESSAGES.API_KEY_ERROR)) || // api key not provided
      (e instanceof BaseError &&
        e.message.includes(QUEUE_ERROR_MESSAGES.NO_DEFAULT_MODEL_ERROR)) || // api key not provided
      (e instanceof ApiError && e.httpCode >= 400 && e.httpCode < 500) || // do not error and retry on 4xx errors. They are visible to the user in the UI but do not alert us.
      (e instanceof ApiError && e.message.includes("TypeError")) || // Zod parsing the response failed. User should update prompt to consistently return expected output structure.
      (e instanceof ApiError &&
        e.message.includes(QUEUE_ERROR_MESSAGES.TOO_LOW_MAX_TOKENS_ERROR)) || // When evaluator model is configured with too low max_tokens, the structured output response is invalid JSON
      (e instanceof ApiError &&
        e.message.includes(QUEUE_ERROR_MESSAGES.INVALID_JSON_ERROR)) || // When evaluator model is not consistently returning valid JSON on structured output calls
      (e instanceof BaseError &&
        e.message.includes(QUEUE_ERROR_MESSAGES.MAPPED_DATA_ERROR)) // Trace not found.
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
