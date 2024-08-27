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
          removeOnFail: 100,
          attempts: 2,
        },
      })
    : null;

  return batchExportQueue;
};
