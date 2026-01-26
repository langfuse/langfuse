import { Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class MediaRetentionCleanerQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MediaRetentionCleanerQueue.instance) {
      return MediaRetentionCleanerQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MediaRetentionCleanerQueue.instance = newRedis
      ? new Queue(QueueName.MediaRetentionCleanerQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.MediaRetentionCleanerQueue),
        })
      : null;

    MediaRetentionCleanerQueue.instance?.on("error", (err) => {
      logger.error("MediaRetentionCleanerQueue error", err);
    });

    return MediaRetentionCleanerQueue.instance;
  }
}
