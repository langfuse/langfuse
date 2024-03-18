import Redis from "ioredis";
import { Job, Worker } from "bullmq";
import { QueueName, TQueueJobTypes } from "shared/src/queues/index";
import { createEvalJobs } from "../eval-service";

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_AUTH,
  maxRetriesPerRequest: 0,
});

export const consumer = new Worker<TQueueJobTypes[QueueName.Evaluation]>(
  "evaluation-job",
  async (job: Job<TQueueJobTypes[QueueName.Evaluation]>) => {
    console.log("job", job.data);

    await createEvalJobs({ event: job.data.payload });

    console.log(job.data);

    // Do something with job
    return "some value";
  },
  {
    connection: redis,
  }
);
