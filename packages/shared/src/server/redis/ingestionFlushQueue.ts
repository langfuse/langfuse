import { Queue } from "bullmq";

import { env } from "../../env";
import { createNewRedisInstance } from "../redis/redis";
import { QueueName } from "../queues";

export type IngestionFlushQueue = Queue<null>;

let ingestionFlushQueue: IngestionFlushQueue | null = null;

export const getIngestionFlushQueue = () => {
  if (ingestionFlushQueue) return ingestionFlushQueue;

  const connection = createNewRedisInstance();

  ingestionFlushQueue = connection
    ? new Queue<null>(QueueName.IngestionFlushQueue, {
        connection: connection,
        defaultJobOptions: {
          removeOnComplete: true, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
          removeOnFail: 1_000,
          delay: env.LANGFUSE_INGESTION_FLUSH_DELAY_MS,
          attempts: env.LANGFUSE_INGESTION_FLUSH_ATTEMPTS,
        },
      })
    : null;

  return ingestionFlushQueue;
};
