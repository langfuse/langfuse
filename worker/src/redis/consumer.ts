import { Job, Queue, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../eval-service";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import logger from "../logger";
import { sql } from "kysely";
import { redis } from "./redis";
import { instrumentAsync } from "../instrumentation";

export const evalQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.EvaluationExecution]>(
      QueueName.EvaluationExecution,
      {
        connection: redis,
      }
    )
  : null;

export const evalJobCreator = redis
  ? new Worker<TQueueJobTypes[QueueName.TraceUpsert]>(
      QueueName.TraceUpsert,
      async (job: Job<TQueueJobTypes[QueueName.TraceUpsert]>) => {
        return instrumentAsync({ name: "evalJobCreator" }, async (span) => {
          try {
            await createEvalJobs({ data: job.data.payload });
            return true;
          } catch (e) {
            logger.error(
              e,
              `Failed job Evaluation for traceId ${job.data.payload.data.traceId}`
            );
            throw e;
          } finally {
            span?.end();
          }
        });
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
        return instrumentAsync({ name: "evalJobExecutor" }, async (span) => {
          try {
            logger.info("Executing Evaluation Execution Job", job.data);
            await evaluate({ data: job.data.payload });
            return true;
          } catch (e) {
            logger.error(
              e,
              `Failed Evaluation_Execution job for id ${job.data.payload.data.jobExecutionId}`
            );
            await kyselyPrisma.$kysely
              .updateTable("job_executions")
              .set("status", sql`'ERROR'::"JobExecutionStatus"`)
              .set("end_time", new Date())
              .set("error", JSON.stringify(e))
              .where("id", "=", job.data.payload.data.jobExecutionId)
              .where("project_id", "=", job.data.payload.data.projectId)
              .execute();
            throw e;
          } finally {
            span?.end();
          }
        });
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
