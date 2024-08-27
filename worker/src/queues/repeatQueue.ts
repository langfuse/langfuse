import { Queue, Worker } from "bullmq";

import {
  redis,
  QueueJobs,
  QueueName,
  createNewRedisInstance,
} from "@langfuse/shared/src/server";
import { enqueueBatchExportJobs } from "../features/batchExport/enqueueBatchExportJobs";

export const repeatQueue = redis
  ? new Queue(QueueName.RepeatQueue, {
      connection: redis,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    })
  : null;

if (repeatQueue) {
  repeatQueue.add(
    QueueJobs.EnqueueBatchExportJobs,
    {},
    {
      repeat: { pattern: "*/10 * * * *" },
    }
  );
}

const createRepeatQueueExecutor = () => {
  const redisInstance = createNewRedisInstance();
  if (redisInstance) {
    return new Worker(
      QueueName.RepeatQueue,
      async (job) => {
        if (job.name === QueueJobs.EnqueueBatchExportJobs) {
          return enqueueBatchExportJobs();
        }
      },
      {
        connection: redisInstance,
      }
    );
  }
  return null;
};

export const repeatQueueExecutor = createRepeatQueueExecutor();
