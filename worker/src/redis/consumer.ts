import Redis from "ioredis";
import { Job, Worker } from "bullmq";
import { QueueJobs, QueueName, TQueueJobTypes } from "shared/src/queues/queues";
import { evaluate } from "../eval-service";

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_AUTH,
  maxRetriesPerRequest: 0,
});

export const worker = new Worker<TQueueJobTypes[QueueName.Evaluation]>(
  QueueJobs.Evaluation,
  async (job: Job<TQueueJobTypes[QueueName.Evaluation]>) => {
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
