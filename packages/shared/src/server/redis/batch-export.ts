import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { redis } from "./redis";

let batchExportQueue: Queue<TQueueJobTypes[QueueName.BatchExport]> | null =
  null;

export const getBatchExportQueue = () => {
  if (batchExportQueue) return batchExportQueue;

  batchExportQueue = redis
    ? new Queue<TQueueJobTypes[QueueName.BatchExport]>(QueueName.BatchExport, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 2,
        },
      })
    : null;

  return batchExportQueue;
};
