import { Job, Processor, Queue, Worker, WorkerOptions } from "bullmq";
import {
  getQueue,
  convertQueueNameToMetricName,
  createNewRedisInstance,
  logger,
  QueueName,
  recordGauge,
  recordHistogram,
  recordIncrement,
  redisQueueRetryOptions,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../env";

export class WorkerManager {
  private static workers: { [key: string]: Worker } = {};

  private static getQueue(queueName: QueueName): Queue | null {
    return getQueue(queueName);
  }

  private static metricWrapper(
    processor: Processor,
    queueName: QueueName,
  ): Processor {
    return async (job: Job) => {
      const startTime = Date.now();
      const waitTime = Date.now() - job.timestamp;
      recordIncrement(convertQueueNameToMetricName(queueName) + ".request");
      recordHistogram(
        convertQueueNameToMetricName(queueName) + ".wait_time",
        waitTime,
        {
          unit: "milliseconds",
        },
      );
      const result = await processor(job);

      // Collect queue metrics if enabled (defaults to true)
      const collectQueueMetrics =
        env.LANGFUSE_COLLECT_QUEUE_LENGTH_METRICS !== "false";
      if (collectQueueMetrics) {
        const queue = WorkerManager.getQueue(queueName);
        await Promise.allSettled([
          queue?.count().then((count) => {
            recordGauge(
              convertQueueNameToMetricName(queueName) + ".length",
              count,
              {
                unit: "records",
              },
            );
          }),
          queue?.getFailedCount().then((count) => {
            recordGauge(
              convertQueueNameToMetricName(queueName) + ".dlq_length",
              count,
              {
                unit: "records",
              },
            );
          }),
        ]);
      }
      recordHistogram(
        convertQueueNameToMetricName(queueName) + ".processing_time",
        Date.now() - startTime,
        { unit: "milliseconds" },
      );
      return result;
    };
  }

  public static async closeWorkers(): Promise<void> {
    await Promise.all(
      Object.values(WorkerManager.workers).map((worker) => worker.close()),
    );
    logger.info("All workers have been closed.");
  }

  public static register(
    queueName: QueueName,
    processor: Processor,
    additionalOptions: Partial<WorkerOptions> = {},
  ): void {
    if (WorkerManager.workers[queueName]) {
      logger.info(`Worker ${queueName} is already registered`);
      return;
    }

    // Create redis connection for queue worker
    const redisInstance = createNewRedisInstance(redisQueueRetryOptions);
    if (!redisInstance) {
      logger.error("Failed to initialize redis connection");
      return;
    }

    // Register worker
    const worker = new Worker(
      queueName,
      WorkerManager.metricWrapper(processor, queueName),
      {
        connection: redisInstance,
        ...additionalOptions,
      },
    );
    WorkerManager.workers[queueName] = worker;
    logger.info(`${queueName} executor started: ${worker.isRunning()}`);

    // Add error handling
    worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error(
        `Queue job ${job?.name} with id ${job?.id} in ${queueName} failed`,
        err,
      );
      traceException(err);
      recordIncrement(convertQueueNameToMetricName(queueName) + ".failed");
    });
    worker.on("error", (failedReason: Error) => {
      logger.error(
        `Queue job ${queueName} errored: ${failedReason}`,
        failedReason,
      );
      traceException(failedReason);
      recordIncrement(convertQueueNameToMetricName(queueName) + ".error");
    });
  }
}
