import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance } from "./redis";

let batchExportQueue: Queue<TQueueJobTypes[QueueName.BatchExport]> | null =
  null;

export const getBatchExportQueue = () => {
  if (batchExportQueue) return batchExportQueue;

  const connection = createNewRedisInstance();

  batchExportQueue = connection
    ? new Queue<TQueueJobTypes[QueueName.BatchExport]>(QueueName.BatchExport, {
        connection: connection,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 10_000,
          attempts: 2,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        },
      })
    : null;

  return batchExportQueue;
};
