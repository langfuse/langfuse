import { Job, Processor, Worker, WorkerOptions } from "bullmq";
import { context as otelContext } from "@opentelemetry/api";
import {
  convertQueueNameToMetricName,
  contextWithLangfuseProps,
  createBullMQWorkerOptionsWithRedis,
  logger,
  QueueName,
  type TQueueJobTypes,
  recordDistribution,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import {
  markQueueJobActivity,
  markQueueWorkerRegistered,
} from "../features/health/queueConsumption";
import { WORKER_HOST_ID } from "../utils/hostId";
import { logRetryableJobFailure } from "./jobFailureLog";
import { SHARDED_QUEUE_BASE_NAMES } from "./shardedQueueRegistry";
import { classifyJobFailure } from "./jobFailureReason";

export class WorkerManager {
  private static workers: { [key: string]: Worker } = {};

  private static extractProjectId(job: Job): string | undefined {
    const data = job.data as
      | {
          payload?: {
            projectId?: unknown;
            authCheck?: { scope?: { projectId?: unknown } };
          };
        }
      | undefined;

    const candidates = [
      data?.payload?.projectId,
      data?.payload?.authCheck?.scope?.projectId,
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

  /**
   * Queue wait before the current pickup: first attempts measure from
   * timestamp + opts.delay; retries and stall re-runs return undefined because
   * BullMQ keeps no record of when they became ready again.
   */
  public static computeWaitTimeMs(
    job: Pick<
      Job,
      | "timestamp"
      | "opts"
      | "attemptsMade"
      | "attemptsStarted"
      | "stalledCounter"
    >,
    nowMs: number,
  ): { attempt: "first" | "retry"; waitMs: number | undefined } {
    const isRetry =
      (job.attemptsMade ?? 0) > 0 ||
      (job.attemptsStarted ?? 0) > 1 ||
      (job.stalledCounter ?? 0) > 0;
    if (isRetry) {
      return { attempt: "retry", waitMs: undefined };
    }
    const readyAt = job.timestamp + Math.max(0, job.opts?.delay ?? 0);
    return { attempt: "first", waitMs: Math.max(0, nowMs - readyAt) };
  }

  private static metricWrapper<Q extends QueueName>(
    processor: Processor<JobData<Q>>,
    queueName: Q,
    getTags: TagGetter<Q>,
  ): Processor<JobData<Q>> {
    const { baseMetric } = WorkerManager.resolveMetricInfo(queueName);

    return async (job: Job<JobData<Q>>) => {
      const tags = getTags(job);
      const startTime = Date.now();
      const { attempt, waitMs } = WorkerManager.computeWaitTimeMs(
        job,
        startTime,
      );

      recordIncrement(baseMetric + ".rate", 1, {
        type: "request",
        attempt,
        ...tags,
      });

      if (waitMs !== undefined) {
        recordDistribution(baseMetric + ".time_distribution", waitMs, {
          type: "wait",
          attempt,
          unit: "milliseconds",
          ...tags,
        });
      }

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
        ...tags,
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

  public static register<Q extends QueueName>(
    queueName: Q,
    processor: Processor<JobData<Q>>,
    options: RegisterOptions<Q> = {},
  ): void {
    const { metricTags = () => ({}), ...additionalOptions } = options;
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

    const { baseMetric, shardTag } = WorkerManager.resolveMetricInfo(queueName);
    const getTags = newTagGetter(metricTags, shardTag);

    // Register worker
    const worker = new Worker(
      queueName,
      WorkerManager.metricWrapper(processor, queueName, getTags),
      {
        ...workerOptionsWithRedis,
        ...additionalOptions,
      },
    );
    WorkerManager.workers[queueName] = worker;
    markQueueWorkerRegistered();
    logger.info(`${queueName} executor started: ${worker.isRunning()}`);

    // Liveness signal for the ?failIfQueueConsumptionStuck=true health check.
    // "active" and "completed" prove this container's consumption loop is
    // alive; "failed" is excluded because the stalled-checker emits it for
    // jobs this container never picked up.
    worker.on("active", markQueueJobActivity);
    // No "active" counter: metricWrapper already records "request" on pickup.
    worker.on("completed", (job: Job<JobData<Q>> | undefined) => {
      markQueueJobActivity();
      recordIncrement(baseMetric + ".rate", 1, {
        type: "completed",
        ...getTags(job),
      });
    });

    // Add error handling
    worker.on("failed", (job: Job<JobData<Q>> | undefined, err: Error) => {
      const reason = classifyJobFailure(err);
      const tags = getTags(job);
      logRetryableJobFailure({
        message: `Queue job ${job?.name} with id ${job?.id} in ${queueName} failed`,
        error: err,
        job,
        attemptsIncludeCurrentFailure: true,
        fields: {
          projectId: job ? WorkerManager.extractProjectId(job) : undefined,
          jobId: job?.id,
          failureReason: reason,
          // true once BullMQ stops retrying: the job's events are dropped.
          terminal: Boolean(job?.finishedOn),
        },
      });
      recordIncrement(baseMetric + ".rate", 1, {
        type: "failed",
        reason,
        ...tags,
      });
      // BullMQ sets finishedOn only when it moves the job to the failed set
      // instead of scheduling a retry.
      if (job?.finishedOn) {
        recordIncrement(baseMetric + ".rate", 1, {
          type: "failed_terminal",
          reason,
          ...tags,
        });
      }
    });
    worker.on("error", (failedReason: Error) => {
      logger.error(
        `Queue job ${queueName} errored: ${failedReason}`,
        failedReason,
      );
      traceException(failedReason);
      recordIncrement(baseMetric + ".rate", 1, {
        type: "error",
        ...getTags(),
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
        ...getTags(),
      });
    });
  }
}

/** newTagGetter returns the function that tags a queue's metrics with a job's metric tags and the queue's shard. */
function newTagGetter<Q extends QueueName>(
  metricTags: MetricTags<Q>,
  shardTag: { shard: string } | undefined,
): TagGetter<Q> {
  return (job) => {
    if (!job) return { ...shardTag };
    return { ...metricTags(job.data), ...shardTag };
  };
}

/** JobData is the data a queue's jobs carry; cron-only queues send an empty object. */
type JobData<Q extends QueueName> = Q extends keyof TQueueJobTypes
  ? TQueueJobTypes[Q]
  : Record<string, never>;

/** MetricTags derives extra queue-metric tags from a job's data. */
type MetricTags<Q extends QueueName> = (
  data: JobData<Q>,
) => Record<string, string>;

/** RegisterOptions are BullMQ worker options plus the queue's metric tags. */
type RegisterOptions<Q extends QueueName> = Partial<WorkerOptions> & {
  metricTags?: MetricTags<Q>;
};

/** TagGetter tags a queue metric for a job, or for the queue alone when the event has no job. */
type TagGetter<Q extends QueueName> = (
  job?: Job<JobData<Q>>,
) => Record<string, string>;
