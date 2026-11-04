import {
  logger,
  recordGauge,
  recordIncrement,
  redis,
  TraceBatchQueue,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { recordTraceBatchActiveReads } from "../../queues/traceBatchQueue";
import { PeriodicRunner } from "../../utils/PeriodicRunner";
import {
  getTraceBatchFirstKeys,
  getTraceBatchReadinessKeys,
  MEMORY_SCRIPT,
} from "./traceBatchReadiness";
import { getRecordingBoundsKeys, getRecordingKeys } from "./traceRuleRecording";

const METRIC_PREFIX = "langfuse.trace_batch";
const MEMORY_INTERVAL_MS = 60_000;

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
    const collectQueue =
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED === "true" ||
      env.QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED === "true";
    const collectRecording =
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED === "true";
    if (
      !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
      (!collectQueue && !collectRecording)
    ) {
      return;
    }

    const collections: Promise<void>[] = [];
    if (collectQueue) {
      recordTraceBatchActiveReads();
      collections.push(this.collectQueueDepth(), this.collectWaitingHeadAge());
    }
    const now = Date.now();
    if (
      this.lastMemorySampleAt === null ||
      now - this.lastMemorySampleAt >= MEMORY_INTERVAL_MS
    ) {
      this.lastMemorySampleAt = now;
      for (const layout of ["trace_batch", "trace_dispatch"] as const) {
        if (layout === "trace_dispatch" && !collectRecording) continue;
        const collection = this.collectMemory(layout);
        if (layout === "trace_batch" && collectQueue) {
          collections.push(collection);
          continue;
        }
        collections.push(
          collection
            .then(() => {
              recordIncrement("langfuse.trace_dispatch.memory_samples", 1, {
                outcome: "success",
                layout,
              });
            })
            .catch((error) => {
              // Experiment telemetry must not mark the worker run as errored.
              recordIncrement("langfuse.trace_dispatch.memory_samples", 1, {
                outcome: "error",
                layout,
              });
              logger.warn("Trace rule memory collection failed", {
                layout,
                error,
              });
            }),
        );
      }
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
    // Waiting, active, and failed depth are already on the generic queue gauge.
    const counts = await queue.getJobCounts("delayed");
    recordGauge(`${METRIC_PREFIX}.queue_depth`, counts.delayed ?? 0, {
      type: "delayed",
      unit: "records",
    });
  }

  private async collectWaitingHeadAge(): Promise<void> {
    const queue = TraceBatchQueue.getInstance();
    if (!queue) throw new Error("Trace batch queue is unavailable");
    // BullMQ returns the next FIFO entry in each of waiting and paused. A retry
    // can re-enter behind newer jobs, so this is not the oldest creation time
    // anywhere in the queue. Jobs can disappear between ID and hash reads.
    const ids = await queue.getRanges(["wait", "paused"], 0, 0, true);
    const client = await queue.client;
    const timestamps = await Promise.all(
      ids.map((id) => client.hget(queue.toKey(id), "timestamp")),
    );
    const now = Date.now();
    const ages = timestamps.flatMap((timestamp) =>
      timestamp !== null && Number.isFinite(Number(timestamp))
        ? [now - Number(timestamp)]
        : [],
    );
    recordGauge(
      `${METRIC_PREFIX}.queue_waiting_head_age_ms`,
      Math.max(0, ...ages),
      { unit: "milliseconds" },
    );
  }

  private async collectMemory(
    layout: "trace_batch" | "trace_dispatch",
  ): Promise<void> {
    if (!redis) throw new Error("Trace batch metrics require Redis");
    const clock = await redis.time();
    const now = Number(clock[0]) * 1_000 + Math.floor(Number(clock[1]) / 1_000);
    const totals = [0, 0, 0, 0, 0, 0];
    for (let shard = 0; shard < env.LANGFUSE_TRACE_BATCH_SHARD_COUNT; shard++) {
      const keys =
        layout === "trace_batch"
          ? getTraceBatchReadinessKeys(shard)
          : getRecordingKeys(shard);
      const history =
        layout === "trace_batch"
          ? getTraceBatchFirstKeys(shard, now)
          : getRecordingBoundsKeys(shard, now);
      const values = (await redis.eval(
        MEMORY_SCRIPT,
        2 + history.keys.length,
        keys.due,
        "state" in keys ? keys.state : keys.record,
        ...history.keys,
      )) as number[];
      values.forEach((value, index) => (totals[index] += Number(value)));
    }
    // Per-shard series would multiply custom metrics by the shard count on
    // every reporting worker; only the summed totals are emitted.
    this.recordMapMemory(layout, totals);
  }

  private recordMapMemory(
    layout: "trace_batch" | "trace_dispatch",
    values: number[],
  ): void {
    const [
      dueBytes,
      dueEntries,
      stateBytes,
      stateEntries,
      firstBytes,
      firstEntries,
    ] = values;
    // These are global snapshots emitted by each eligible worker. Aggregate
    // duplicate reporters with max/latest, never sum their identical gauges.
    for (const { key, bytes, entries } of [
      { key: "due", bytes: dueBytes, entries: dueEntries },
      {
        key: layout === "trace_batch" ? "state" : "record",
        bytes: stateBytes,
        entries: stateEntries,
      },
      {
        key: layout === "trace_batch" ? "first" : "bounds",
        bytes: firstBytes,
        entries: firstEntries,
      },
    ]) {
      recordGauge(`langfuse.${layout}.redis_key_bytes`, bytes, {
        key,
        shard: "total",
        unit: "bytes",
      });
      recordGauge(`langfuse.${layout}.redis_key_entries`, entries, {
        key,
        shard: "total",
        unit: "records",
      });
    }
  }
}
