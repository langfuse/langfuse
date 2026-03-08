import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

export class MetricAlertQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MetricAlertQueue.instance) {
      return MetricAlertQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MetricAlertQueue.instance = newRedis
      ? new Queue(QueueName.MetricAlertQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.MetricAlertQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        })
      : null;

    MetricAlertQueue.instance?.on("error", (err) => {
      logger.error("MetricAlertQueue error", err);
    });

    if (MetricAlertQueue.instance) {
      logger.info("[MetricAlertQueue] Scheduling recurring job", {
        pattern: "*/5 * * * *",
        jobId: "metric-alert-recurring",
        timestamp: new Date().toISOString(),
      });
      MetricAlertQueue.instance.add(
        QueueJobs.MetricAlertJob,
        {},
        {
          repeat: { pattern: "*/5 * * * *" },
          jobId: "metric-alert-recurring",
        },
      );
    }

    return MetricAlertQueue.instance;
  }
}
