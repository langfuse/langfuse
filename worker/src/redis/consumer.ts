import Redis from "ioredis";
import { Job, Queue, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../eval-service";
import { env } from "../env";
import { kyselyPrisma } from "@langfuse/shared/src/db";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_AUTH,
  maxRetriesPerRequest: 0,
});

export const evalQueue = new Queue<
  TQueueJobTypes[QueueName.Evaluation_Execution]
>(QueueName.Evaluation_Execution, {
  connection: redis,
});

export const evalJobCreator = new Worker<TQueueJobTypes[QueueName.Evaluation]>(
  QueueName.Evaluation,
  async (job: Job<TQueueJobTypes[QueueName.Evaluation]>) => {
    try {
      console.log("Executing Evaluation Job", job.data);

      await createEvalJobs({ data: job.data.payload });
      return true;
    } catch (e) {
      console.error(
        `Failed  job Evaluation for traceId ${job.data.payload.data.traceId}`,
        e
      );
      throw e;
    }
  },
  {
    connection: redis,
  }
);

export const evalJobExecutor = new Worker<
  TQueueJobTypes[QueueName.Evaluation_Execution]
>(
  QueueName.Evaluation_Execution,
  async (job: Job<TQueueJobTypes[QueueName.Evaluation_Execution]>) => {
    try {
      console.log("Executing Evaluation Execution Job", job.data);
      // Optionally report some progress
      // await job.updateProgress(42);
      // // Optionally sending an object as progress
      // await job.updateProgress({ foo: "bar" });
      await evaluate({ data: job.data.payload });
      return true;
    } catch (e) {
      console.error(
        `Failed Evaluation_Execution job for id ${job.data.payload.data.jobExecutionId}`,
        e
      );
      await kyselyPrisma.$kysely
        .updateTable("job_executions")
        .set("status", "failed")
        .set("error", JSON.stringify(e))
        .where("id", "=", job.data.payload.data.jobExecutionId)
        .where("project_id", "=", job.data.payload.data.projectId)
        .execute();
      throw e;
    }
  },
  {
    connection: redis,
  }
);
