import { Queue, Worker } from "bullmq";

import { redis } from "../redis";
import { enqueueBatchExportJobs } from "../features/batchExport/enqueueBatchExportJobs";
import { QueueJobs, QueueName } from "@langfuse/shared";

export const repeatQueue = redis
  ? new Queue(QueueName.RepeatQueue, { connection: redis })
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

export const repeatQueueExecutor = redis
  ? new Worker(
      QueueName.RepeatQueue,
      async (job) => {
        if (job.name === QueueJobs.EnqueueBatchExportJobs) {
          return enqueueBatchExportJobs();
        }
      },
      {
        connection: redis,
      }
    )
  : null;
