import Redis from "ioredis";
import { Job, Queue, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared";
import { evaluate, createEvalJobs } from "../eval-service";
import { env } from "../env";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
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
    console.log("job", job.data);
    // Optionally report some progress
    // await job.updateProgress(42);
    // // Optionally sending an object as progress
    // await job.updateProgress({ foo: "bar" });
    await createEvalJobs({ data: job.data.payload });

    console.log(job.data);
    // Do something with job
    return "some value";
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
    console.log("job", job.data);
    // Optionally report some progress
    // await job.updateProgress(42);
    // // Optionally sending an object as progress
    // await job.updateProgress({ foo: "bar" });
    await evaluate({ data: job.data.payload });

    console.log(job.data);
    // Do something with job
    return "some value";
  },
  {
    connection: redis,
  }
);
