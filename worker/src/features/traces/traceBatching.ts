import { createHash, randomUUID } from "node:crypto";
import {
  logger,
  QueueJobs,
  redis,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchTraceSchema,
  TraceBatchQueue,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

// The shared client applies REDIS_KEY_PREFIX. Both keys must occupy one
// Redis Cluster slot for the atomic update, snapshot, and acknowledgement.
const DUE_KEY = "{trace-batch}:due";
const STATE_KEY = "{trace-batch}:state";
const CHUNK_SIZE = 1_000;
type PendingTrace = {
  member: string;
  due: number;
  trace: TQueueJobTypes[QueueName.TraceBatch]["payload"]["traces"][number];
};

// Retain traces for a bounded time after readiness. Reuse the due index so
// cleanup needs neither a full hash scan nor expiry of shared Redis keys.
const EXPIRE_PENDING_SCRIPT = `
  local function expirePending(now, retention, limit)
    local expired = redis.call('ZRANGE', KEYS[1], '-inf', now - retention,
      'BYSCORE', 'LIMIT', 0, limit)
    for _, member in ipairs(expired) do
      redis.call('ZREM', KEYS[1], member)
      redis.call('HDEL', KEYS[2], member)
    end
    return #expired
  end
`;

const TRACK_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  for i = 3, #ARGV, 4 do
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
  return expirePending(now, tonumber(ARGV[2]), ${CHUNK_SIZE})
`;

// Cleanup stays bounded even when the dispatcher has accumulated a backlog.
// Keep the first Redis timestamp as the cutoff throughout this run.
const SNAPSHOT_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local retention = tonumber(ARGV[1])
  local cutoff = tonumber(ARGV[2]) or now
  local expired = expirePending(now, retention, ${CHUNK_SIZE})
  local pending = redis.call('ZCARD', KEYS[1])
  local ready = math.max(0, redis.call('ZCOUNT', KEYS[1], '-inf', cutoff)
    - redis.call('ZCOUNT', KEYS[1], '-inf', now - retention))
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {now, cutoff, pending, ready, first[2] or tostring(now), expired}
`;

// Fetch state only while it is still due for this run. Checking the score and
// reading the revision atomically prevents dispatching freshly reactivated work.
const HYDRATE_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local result = {}
  for i = 3, #ARGV do
    local member = ARGV[i]
    local due = tonumber(redis.call('ZSCORE', KEYS[1], member))
    if due and due <= tonumber(ARGV[1]) and due > now - tonumber(ARGV[2]) then
      local state = redis.call('HGET', KEYS[2], member)
      if state then
        table.insert(result, member)
        table.insert(result, state)
        table.insert(result, tostring(due))
      else
        redis.call('ZREM', KEYS[1], member)
      end
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
    const samplingRate = env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
    // Sample by trace ID so later observations and retries keep the same decision.
    // Dispatcher and consumer process admitted work without resampling.
    const entries = [...bounds].filter(
      ([traceId]) =>
        samplingRate === 1 ||
        (samplingRate > 0 &&
          shouldSampleEvaluation({
            samplingValue: getDeterministicSamplingValue(traceId),
            samplingRate,
          })),
    );
    recordGauge("langfuse.trace_batch.sampling_rate", samplingRate);
    // Counts distinct trace IDs per ingestion batch, not globally unique traces.
    recordIncrement("langfuse.trace_batch.sampling_decisions", entries.length, {
      decision: "selected",
    });
    recordIncrement(
      "langfuse.trace_batch.sampling_decisions",
      bounds.size - entries.length,
      { decision: "excluded" },
    );
    if (entries.length === 0) return;
    if (!redis) throw new Error("Trace batching requires Redis");
    // Bounded scripts keep ingestion from monopolizing the global Redis slot.
    for (let offset = 0; offset < entries.length; offset += CHUNK_SIZE) {
      const chunk = entries.slice(offset, offset + CHUNK_SIZE);
      const expired = Number(
        await redis.eval(
          TRACK_SCRIPT,
          2,
          DUE_KEY,
          STATE_KEY,
          env.LANGFUSE_TRACE_BATCH_IDLE_MS,
          env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
          ...chunk.flatMap(([traceId, state]) => [
            JSON.stringify([projectId, traceId]),
            state.minStart,
            state.maxStart,
            // Unique even after dispatch deletes and a later arrival recreates state.
            randomUUID(),
          ]),
        ),
      );
      recordIncrement("langfuse.trace_batch.expired_traces", expired);
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

  protected async execute(): Promise<number | void> {
    if (this.stopping || this.activeDispatch) return;
    const startedAt = Date.now();
    const dispatch = this.withLock(() => this.dispatchDue()).then(() => {});
    this.activeDispatch = dispatch;
    try {
      await dispatch;
    } finally {
      this.activeDispatch = null;
    }
    // PeriodicRunner waits this delay after completion. Account for work time
    // to maintain the configured start cadence without overlapping runs.
    return Math.max(0, this.defaultIntervalMs - (Date.now() - startedAt));
  }

  private async dispatchDue(): Promise<void> {
    if (!redis) throw new Error("Trace batching requires Redis");
    const queue = TraceBatchQueue.getInstance();
    if (!queue) throw new Error("Trace batch queue is unavailable");
    let cutoff = "";
    let now = 0;
    while (!this.stopping) {
      await this.extendLockOnProgress();
      const snapshot = (await redis.eval(
        SNAPSHOT_SCRIPT,
        2,
        DUE_KEY,
        STATE_KEY,
        env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
        cutoff,
      )) as (string | number)[];
      const [clock, , pending, ready, oldest, expired] = snapshot.map(Number);
      now = clock;
      cutoff = String(snapshot[1]);
      recordIncrement("langfuse.trace_batch.expired_traces", expired);
      recordGauge("langfuse.trace_batch.pending_traces", pending);
      recordGauge("langfuse.trace_batch.ready_traces", ready);
      recordGauge(
        "langfuse.trace_batch.oldest_due_age_ms",
        Math.max(0, now - oldest),
      );
      if (expired < CHUNK_SIZE) break;
    }
    if (this.stopping) return;

    // One range read captures all due IDs without cursor races or loading every
    // trace's state. Memory and the Redis response size grow with the due cohort.
    const members = (
      await redis.zrange(
        DUE_KEY,
        `(${now - env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS}`,
        cutoff,
        "BYSCORE",
      )
    ).map((member) => ({
      member,
      projectId: (JSON.parse(member) as [string, string])[0],
    }));
    // Stable sorting keeps Redis readiness order within each project.
    members.sort((a, b) =>
      a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0,
    );
    recordDistribution("langfuse.trace_batch.snapshot_size", members.length);

    const enqueue = async (batch: PendingTrace[]) => {
      await this.extendLockOnProgress(true);
      if (this.stopping) return;
      const traces = batch.map(({ trace }) => trace);
      const id = createHash("sha256")
        .update(JSON.stringify(traces))
        .digest("hex");
      // Stable IDs reduce duplicate delivery if enqueue succeeds but ACK fails.
      // Reads remain retry-safe even if regrouping produces a different job ID.
      await queue.add(
        QueueJobs.TraceBatch,
        {
          id,
          timestamp: new Date(),
          name: QueueJobs.TraceBatch,
          payload: { traces },
        },
        { jobId: id },
      );
      recordDistribution("langfuse.trace_batch.size", batch.length);
      recordDistribution(
        "langfuse.trace_batch.project_count",
        new Set(traces.map((trace) => trace.projectId)).size,
      );
      recordIncrement("langfuse.trace_batch.dispatched_traces", batch.length, {
        batch_kind: batch.length === 1 ? "singleton" : "multi",
      });
      for (const entry of batch) {
        recordDistribution(
          "langfuse.trace_batch.due_lag_ms",
          Math.max(0, Date.now() - entry.due),
        );
      }
      const removed = Number(
        await redis!.eval(
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
    };

    let batch: PendingTrace[] = [];
    for (
      let offset = 0;
      offset < members.length && !this.stopping;
      offset += CHUNK_SIZE
    ) {
      await this.extendLockOnProgress();
      const candidates = members.slice(offset, offset + CHUNK_SIZE);
      const hydrated = (await redis.eval(
        HYDRATE_SCRIPT,
        2,
        DUE_KEY,
        STATE_KEY,
        cutoff,
        env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
        ...candidates.map(({ member }) => member),
      )) as string[];
      recordIncrement(
        "langfuse.trace_batch.skipped_traces",
        candidates.length - hydrated.length / 3,
      );
      for (let i = 0; i < hydrated.length; i += 3) {
        if (this.stopping) return;
        const member = hydrated[i];
        const [projectId, traceId] = JSON.parse(member) as [string, string];
        batch.push({
          member,
          due: Number(hydrated[i + 2]),
          trace: TraceBatchTraceSchema.parse({
            ...JSON.parse(hydrated[i + 1]),
            projectId,
            traceId,
          }),
        });
        if (batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE) {
          await enqueue(batch);
          batch = [];
        }
      }
    }
    if (!this.stopping && batch.length > 0) await enqueue(batch);
  }
}
