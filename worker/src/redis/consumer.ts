import Redis from "ioredis";
import { Job, Queue, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../eval-service";
import { env } from "../env";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import logger from "../logger";
import { sql } from "kysely";
import Sentry from "@sentry/node";

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

if (env.NODE_ENV !== "production") globalThis.redis = redis;

type CallbackAsyncFn<T> = (span?: Sentry.Span) => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  if (env.SENTRY_DSN) {
    return Sentry.startSpan(ctx, async (span) => {
      return callback(span);
    });
  } else {
    return callback();
  }
}

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
            logger.info("Executing Evaluation Job", job.data);

            await createEvalJobs({ data: job.data.payload });
            return true;
          } catch (e) {
            logger.error(
              e,
              `Failed job Evaluation for traceId ${job.data.payload.data.traceId}`
            );
            throw e;
          } finally {
            span?.finish();
          }
        });
      },
      {
        connection: redis,
        concurrency: 50,
        // limiter: {
        //   // execute 100 calls in 1000ms
        //   max: 50,
        //   duration: 1000,
        // },
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
          }
        });
      },
      {
        connection: redis,
        concurrency: 20,
        // limiter: {
        //   // execute 20 llm calls in 5 seconds
        //   max: 20,
        //   duration: 5_000,
        // },
      }
    )
  : null;
