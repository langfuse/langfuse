import { Job, Queue, Worker } from "bullmq";
import { ApiError, BaseError } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../features/evaluation/eval-service";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import logger from "../logger";
import { sql } from "kysely";
import {
  redis,
  QueueName,
  TQueueJobTypes,
  traceException,
  instrument,
} from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

export const evalQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(
      QueueName.EvaluationExecution,
      {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: true, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
          removeOnFail: 1000,
        },
      }
    )
  : null;

export const evalJobCreator = redis
  ? new Worker<TQueueJobTypes[QueueName.TraceUpsert]>(
      QueueName.TraceUpsert,
      async (job: Job<TQueueJobTypes[QueueName.TraceUpsert]>) => {
        return instrument(
          {
            name: "evalJobCreator",
            rootSpan: true,
            spanKind: SpanKind.CONSUMER,
          },
          async () => {
            try {
              await createEvalJobs({ event: job.data.payload });
              return true;
            } catch (e) {
              logger.error(
                e,
                `Failed job Evaluation for traceId ${job.data.payload.traceId} ${e}`
              );
              traceException(e);
              throw e;
            }
          }
        );
      },
      {
        connection: redis,
        concurrency: 20,
        limiter: {
          // execute 75 calls in 1000ms
          max: 75,
          duration: 1000,
        },
      }
    )
  : null;

export const evalJobExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.EvaluationExecution]>(
      QueueName.EvaluationExecution,
      async (job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>) => {
        return instrument(
          {
            name: "evalJobExecutor",
            spanKind: SpanKind.CONSUMER,
          },
          async () => {
            try {
              logger.info("Executing Evaluation Execution Job", job.data);
              await evaluate({ event: job.data.payload });
              return true;
            } catch (e) {
              const displayError =
                e instanceof BaseError
                  ? e.message
                  : "An internal error occurred";

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
                  e instanceof BaseError &&
                  e.message.includes("API key for provider")
                )
              ) {
                logger.error(
                  e,
                  `Failed Evaluation_Execution job for id ${job.data.payload.jobExecutionId} ${e}`
                );
              }
              traceException(e);
              throw e;
            }
          }
        );
      },
      {
        connection: redis,
        concurrency: 10,
        limiter: {
          // execute 20 llm calls in 5 seconds
          max: 20,
          duration: 5_000,
        },
      }
    )
  : null;
