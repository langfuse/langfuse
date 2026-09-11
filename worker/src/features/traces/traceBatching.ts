import { createHash, randomUUID } from "node:crypto";
import {
  logger,
  QueueJobs,
  redis,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchEventSchema,
  TraceBatchQueue,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

// The shared client applies REDIS_KEY_PREFIX. Both keys must occupy one
// Redis Cluster slot for the atomic update, snapshot, and acknowledgement.
const DUE_KEY = "{trace-batch}:due";
const STATE_KEY = "{trace-batch}:state";
const CHUNK_SIZE = 1_000;
const RUN_BUDGET_MS = 10_000;
const MAX_TRACES_PER_RUN = 10_000;

const TRACK_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  for i = 2, #ARGV, 4 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local previous = redis.call('HGET', KEYS[2], member)
    if previous then
      local state = cjson.decode(previous)
      minStart = math.min(minStart, state.minStart)
      maxStart = math.max(maxStart, state.maxStart)
    end
    redis.call('HSET', KEYS[2], member, cjson.encode({
      minStart = minStart, maxStart = maxStart, revision = ARGV[i + 3]
    }))
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[1]), member)
  end
  return (#ARGV - 1) / 4
`;

// Snapshot metadata with readiness: an arrival between a separate ZRANGE and
// HMGET must not make a future revision eligible for immediate processing.
const SNAPSHOT_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local result = {now, redis.call('ZCARD', KEYS[1]),
    redis.call('ZCOUNT', KEYS[1], '-inf', now), first[2] or tostring(now)}
  local due = redis.call('ZRANGE', KEYS[1], '-inf', now,
    'BYSCORE', 'LIMIT', 0, ARGV[1], 'WITHSCORES')
  for i = 1, #due, 2 do
    local state = redis.call('HGET', KEYS[2], due[i])
    if state then
      table.insert(result, due[i])
      table.insert(result, state)
      table.insert(result, due[i + 1])
    else
      redis.call('ZREM', KEYS[1], due[i])
    end
  end
  return result
`;

const ACKNOWLEDGE_SCRIPT = `
  local removed = 0
  for i = 1, #ARGV, 2 do
    local state = redis.call('HGET', KEYS[2], ARGV[i])
    if state and cjson.decode(state).revision == ARGV[i + 1] then
      redis.call('ZREM', KEYS[1], ARGV[i])
      redis.call('HDEL', KEYS[2], ARGV[i])
      removed = removed + 1
    end
  end
  return removed
`;

export async function trackTraceBatchActivity(
  projectId: string,
  events: { traceId: string; startTimeISO: string }[],
): Promise<void> {
  if (env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED !== "true") return;

  const bounds = new Map<string, { minStart: number; maxStart: number }>();
  for (const event of events) {
    const start = Date.parse(event.startTimeISO);
    if (!Number.isFinite(start)) continue;
    const previous = bounds.get(event.traceId);
    bounds.set(event.traceId, {
      minStart: Math.min(previous?.minStart ?? start, start),
      maxStart: Math.max(previous?.maxStart ?? start, start),
    });
  }
  if (bounds.size === 0) return;

  try {
    if (!redis) throw new Error("Trace batching requires Redis");
    const entries = [...bounds];
    // Bounded scripts keep ingestion from monopolizing the global Redis slot.
    for (let offset = 0; offset < entries.length; offset += CHUNK_SIZE) {
      const chunk = entries.slice(offset, offset + CHUNK_SIZE);
      await redis.eval(
        TRACK_SCRIPT,
        2,
        DUE_KEY,
        STATE_KEY,
        env.LANGFUSE_TRACE_BATCH_IDLE_MS,
        ...chunk.flatMap(([traceId, state]) => [
          JSON.stringify([projectId, traceId]),
          state.minStart,
          state.maxStart,
          // Unique even after dispatch deletes and a later arrival recreates state.
          randomUUID(),
        ]),
      );
      recordIncrement("langfuse.trace_batch.tracked_traces", chunk.length);
    }
  } catch (error) {
    // This optional load experiment must not fail normal event ingestion.
    recordIncrement("langfuse.trace_batch.tracking_errors", 1);
    logger.error("Failed to track trace batch activity", { error });
  }
}

export class TraceBatchDispatcher extends PeriodicExclusiveRunner {
  private stopping = false;
  private activeDispatch: Promise<void> | null = null;

  constructor() {
    super({
      name: "TraceBatchDispatcher",
      metricName: "trace_batch_dispatcher",
      lockKey: "{trace-batch}:dispatcher",
      lockTtlSeconds: 60,
      onUnavailable: "fail",
    });
  }

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
  }

  public override stop(): void {
    this.stopping = true;
    super.stop();
  }

  public async drain(): Promise<void> {
    this.stop();
    await this.activeDispatch;
  }

  protected async execute(): Promise<void> {
    if (this.stopping || this.activeDispatch) return;
    const dispatch = this.withLock(() => this.dispatchDue()).then(() => {});
    this.activeDispatch = dispatch;
    try {
      await dispatch;
    } finally {
      this.activeDispatch = null;
    }
  }

  private async dispatchDue(): Promise<void> {
    if (!redis) throw new Error("Trace batching requires Redis");
    const queue = TraceBatchQueue.getInstance();
    if (!queue) throw new Error("Trace batch queue is unavailable");
    const started = Date.now();
    let dispatched = 0;

    while (
      !this.stopping &&
      dispatched < MAX_TRACES_PER_RUN &&
      Date.now() - started < RUN_BUDGET_MS
    ) {
      await this.extendLockOnProgress(true);
      const snapshot = (await redis.eval(
        SNAPSHOT_SCRIPT,
        2,
        DUE_KEY,
        STATE_KEY,
        CHUNK_SIZE,
      )) as (string | number)[];
      const [now, pending, ready, oldest] = snapshot.slice(0, 4).map(Number);
      recordGauge("langfuse.trace_batch.pending_traces", pending);
      recordGauge("langfuse.trace_batch.ready_traces", ready);
      recordGauge(
        "langfuse.trace_batch.oldest_due_age_ms",
        Math.max(0, now - oldest),
      );
      if (snapshot.length === 4) return;

      const projects = new Map<
        string,
        {
          member: string;
          due: number;
          trace: TQueueJobTypes[QueueName.TraceBatch]["payload"]["traces"][number];
        }[]
      >();
      for (let i = 4; i < snapshot.length; i += 3) {
        const member = String(snapshot[i]);
        const [projectId, traceId] = JSON.parse(member) as [string, string];
        const trace =
          TraceBatchEventSchema.shape.payload.shape.traces.element.parse({
            ...JSON.parse(String(snapshot[i + 1])),
            traceId,
          });
        const group = projects.get(projectId) ?? [];
        group.push({ member, due: Number(snapshot[i + 2]), trace });
        projects.set(projectId, group);
      }

      for (const [projectId, entries] of projects) {
        for (
          let offset = 0;
          offset < entries.length;
          offset += env.LANGFUSE_TRACE_BATCH_MAX_SIZE
        ) {
          if (this.stopping || Date.now() - started >= RUN_BUDGET_MS) return;
          await this.extendLockOnProgress(true);
          if (this.stopping) return;
          const batch = entries.slice(
            offset,
            offset + env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
          );
          const traces = batch.map(({ trace }) => trace);
          const id = createHash("sha256")
            .update(JSON.stringify([projectId, traces]))
            .digest("hex");
          // Stable IDs reduce duplicate delivery if enqueue succeeds but ACK fails.
          // Reads remain retry-safe even if regrouping produces a different job ID.
          await queue.add(
            QueueJobs.TraceBatch,
            {
              id,
              timestamp: new Date(),
              name: QueueJobs.TraceBatch,
              payload: { projectId, traces },
            },
            { jobId: id },
          );

          recordDistribution("langfuse.trace_batch.size", batch.length);
          recordIncrement(
            "langfuse.trace_batch.dispatched_traces",
            batch.length,
            {
              batch_kind: batch.length === 1 ? "singleton" : "multi",
            },
          );
          for (const entry of batch) {
            recordDistribution(
              "langfuse.trace_batch.due_lag_ms",
              Math.max(0, now - entry.due),
            );
          }
          const removed = Number(
            await redis.eval(
              ACKNOWLEDGE_SCRIPT,
              2,
              DUE_KEY,
              STATE_KEY,
              ...batch.flatMap(({ member, trace }) => [member, trace.revision]),
            ),
          );
          recordIncrement(
            "langfuse.trace_batch.reactivated_traces",
            batch.length - removed,
          );
          dispatched += batch.length;
        }
      }
    }
  }
}
