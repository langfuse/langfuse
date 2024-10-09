import { Job, Queue } from "bullmq";
import { ApiError, BaseError } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../features/evaluation/eval-service";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { sql } from "kysely";
import {
  createNewRedisInstance,
  QueueName,
  TQueueJobTypes,
  logger,
  traceException,
  recordIncrement,
  recordHistogram,
  recordGauge,
  getTraceUpsertQueue,
} from "@langfuse/shared/src/server";

let evalQueue: Queue<TQueueJobTypes[QueueName.EvaluationExecution]> | null =
  null;

export const getEvalQueue = () => {
  if (evalQueue) return evalQueue;

  const connection = createNewRedisInstance();

  evalQueue = connection
    ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(
        QueueName.EvaluationExecution,
        {
          connection: connection,
        }
      )
    : null;

  return evalQueue;
};

export const evalJobCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.TraceUpsert]>
) => {
  try {
    const startTime = Date.now();

    const waitTime = Date.now() - job.timestamp;
    recordIncrement("langfuse.queue.trace_upsert.request");
    recordHistogram("langfuse.queue.trace_upsert.wait_time", waitTime, {
      unit: "milliseconds",
    });

    await createEvalJobs({ event: job.data.payload });

    await getTraceUpsertQueue()
      ?.count()
      .then((count) => {
        logger.debug(`Eval creation queue length: ${count}`);
        recordGauge("trace_upsert_queue_length", count, {
          unit: "records",
        });
        return count;
      })
      .catch();
    recordHistogram(
      "langfuse.queue.trace_upsert.processing_time",
      Date.now() - startTime,
      { unit: "milliseconds" }
    );
    return true;
  } catch (e) {
    logger.error(
      `Failed job Evaluation for traceId ${job.data.payload.traceId}`,
      e
    );
    traceException(e);
    throw e;
  }
};

export const evalJobExecutorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>
) => {
  try {
    logger.info("Executing Evaluation Execution Job", job.data);
    const startTime = Date.now();

    // reduce the delay from the time to get the actual wait time
    // from the point where the job was ready to be processed
    // reduce the delay by expo backoff: 2 ^ (attempts - 1) * delay, delay: 1000ms
    const estimatedBackoffTime =
      job.attemptsMade > 0 ? 1000 * Math.pow(2, job.attemptsMade - 1) : 0;

    const normalisedWaitTime =
      Date.now() -
      job.timestamp -
      (job.data.payload.delay ?? 0) -
      estimatedBackoffTime;

    recordIncrement("langfuse.queue.evaluation_execution.request");
    recordHistogram(
      "langfuse.queue.evaluation_execution.wait_time",
      normalisedWaitTime,
      {
        unit: "milliseconds",
      }
    );

    await evaluate({ event: job.data.payload });

    await getEvalQueue()
      ?.count()
      .then((count) => {
        logger.debug(`Eval execution queue length: ${count}`);
        recordGauge("langfuse.queue.evaluation_execution.length", count, {
          unit: "records",
        });
        return count;
      })
      .catch();
    recordHistogram(
      "langfuse.queue.evaluation_execution.processing_time",
      Date.now() - startTime,
      { unit: "milliseconds" }
    );

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
      !(e instanceof BaseError && e.message.includes("API key for provider")) ||
      !(
        e instanceof BaseError &&
        e.message.includes(
          "Please ensure the mapped data exists and consider extending the job delay."
        )
      )
    ) {
      traceException(e);
      logger.error(
        `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId}`,
        e
      );
    }

    // for missing API keys, we do not want to retry.
    if (e instanceof BaseError && e.message.includes("API key for provider")) {
      return;
    }

    throw e;
  }
};
