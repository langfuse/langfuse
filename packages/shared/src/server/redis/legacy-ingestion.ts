import { Queue } from "bullmq";
import { QueueName, TQueueJobTypes } from "../queues";
import { createNewRedisInstance } from "./redis";

let legacyIngestionQueue: Queue<
  TQueueJobTypes[QueueName.LegacyIngestionQueue]
> | null = null;

export const getLegacyIngestionQueue = () => {
  if (legacyIngestionQueue) return legacyIngestionQueue;

  const newRedis = createNewRedisInstance();

  legacyIngestionQueue = newRedis
    ? new Queue<TQueueJobTypes[QueueName.LegacyIngestionQueue]>(
        QueueName.LegacyIngestionQueue,
        {
          connection: newRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
          },
        }
      )
    : null;

  return legacyIngestionQueue;
};
