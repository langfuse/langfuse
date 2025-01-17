import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";
import { env } from "../../env";

export class MeteringDataPostgresExportQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (env.LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED !== "true") {
      return null;
    }

    if (MeteringDataPostgresExportQueue.instance) {
      return MeteringDataPostgresExportQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MeteringDataPostgresExportQueue.instance = newRedis
      ? new Queue(QueueName.MeteringDataPostgresExportQueue, {
          connection: newRedis,
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

    MeteringDataPostgresExportQueue.instance?.on("error", (err) => {
      logger.error("MeteringDataPostgresExportQueue error", err);
    });

    if (MeteringDataPostgresExportQueue.instance) {
      logger.debug("Scheduling jobs for MeteringDataPostgresExportQueue");
      MeteringDataPostgresExportQueue.instance
        .add(
          QueueJobs.MeteringDataPostgresExportJob,
          {},
          {
            // repeat: { pattern: "30 3 * * *" }, // every day at 3:30am UTC
            repeat: { pattern: "0 * * * *" }, // initially, run every hour
          },
        )
        .catch((err) => {
          logger.error(
            "Error adding MeteringDataPostgresExportJob schedule",
            err,
          );
        });
    }

    return MeteringDataPostgresExportQueue.instance;
  }
}
