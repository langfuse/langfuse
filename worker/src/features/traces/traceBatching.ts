import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
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

// ARGV: page limit, retention ms, fixed cutoff (empty on first page),
//       previous cursor score (empty on first page), previous cursor member.
// Header: now, cutoff, pending, ready, oldest, expired,
//         next cursor score, next cursor member, done (0 or 1).
// Payload: member, JSON state, due score triplets.
// Pass the returned cutoff/cursor unchanged to the next call. Cursor advances
// over every inspected member, including entries whose state was missing.
const SNAPSHOT_SCRIPT = `
  ${EXPIRE_PENDING_SCRIPT}
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local limit = tonumber(ARGV[1])
  local retention = tonumber(ARGV[2])
  local cutoff = tonumber(ARGV[3]) or now
  local cursorScore = ARGV[4]
  local cursorMember = ARGV[5]
  local expired = expirePending(now, retention, limit)
  local retentionCutoff = now - retention

  -- Rank offsets alone can skip rows when ingestion moves entries or TTL
  -- cleanup removes them. Resume strictly after the (score, member) cursor.
  local start = 0
  if cursorScore ~= '' then
    local score = tonumber(cursorScore)
    local currentScore = redis.call('ZSCORE', KEYS[1], cursorMember)
    if currentScore and tonumber(currentScore) == score then
      start = redis.call('ZRANK', KEYS[1], cursorMember) + 1
    else
      -- Find the first equal-score member after the cursor. When none remain,
      -- this resolves to the first rank with a greater score.
      local low = redis.call('ZCOUNT', KEYS[1], '-inf', '(' .. cursorScore)
      local high = redis.call('ZCOUNT', KEYS[1], '-inf', cursorScore)
      while low < high do
        local middle = math.floor((low + high) / 2)
        local member = redis.call('ZRANGE', KEYS[1], middle, middle)[1]
        if member <= cursorMember then
          low = middle + 1
        else
          high = middle
        end
      end
      start = low
    end
  end

  -- Expiration cleanup is bounded, so some expired rows may remain in the
  -- index. Never enqueue them, even while their cleanup spans multiple pages.
  local expiredRanks = redis.call('ZCOUNT', KEYS[1], '-inf', retentionCutoff)
  start = math.max(start, expiredRanks)
  local dueEnd = redis.call('ZCOUNT', KEYS[1], '-inf', cutoff)
  local last = math.min(start + limit, dueEnd) - 1
  local page = {}
  if start < dueEnd then
    page = redis.call('ZRANGE', KEYS[1], start, last, 'WITHSCORES')
  end
  local pending = redis.call('ZCARD', KEYS[1])
  local ready = math.max(0, dueEnd - expiredRanks)
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local result = {now, cutoff, pending, ready, first[2] or tostring(now), expired,
    cursorScore, cursorMember, 0}
  for i = 1, #page, 2 do
    result[7] = page[i + 1]
    result[8] = page[i]
    local state = redis.call('HGET', KEYS[2], page[i])
    if state then
      table.insert(result, page[i])
      table.insert(result, state)
      table.insert(result, page[i + 1])
    else
      redis.call('ZREM', KEYS[1], page[i])
    end
  end
  -- If cleanup filled its page, another call may still have expired state to
  -- remove. This drains expired backlog without one unbounded Lua invocation.
  if (start >= dueEnd or last + 1 >= dueEnd) and expired < limit then
    result[9] = 1
  end
  return result
`;

// Collection can take time: discard revisions that were reactivated or expired
// before delivery. The post-enqueue ACK still protects arrivals during enqueue.
const VALIDATE_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local valid = {}
  for i = 3, #ARGV, 2 do
    local due = tonumber(redis.call('ZSCORE', KEYS[1], ARGV[i]))
    local state = redis.call('HGET', KEYS[2], ARGV[i])
    if due and due <= tonumber(ARGV[1]) and due > now - tonumber(ARGV[2])
      and state and cjson.decode(state).revision == ARGV[i + 1] then
      table.insert(valid, (i - 3) / 2 + 1)
    end
  end
  return valid
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
    let directory: string | undefined;
    let spool: DatabaseSync | undefined;
    let insert: StatementSync | undefined;
    let cutoff = "";
    let cursorScore = "";
    let cursorMember = "";
    let collected = 0;

    try {
      // The fixed cutoff makes this a finite cohort. Each page captures its
      // current revisions atomically; later activity stays pending for another run.
      while (!this.stopping) {
        await this.extendLockOnProgress();
        const snapshot = (await redis.eval(
          SNAPSHOT_SCRIPT,
          2,
          DUE_KEY,
          STATE_KEY,
          CHUNK_SIZE,
          env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
          cutoff,
          cursorScore,
          cursorMember,
        )) as (string | number)[];
        const [now, , pending, ready, oldest, expired] = snapshot
          .slice(0, 6)
          .map(Number);
        cutoff = String(snapshot[1]);
        cursorScore = String(snapshot[6]);
        cursorMember = String(snapshot[7]);
        recordIncrement("langfuse.trace_batch.expired_traces", expired);
        recordGauge("langfuse.trace_batch.pending_traces", pending);
        recordGauge("langfuse.trace_batch.ready_traces", ready);
        recordGauge(
          "langfuse.trace_batch.oldest_due_age_ms",
          Math.max(0, now - oldest),
        );

        if (snapshot.length > 9) {
          if (!spool) {
            directory = await mkdtemp(join(tmpdir(), "langfuse-trace-batch-"));
            // Node 24 provides SQLite. Load it only for an active, nonempty run.
            const { DatabaseSync } = await import("node:sqlite");
            spool = new DatabaseSync(join(directory, "due.sqlite"));
            // Scratch data is recoverable from Redis until enqueue succeeds.
            // Store the ordering on disk, with an 8 MiB page-cache target.
            spool.exec(`
              PRAGMA journal_mode = OFF;
              PRAGMA synchronous = OFF;
              PRAGMA cache_size = -8192;
              PRAGMA mmap_size = 0;
              CREATE TABLE due (
                project_id TEXT NOT NULL, due INTEGER NOT NULL,
                member TEXT NOT NULL, state TEXT NOT NULL,
                PRIMARY KEY (project_id, due, member)
              ) WITHOUT ROWID;
            `);
            insert = spool.prepare("INSERT INTO due VALUES (?, ?, ?, ?)");
          }
          spool.exec("BEGIN");
          for (let i = 9; i < snapshot.length; i += 3) {
            const member = String(snapshot[i]);
            const [projectId] = JSON.parse(member) as [string, string];
            insert!.run(
              projectId,
              Number(snapshot[i + 2]),
              member,
              String(snapshot[i + 1]),
            );
            collected++;
          }
          spool.exec("COMMIT");
        }
        if (Number(snapshot[8]) === 1) break;
      }
      if (this.stopping || !spool || !directory) return;
      recordDistribution("langfuse.trace_batch.snapshot_size", collected);
      recordDistribution(
        "langfuse.trace_batch.spool_bytes",
        (await stat(join(directory, "due.sqlite"))).size,
      );

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

      // The table's primary key supplies global binary project-ID ordering.
      // Keep a batch across read pages, so page boundaries never split batches.
      const rows = spool
        .prepare(
          "SELECT member, due, state FROM due ORDER BY project_id, due, member",
        )
        .iterate();
      let batch: PendingTrace[] = [];
      let exhausted = false;
      while (!this.stopping && !exhausted) {
        await this.extendLockOnProgress();
        const candidates: PendingTrace[] = [];
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const row = rows.next();
          if (row.done) {
            exhausted = true;
            break;
          }
          const member = String(row.value.member);
          const [projectId, traceId] = JSON.parse(member) as [string, string];
          candidates.push({
            member,
            due: Number(row.value.due),
            trace: TraceBatchTraceSchema.parse({
              ...JSON.parse(String(row.value.state)),
              projectId,
              traceId,
            }),
          });
        }
        if (candidates.length === 0) break;
        const valid = (await redis.eval(
          VALIDATE_SCRIPT,
          2,
          DUE_KEY,
          STATE_KEY,
          cutoff,
          env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
          ...candidates.flatMap(({ member, trace }) => [
            member,
            trace.revision,
          ]),
        )) as number[];
        recordIncrement(
          "langfuse.trace_batch.skipped_traces",
          candidates.length - valid.length,
        );
        for (const index of valid) {
          if (this.stopping) return;
          batch.push(candidates[index - 1]);
          if (batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE) {
            await enqueue(batch);
            batch = [];
          }
        }
      }
      if (!this.stopping && batch.length > 0) await enqueue(batch);
    } finally {
      try {
        spool?.close();
      } finally {
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    }
  }
}
