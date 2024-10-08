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
  instrumentAsync,
  recordIncrement,
  recordHistogram,
  recordGauge,
  getTraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

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
        },
      )
    : null;

  return evalQueue;
};

export const evalJobCreatorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.TraceUpsert]>,
) => {
  return instrumentAsync(
    {
      name: "evalJobCreator",
      rootSpan: true,
      spanKind: SpanKind.CONSUMER,
      traceContext: job.data?._tracecontext,
    },
    async () => {
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
          { unit: "milliseconds" },
        );
        return true;
      } catch (e) {
        logger.error(
          `Failed job Evaluation for traceId ${job.data.payload.traceId}`,
          e,
        );
        traceException(e);
        throw e;
      }
    },
  );
};

export const evalJobExecutorQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>,
) => {
  return instrumentAsync(
    {
      name: "evalJobExecutor",
      spanKind: SpanKind.CONSUMER,
      traceContext: job.data?._tracecontext,
    },
    async () => {
      try {
        logger.info("Executing Evaluation Execution Job", job.data);
        const startTime = Date.now();

        const waitTime = Date.now() - job.timestamp;
        recordIncrement("langfuse.queue.evaluation_execution.request");
        recordHistogram(
          "langfuse.queue.evaluation_execution.wait_time",
          waitTime,
          {
            unit: "milliseconds",
          },
        );

        await evaluate({ event: job.data.payload });

        await getEvalQueue()
          ?.count()
          .then((count) => {
            logger.debug(`Eval execution queue length: ${count}`);
            recordGauge("eval_execution_queue_length", count, {
              unit: "records",
            });
            return count;
          })
          .catch();
        recordHistogram(
          "langfuse.queue.evaluation_execution.processing_time",
          Date.now() - startTime,
          { unit: "milliseconds" },
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
          !(e instanceof ApiError) &&
          !(
            e instanceof BaseError && e.message.includes("API key for provider")
          )
        ) {
          traceException(e);
          logger.error(
            `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId}`,
            e,
          );
        }

        throw e;
      }
    },
  );
};
