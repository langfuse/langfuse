import { Job, Queue } from "bullmq";
import { ApiError, BaseError } from "@langfuse/shared";
import {
  createDatasetEvalJobs,
  createTraceEvalJobs,
  evaluate,
} from "../features/evaluation/evalService";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { sql } from "kysely";
import {
  createNewRedisInstance,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";

export class EvalExecutionQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.EvaluationExecution]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.EvaluationExecution]
  > | null {
    if (EvalExecutionQueue.instance) return EvalExecutionQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    EvalExecutionQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(
          QueueName.EvaluationExecution,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 10_000,
              attempts: 2,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    EvalExecutionQueue.instance?.on("error", (err) => {
      logger.error("EvalExecutionQueue error", err);
    });

    return EvalExecutionQueue.instance;
  }
}

export const evalJobTraceCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.TraceUpsert]>,
) => {
  try {
    await createTraceEvalJobs({ event: job.data.payload });
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
    await createDatasetEvalJobs({ event: job.data.payload });
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

export const evalJobExecutorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>,
) => {
  try {
    logger.info("Executing Evaluation Execution Job", job.data);
    await evaluate({ event: job.data.payload });
    return true;
  } catch (e) {
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
      !(e instanceof BaseError && e.message.includes("API key for provider")) &&
      !(
        e instanceof BaseError &&
        e.message.includes(
          "Please ensure the mapped data exists and consider extending the job delay.",
        )
      ) &&
      !(e instanceof ApiError) // API errors are expected (e.g. wrong API key or rate limit or invalid return data)
    ) {
      traceException(e);
      logger.error(
        `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId}`,
        e,
      );
      throw e;
    }

    return;
  }
};
