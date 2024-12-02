import { Queue } from "bullmq";
import { QueueName, QueueJobs, TQueueJobTypes } from "../queues";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";
import { v4 as uuidv4 } from "uuid";

export class CloudPlanLimitEvaluatorQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.CloudPlanLimitEvaluatorQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.CloudPlanLimitEvaluatorQueue]
  > | null {
    if (CloudPlanLimitEvaluatorQueue.instance) {
      return CloudPlanLimitEvaluatorQueue.instance;
    }

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    CloudPlanLimitEvaluatorQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.CloudPlanLimitEvaluatorQueue]>(
          QueueName.CloudPlanLimitEvaluatorQueue,
          {
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
          },
        )
      : null;

    CloudPlanLimitEvaluatorQueue.instance?.on("error", (err) => {
      logger.error("CloudPlanLimitEvaluatorQueue error", err);
    });

    if (CloudPlanLimitEvaluatorQueue.instance) {
      // Schedule to run every hour
      CloudPlanLimitEvaluatorQueue.instance.add(
        QueueJobs.CloudPlanLimitEvaluatorJob,
        {
          timestamp: new Date(),
          id: uuidv4(),
          name: QueueJobs.CloudPlanLimitEvaluatorJob,
        },
        {
          repeat: { pattern: "0 * * * *" }, // Run at minute 0 of every hour
        },
      );

      // Add initial job
      CloudPlanLimitEvaluatorQueue.instance.add(
        QueueJobs.CloudPlanLimitEvaluatorJob,
        {
          timestamp: new Date(),
          id: uuidv4(),
          name: QueueJobs.CloudPlanLimitEvaluatorJob,
        },
        {},
      );
    }

    return CloudPlanLimitEvaluatorQueue.instance;
  }
}
