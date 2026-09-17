import {
  logger,
  recordGauge,
  redis,
  TraceBatchQueue,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicRunner } from "../../utils/PeriodicRunner";

const METRIC_PREFIX = "langfuse.trace_batch";
const MEMORY_INTERVAL_MS = 60_000;
// EVAL applies the shared client's key prefix and routes both keys to their
// cluster slot. Raw MEMORY commands do not identify keys in ioredis metadata.
const MEMORY_SCRIPT = `
return {
  redis.call('MEMORY', 'USAGE', KEYS[1], 'SAMPLES', 5) or 0,
  redis.call('ZCARD', KEYS[1]),
  redis.call('MEMORY', 'USAGE', KEYS[2], 'SAMPLES', 5) or 0,
  redis.call('HLEN', KEYS[2])
}
`;

export class TraceBatchMetricsRunner extends PeriodicRunner {
  private lastMemorySampleAt: number | null = null;

  constructor() {
    super("trace_batch_metrics");
  }

  protected get name(): string {
    return "trace-batch-metrics";
  }

  protected get defaultIntervalMs(): number {
    return 30_000;
  }

  protected async execute(): Promise<void> {
    if (
      !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
      (env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED !== "true" &&
        env.QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED !== "true")
    ) {
      return;
    }

    const collections = [
      this.collectQueueDepth(),
      this.collectWaitingHeadAge(),
    ];
    const now = Date.now();
    if (
      this.lastMemorySampleAt === null ||
      now - this.lastMemorySampleAt >= MEMORY_INTERVAL_MS
    ) {
      this.lastMemorySampleAt = now;
      collections.push(this.collectMemory());
    }

    // Each collection remains useful if another fails. Never replace a failed
    // measurement with zero or leave issued Redis commands unawaited.
    const results = await Promise.allSettled(collections);
    for (const result of results) {
      if (result.status === "rejected") {
        this.markRunFailed(result.reason);
        logger.error("Trace batch metrics collection failed", {
          error: result.reason,
        });
      }
    }
  }

  private async collectQueueDepth(): Promise<void> {
    const queue = TraceBatchQueue.getInstance();
    if (!queue) throw new Error("Trace batch queue is unavailable");
    const counts = await queue.getJobCounts(
      "waiting",
      "paused",
      "active",
      "delayed",
      "failed",
    );
    const depths = {
      waiting: (counts.waiting ?? 0) + (counts.paused ?? 0),
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
    for (const [type, depth] of Object.entries(depths)) {
      recordGauge(`${METRIC_PREFIX}.queue_depth`, depth, {
        type,
        unit: "records",
      });
    }
  }

  private async collectWaitingHeadAge(): Promise<void> {
    const queue = TraceBatchQueue.getInstance();
    if (!queue) throw new Error("Trace batch queue is unavailable");
    // BullMQ returns the next FIFO entry in each of waiting and paused. A retry
    // can re-enter behind newer jobs, so this is not the oldest creation time
    // anywhere in the queue. Jobs can disappear between ID and hash reads.
    const heads = await queue.getWaiting(0, 0);
    const now = Date.now();
    const ages = heads.flatMap((job) => (job ? [now - job.timestamp] : []));
    recordGauge(
      `${METRIC_PREFIX}.queue_waiting_head_age_ms`,
      Math.max(0, ...ages),
      { unit: "milliseconds" },
    );
  }

  private async collectMemory(): Promise<void> {
    if (!redis) throw new Error("Trace batch metrics require Redis");
    const [dueBytes, dueEntries, stateBytes, stateEntries] = (await redis.eval(
      MEMORY_SCRIPT,
      2,
      "{trace-batch}:due",
      "{trace-batch}:state",
    )) as number[];
    // These are global snapshots emitted by each eligible worker. Aggregate
    // duplicate reporters with max/latest, never sum their identical gauges.
    for (const { key, bytes, entries } of [
      { key: "due", bytes: dueBytes, entries: dueEntries },
      { key: "state", bytes: stateBytes, entries: stateEntries },
    ]) {
      recordGauge(`${METRIC_PREFIX}.redis_key_bytes`, bytes, {
        key,
        unit: "bytes",
      });
      recordGauge(`${METRIC_PREFIX}.redis_key_entries`, entries, {
        key,
        unit: "records",
      });
    }
  }
}
