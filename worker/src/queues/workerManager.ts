import { Job, Processor, Worker, WorkerOptions } from "bullmq";
import {
  logger,
  createNewRedisInstance,
  recordIncrement,
  convertQueueNameToMetricName,
} from "@langfuse/shared/src/server";

export class WorkerManager {
  private static workers: { [key: string]: Worker } = {};

  public static async closeWorkers(): Promise<void> {
    await Promise.all(
      Object.values(WorkerManager.workers).map((worker) => worker.close()),
    );
    logger.info("All workers have been closed.");
  }

  public static register(
    queueName: string,
    processor: Processor,
    additionalOptions: Partial<WorkerOptions> = {},
  ): void {
    if (WorkerManager.workers[queueName]) {
      logger.info(`Worker ${queueName} is already registered`);
      return;
    }

    // Create redis connection for queue worker
    const redisInstance = createNewRedisInstance({
      retryStrategy: (times: number) => {
        // https://docs.bullmq.io/guide/going-to-production#retrystrategy
        // Retries forever. Waits at least 1s and at most 20s between retries.
        logger.debug(`Connection to redis lost. Retry attempt: ${times}`);
        return Math.max(Math.min(Math.exp(times), 20000), 1000);
      },
      reconnectOnError: (err: Error) => {
        logger.warn(`Failed to connect to redis: ${err}. Reconnecting...`);
        return true;
      },
    });
    if (!redisInstance) {
      logger.error("Failed to initialize redis connection");
      return;
    }

    // Register worker
    const worker = new Worker(queueName, processor, {
      connection: redisInstance,
      ...additionalOptions,
    });
    WorkerManager.workers[queueName] = worker;
    logger.info(`${queueName} executor started: ${worker.isRunning()}`);

    // Add error handling
    worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error(
        `Queue Job ${job?.name} with id ${job?.id} in ${queueName} failed`,
        err,
      );
      recordIncrement(convertQueueNameToMetricName(queueName + ".failed"));
    });
    worker.on("error", (failedReason: Error) => {
      logger.error(`Queue worker ${queueName} failed: ${failedReason}`);
      recordIncrement(convertQueueNameToMetricName(queueName + ".error"));
    });
  }
}
