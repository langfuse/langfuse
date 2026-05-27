import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import {
  createNewRedisInstance,
  redisQueueRetryOptions,
  getQueuePrefix,
} from "./redis";
import { logger } from "../logger";

const RECURRING_JOB_ID = "monitor-scheduler-recurring";
const TICK_INTERVAL_MS = 30_000;

export class MonitorSchedulerQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (MonitorSchedulerQueue.instance) return MonitorSchedulerQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    MonitorSchedulerQueue.instance = newRedis
      ? new Queue(QueueName.MonitorSchedulerQueue, {
          connection: newRedis,
          prefix: getQueuePrefix(QueueName.MonitorSchedulerQueue),
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 1,
          },
        })
      : null;

    MonitorSchedulerQueue.instance?.on("error", (err) => {
      logger.error("MonitorSchedulerQueue error", err);
    });

    MonitorSchedulerQueue.instance
      ?.add(
        QueueJobs.MonitorSchedulerTickJob,
        {},
        {
          jobId: RECURRING_JOB_ID,
          repeat: { every: TICK_INTERVAL_MS },
        },
      )
      .catch((err) => {
        logger.error("[MonitorSchedulerQueue] failed to schedule tick", err);
      });

    return MonitorSchedulerQueue.instance;
  }
}
