import { Job, Processor, Worker, WorkerOptions } from "bullmq";
import {
  convertQueueNameToMetricName,
  createNewRedisInstance,
  getQueuePrefix,
  logger,
  QueueName,
  recordGauge,
  recordHistogram,
  recordIncrement,
  redisQueueRetryOptions,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  resolveQueueInstance,
  SHARDED_QUEUE_BASE_NAMES,
} from "./shardedQueueRegistry";

export class WorkerManager {
  private static workers: { [key: string]: Worker } = {};

  private static resolveMetricInfo(queueName: QueueName): {
    baseMetric: string;
    shardTag: { shard: string } | undefined;
  } {
    for (const base of SHARDED_QUEUE_BASE_NAMES) {
      if (queueName.startsWith(base)) {
        return {
          baseMetric: convertQueueNameToMetricName(base),
          shardTag: { shard: queueName },
        };
      }
    }
    return {
      baseMetric: convertQueueNameToMetricName(queueName),
      shardTag: undefined,
    };
  }

  private static metricWrapper(
    processor: Processor,
    queueName: QueueName,
  ): Processor {
    const oldMetric = convertQueueNameToMetricName(queueName);
    const { baseMetric, shardTag } = WorkerManager.resolveMetricInfo(queueName);

    return async (job: Job) => {
      const startTime = Date.now();
      const waitTime = Date.now() - job.timestamp;

      recordIncrement(oldMetric + ".request");
      recordIncrement(baseMetric + ".rate", 1, {
        type: "request",
        ...shardTag,
      });

      recordHistogram(oldMetric + ".wait_time", waitTime, {
        unit: "milliseconds",
      });
      recordHistogram(baseMetric + ".time", waitTime, {
        type: "wait",
        unit: "milliseconds",
        ...shardTag,
      });

      const result = await processor(job);

      const queue = resolveQueueInstance(queueName);
      // Sample queue depth gauges for sharded queues to reduce metric volume.
      const shouldSample =
        !shardTag || Math.random() < env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE;

      if (shouldSample) {
        Promise.allSettled([
          // Here we only consider waiting jobs instead of the default ("waiting" or "delayed"
          // or "prioritized" or "waiting-children") that count provides
          queue?.getWaitingCount().then((count) => {
            recordGauge(oldMetric + ".length", count, {
              unit: "records",
            });
          }),
          queue?.getFailedCount().then((count) => {
            recordGauge(oldMetric + ".dlq_length", count, {
              unit: "records",
            });
          }),
          queue?.getActiveCount().then((count) => {
            recordGauge(oldMetric + ".active", count, {
              unit: "records",
            });
          }),
        ]).catch((err) => {
          logger.error("Failed to record queue length", err);
        });
      }

      const processingTime = Date.now() - startTime;
      recordHistogram(oldMetric + ".processing_time", processingTime, {
        unit: "milliseconds",
      });
      recordHistogram(baseMetric + ".time", processingTime, {
        type: "processing",
        unit: "milliseconds",
        ...shardTag,
      });

      return result;
    };
  }

  public static async closeWorkers(): Promise<void> {
    await Promise.all(
      Object.values(WorkerManager.workers).map((worker) => worker.close()),
    );
    logger.info("All workers have been closed.");
  }

  public static getWorker(queueName: QueueName): Worker | undefined {
    return WorkerManager.workers[queueName];
  }

  public static getRegisteredQueueNames(): string[] {
    return Object.keys(WorkerManager.workers);
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
        prefix: getQueuePrefix(queueName),
        ...additionalOptions,
      },
    );
    WorkerManager.workers[queueName] = worker;
    logger.info(`${queueName} executor started: ${worker.isRunning()}`);

    const oldMetric = convertQueueNameToMetricName(queueName);
    const { baseMetric, shardTag } = WorkerManager.resolveMetricInfo(queueName);

    // Add error handling
    worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error(
        `Queue job ${job?.name} with id ${job?.id} in ${queueName} failed`,
        err,
      );
      traceException(err);
      recordIncrement(oldMetric + ".failed");
      recordIncrement(baseMetric + ".rate", 1, {
        type: "failed",
        ...shardTag,
      });
    });
    worker.on("error", (failedReason: Error) => {
      logger.error(
        `Queue job ${queueName} errored: ${failedReason}`,
        failedReason,
      );
      traceException(failedReason);
      recordIncrement(oldMetric + ".error");
      recordIncrement(baseMetric + ".rate", 1, {
        type: "error",
        ...shardTag,
      });
    });
  }
}
