import { Job, Processor, Queue, Worker, WorkerOptions } from "bullmq";
import {
  BatchExportQueue,
  convertQueueNameToMetricName,
  createNewRedisInstance,
  IngestionQueue,
  LegacyIngestionQueue,
  logger,
  QueueName,
  recordGauge,
  recordHistogram,
  recordIncrement,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { CloudUsageMeteringQueue } from "./cloudUsageMeteringQueue";
import { EvalExecutionQueue } from "./evalQueue";

export class WorkerManager {
  private static workers: { [key: string]: Worker } = {};

  private static getQueue(queueName: QueueName): Queue | null {
    switch (queueName) {
      case QueueName.LegacyIngestionQueue:
        return LegacyIngestionQueue.getInstance();
      case QueueName.BatchExport:
        return BatchExportQueue.getInstance();
      case QueueName.CloudUsageMeteringQueue:
        return CloudUsageMeteringQueue.getInstance();
      case QueueName.EvaluationExecution:
        return EvalExecutionQueue.getInstance();
      case QueueName.TraceUpsert:
        return TraceUpsertQueue.getInstance();
      case QueueName.IngestionQueue:
        return IngestionQueue.getInstance();
      default:
        throw new Error(`Queue ${queueName} not found`);
    }
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
      await WorkerManager.getQueue(queueName)
        ?.count()
        .then((count) => {
          recordGauge(
            convertQueueNameToMetricName(queueName) + ".length",
            count,
            {
              unit: "records",
            },
          );
          return count;
        })
        .catch();
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
        `Queue Job ${job?.name} with id ${job?.id} in ${queueName} failed`,
        err,
      );
      recordIncrement(convertQueueNameToMetricName(queueName) + ".failed");
    });
    worker.on("error", (failedReason: Error) => {
      logger.error(`Queue worker ${queueName} failed: ${failedReason}`);
      recordIncrement(convertQueueNameToMetricName(queueName) + ".error");
    });
  }
}
