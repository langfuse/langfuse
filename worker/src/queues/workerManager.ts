import { Job, Processor, Worker, WorkerOptions } from "bullmq";
import { context as otelContext } from "@opentelemetry/api";
import {
  convertQueueNameToMetricName,
  contextWithLangfuseProps,
  createBullMQWorkerOptionsWithRedis,
  logger,
  QueueName,
  recordDistribution,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import {
  markQueueJobActivity,
  markQueueWorkerRegistered,
} from "../features/health/queueConsumption";
import { WORKER_HOST_ID } from "../utils/hostId";
import { env } from "../env";
import { SHARDED_QUEUE_BASE_NAMES } from "./shardedQueueRegistry";

export class WorkerManager {
  private static workers: { [key: string]: Worker } = {};

  private static extractProjectId(job: Job): string | undefined {
    const data = job.data as {
      payload?: {
        projectId?: unknown;
        authCheck?: { scope?: { projectId?: unknown } };
      };
    };

    const candidates = [
      data.payload?.projectId,
      data.payload?.authCheck?.scope?.projectId,
    ];

    return candidates.find((candidate): candidate is string => {
      return typeof candidate === "string" && candidate.length > 0;
    });
  }

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

  // Empty failed set emits 0 so monitors see the gauge reset after a DLQ
  // drain.
  public static computeDlqOldestAgeMs(
    jobs: (Job | undefined)[],
    nowMs: number,
  ): number {
    const oldest = jobs.find(Boolean);
    return oldest ? nowMs - (oldest.finishedOn ?? oldest.timestamp) : 0;
  }

  private static metricWrapper(
    processor: Processor,
    queueName: QueueName,
  ): Processor {
    const { baseMetric, shardTag } = WorkerManager.resolveMetricInfo(queueName);

    return async (job: Job) => {
      const startTime = Date.now();
      const waitTime = Date.now() - job.timestamp;

      recordIncrement(baseMetric + ".rate", 1, {
        type: "request",
        ...shardTag,
      });

      recordDistribution(baseMetric + ".time_distribution", waitTime, {
        type: "wait",
        unit: "milliseconds",
        ...shardTag,
      });

      const clickHouseCtx = contextWithLangfuseProps({
        projectId: WorkerManager.extractProjectId(job),
        clickhouse: {
          surface: "worker",
          route: baseMetric,
        },
      });
      const result = await otelContext.with(clickHouseCtx, () =>
        processor(job),
      );

      const processingTime = Date.now() - startTime;
      recordDistribution(baseMetric + ".time_distribution", processingTime, {
        type: "processing",
        unit: "milliseconds",
        ...shardTag,
      });

      return result;
    };
  }

  /**
   * Closes every registered BullMQ worker, waiting for their active jobs.
   * Resolves false when workers are still busy after `timeoutMs` so the caller
   * can flush and exit before the orchestrator's stop timeout kills the
   * process; the abandoned jobs are picked up again by stalled-job recovery.
   */
  public static async closeWorkers(
    timeoutMs: number = env.LANGFUSE_SHUTDOWN_QUEUE_CLOSE_TIMEOUT_MS,
  ): Promise<boolean> {
    const pending = new Set(Object.keys(WorkerManager.workers));
    const closeAll = Promise.all(
      Object.entries(WorkerManager.workers).map(([queueName, worker]) =>
        worker
          .close()
          .catch((error) => {
            logger.error(`Failed to close worker for ${queueName}`, error);
          })
          .finally(() => {
            pending.delete(queueName);
          }),
      ),
    );

    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      closeAll.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), timeoutMs);
      }),
    ]);
    clearTimeout(timer);

    if (timedOut) {
      logger.warn(
        `Queue workers did not close within ${timeoutMs}ms, continuing shutdown with active jobs abandoned in: ${[...pending].join(", ")}`,
      );
      return false;
    }

    logger.info("All workers have been closed.");
    return true;
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

    const workerOptionsWithRedis =
      createBullMQWorkerOptionsWithRedis(queueName);
    if (!workerOptionsWithRedis) {
      logger.error("Failed to initialize redis connection");
      return;
    }

    // Register worker
    const worker = new Worker(
      queueName,
      WorkerManager.metricWrapper(processor, queueName),
      {
        ...workerOptionsWithRedis,
        ...additionalOptions,
      },
    );
    WorkerManager.workers[queueName] = worker;
    markQueueWorkerRegistered();
    logger.info(`${queueName} executor started: ${worker.isRunning()}`);

    const { baseMetric, shardTag } = WorkerManager.resolveMetricInfo(queueName);

    // Liveness signal for the ?failIfQueueConsumptionStuck=true health check.
    // "active" and "completed" prove this container's consumption loop is
    // alive; "failed" is excluded because the stalled-checker emits it for
    // jobs this container never picked up.
    worker.on("active", markQueueJobActivity);
    // No "active" counter: metricWrapper already records "request" on pickup.
    worker.on("completed", () => {
      markQueueJobActivity();
      recordIncrement(baseMetric + ".rate", 1, {
        type: "completed",
        ...shardTag,
      });
    });

    // Add error handling
    worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error(
        `Queue job ${job?.name} with id ${job?.id} in ${queueName} failed`,
        err,
      );
      traceException(err);
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
      recordIncrement(baseMetric + ".rate", 1, {
        type: "error",
        ...shardTag,
      });
    });
    // Counts intermediate re-enqueues (LFE-10063), not just the terminal
    // "stalled more than allowable limit" the "failed" handler catches.
    worker.on("stalled", (jobId: string) => {
      // detectedOnHost: the stall-checker pod, which may differ from the pod
      // whose lock expired.
      logger.warn(
        `Queue job ${jobId} in ${queueName} stalled (lock expired, re-enqueued) detectedOnHost=${WORKER_HOST_ID}`,
      );
      recordIncrement(baseMetric + ".rate", 1, {
        type: "stalled",
        ...shardTag,
      });
    });
  }
}
