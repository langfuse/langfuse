import { Processor, Queue } from "bullmq";

import { redis, QueueJobs, QueueName } from "@langfuse/shared/src/server";
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
    },
  );
}

export const repeatQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.EnqueueBatchExportJobs) {
    return enqueueBatchExportJobs();
  }
};
