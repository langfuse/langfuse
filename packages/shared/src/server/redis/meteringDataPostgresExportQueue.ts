import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
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

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.MeteringDataPostgresExportQueue,
    );
    MeteringDataPostgresExportQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.MeteringDataPostgresExportQueue, {
          ...queueOptionsWithRedis,
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
      scheduleRecurringJob(MeteringDataPostgresExportQueue.instance, {
        jobName: QueueJobs.MeteringDataPostgresExportJob,
        pattern: "30 2 * * *", // every day at 2:30am UTC
      });
    }

    return MeteringDataPostgresExportQueue.instance;
  }
}
