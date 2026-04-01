import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";
import { env } from "../../env";

export class CoreDataS3ExportQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (env.LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED !== "true") {
      return null;
    }

    if (CoreDataS3ExportQueue.instance) {
      return CoreDataS3ExportQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    CoreDataS3ExportQueue.instance = newRedis
      ? new Queue(QueueName.CoreDataS3ExportQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.CoreDataS3ExportQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    CoreDataS3ExportQueue.instance?.on("error", (err) => {
      logger.error("CoreDataS3ExportQueue error", err);
    });

    if (CoreDataS3ExportQueue.instance) {
      logger.debug("Scheduling jobs for CoreDataS3ExportQueue");
      CoreDataS3ExportQueue.instance
        .add(
          QueueJobs.CoreDataS3ExportJob,
          {},
          {
            repeat: { pattern: "15 3 * * *" }, // every day at 3:15am
          },
        )
        .catch((err) => {
          logger.error("Error adding CoreDataS3ExportJob schedule", err);
        });
    }

    return CoreDataS3ExportQueue.instance;
  }
}
