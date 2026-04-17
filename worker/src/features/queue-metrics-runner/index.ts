import { Queue } from "bullmq";

import {
  QueueName,
  convertQueueNameToMetricName,
  recordGauge,
  logger,
} from "@langfuse/shared/src/server";

import { PeriodicRunner } from "../../utils/PeriodicRunner";
import { env } from "../../env";
import { WorkerManager } from "../../queues/workerManager";
import {
  SHARDED_QUEUES,
  SHARDED_QUEUE_BASE_NAMES,
  resolveQueueInstance,
} from "../../queues/shardedQueueRegistry";

type DepthType = "waiting" | "failed" | "active";

async function collectDepth(
  queue: Queue,
): Promise<Record<DepthType, number> | null> {
  // Include "paused" to match getWaitingCount() semantics (which sums waiting + paused)
  const counts = await queue.getJobCounts(
    "waiting",
    "paused",
    "failed",
    "active",
  );
  return {
    waiting: (counts.waiting ?? 0) + (counts.paused ?? 0),
    failed: counts.failed ?? 0,
    active: counts.active ?? 0,
  };
}

function emitDepth(
  metricBase: string,
  depths: Record<DepthType, number>,
  tags?: Record<string, string>,
): void {
  for (const type of ["waiting", "failed", "active"] as const) {
    recordGauge(metricBase + ".depth", depths[type], {
      ...tags,
      type,
      unit: "records",
    });
  }
}

export class QueueMetricsRunner extends PeriodicRunner {
  protected get name(): string {
    return "queue-metrics-runner";
  }

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_QUEUE_METRICS_INTERVAL_MS;
  }

  protected async execute(): Promise<void> {
    // Only poll queues that have registered workers. This avoids calling
    // getInstance() on queues this worker doesn't consume, which would
    // create unnecessary Redis connections and can trigger side effects
    // (e.g. CloudUsageMeteringQueue.getInstance() enqueues cron jobs).
    const registeredNames = new Set(WorkerManager.getRegisteredQueueNames());
    const promises: Promise<void>[] = [];

    // Non-sharded queues: only poll queues with registered workers
    for (const queueName of Object.values(QueueName)) {
      if (SHARDED_QUEUE_BASE_NAMES.has(queueName)) continue;
      if (!registeredNames.has(queueName)) continue;

      const queue = resolveQueueInstance(queueName);
      if (!queue) continue;

      const metricBase = convertQueueNameToMetricName(queueName);

      promises.push(
        collectDepth(queue)
          .then((depths) => {
            if (depths) {
              emitDepth(metricBase, depths);
              // Old-style metrics for backward compatibility.
              // These duplicate what workerManager.metricWrapper emits on job
              // completion. Both sources coexist during migration — once dashboards
              // switch to the new .depth metrics, remove all but .depth
              recordGauge(metricBase + ".length", depths.waiting, {
                unit: "records",
              });
              recordGauge(metricBase + ".dlq_length", depths.failed, {
                unit: "records",
              });
              recordGauge(metricBase + ".active", depths.active, {
                unit: "records",
              });
            }
          })
          .catch((err) => {
            logger.error(
              `Queue metrics: failed to collect depth for ${queueName}`,
              err,
            );
          }),
      );
    }

    // Sharded queues: only poll shards with registered workers
    for (const config of SHARDED_QUEUES) {
      const shardNames = config
        .getShardNames()
        .filter((name) => registeredNames.has(name));
      if (shardNames.length === 0) continue;

      const metricBase = convertQueueNameToMetricName(config.baseQueueName);

      const shardPromises = shardNames.map((shardName) => {
        const queue = config.getInstance(shardName);
        if (!queue) return Promise.resolve(null);

        return collectDepth(queue)
          .then((depths) => {
            if (depths) {
              emitDepth(metricBase, depths, {
                shard: shardName,
              });
            }
            return depths;
          })
          .catch((err) => {
            logger.error(
              `Queue metrics: failed to collect depth for ${shardName}`,
              err,
            );
            return null;
          });
      });

      // Emit aggregate depth across all shards (shard:"all") once per-shard collection settles.
      // If some shards failed, extrapolate from the successful ones to avoid under-reporting.
      promises.push(
        Promise.allSettled(shardPromises).then((results) => {
          const aggregate: Record<DepthType, number> = {
            waiting: 0,
            failed: 0,
            active: 0,
          };

          let succeededCount = 0;
          for (const result of results) {
            if (result.status === "fulfilled" && result.value) {
              aggregate.waiting += result.value.waiting;
              aggregate.failed += result.value.failed;
              aggregate.active += result.value.active;
              succeededCount++;
            }
          }

          if (succeededCount === 0) return;

          if (succeededCount < results.length) {
            const scale = results.length / succeededCount;
            aggregate.waiting = Math.round(aggregate.waiting * scale);
            aggregate.failed = Math.round(aggregate.failed * scale);
            aggregate.active = Math.round(aggregate.active * scale);
          }

          emitDepth(metricBase, aggregate, { shard: "all" });
        }),
      );
    }

    await Promise.allSettled(promises);
  }
}
