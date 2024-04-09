import Redis from "ioredis";
import { Job, Queue, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../eval-service";
import { env } from "../env";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import logger from "../logger";
import { sql } from "kysely";

const createRedisClient = () => {
  try {
    return new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_AUTH,
      maxRetriesPerRequest: null, // Set to `null` to disable retrying
    });
  } catch (e) {
    logger.error(e, "Failed to connect to redis");
    return null;
  }
};

declare global {
  // eslint-disable-next-line no-var
  var redis: undefined | ReturnType<typeof createRedisClient>;
}

export const redis = globalThis.redis ?? createRedisClient();

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
        try {
          logger.info("Executing Evaluation Job", job.data);

          await createEvalJobs({ data: job.data.payload });
          return true;
        } catch (e) {
          logger.error(
            e,
            `Failed  job Evaluation for traceId ${job.data.payload.data.traceId}`
          );
          throw e;
        }
      },
      {
        connection: redis,
        limiter: {
          max: 100,
          duration: 10_000,
        },
      }
    )
  : null;

export const evalJobExecutor = redis
  ? new Worker<TQueueJobTypes[QueueName.EvaluationExecution]>(
      QueueName.EvaluationExecution,
      async (job: Job<TQueueJobTypes[QueueName.EvaluationExecution]>) => {
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
        }
      },
      {
        connection: redis,
        limiter: {
          max: 10,
          duration: 30_000,
        },
      }
    )
  : null;
