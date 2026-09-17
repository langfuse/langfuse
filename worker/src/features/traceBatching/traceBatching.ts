import { createHash, randomUUID } from "node:crypto";
import { xxh32 } from "@node-rs/xxhash";
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
const QUERY_BUFFER_MS = 2 * 60_000;
const MINUTE_MS = 60_000;
const NARROW_BATCH_MAX_ENVELOPE_MS = 60 * MINUTE_MS;
const WIDE_MAX_EXPANSION_RATIO = 0.25;

export type TraceBatchStrategy = "project" | "locality";
export type PendingTrace = {
  member: string;
  due: number;
  estimates?: { eventUpdateCount: number; serializedEventBytes: number };
  trace: TQueueJobTypes[QueueName.TraceBatch]["payload"]["traces"][number];
};

const compareNumbers = (left: number, right: number) => left - right;

const compareStrings = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const toMinuteBucket = (timestamp: number) => Math.floor(timestamp / MINUTE_MS);

const getSpanMs = ({ trace }: PendingTrace) => trace.maxStart - trace.minStart;

const allowedEnvelopeMs = (seed: PendingTrace) =>
  Math.max(
    NARROW_BATCH_MAX_ENVELOPE_MS,
    getSpanMs(seed) * (1 + WIDE_MAX_EXPANSION_RATIO),
  );

type LocalityCandidate = {
  entry: PendingTrace;
  minMinute: number;
  maxMinute: number;
  traceHash: number;
};

const toLocalityCandidate = (entry: PendingTrace): LocalityCandidate => ({
  entry,
  minMinute: toMinuteBucket(entry.trace.minStart),
  maxMinute: toMinuteBucket(entry.trace.maxStart),
  traceHash: xxh32(entry.trace.traceId),
});

type BatchSelectionCost = {
  crossProjectBoundaries: number;
  minuteHashCells: number;
  traceHashGap: number;
};

const compareByClickHouseLocality = (
  left: LocalityCandidate,
  right: LocalityCandidate,
) =>
  compareStrings(left.entry.trace.projectId, right.entry.trace.projectId) ||
  compareNumbers(left.minMinute, right.minMinute) ||
  compareNumbers(left.maxMinute, right.maxMinute) ||
  compareNumbers(left.traceHash, right.traceHash) ||
  compareStrings(left.entry.trace.traceId, right.entry.trace.traceId);

const canonicalizeLocalityBatch = (
  batch: readonly PendingTrace[],
): PendingTrace[] =>
  batch
    .map(toLocalityCandidate)
    .toSorted(compareByClickHouseLocality)
    .map(({ entry }) => entry);

const compareCanonicalBatches = (
  left: readonly PendingTrace[],
  right: readonly PendingTrace[],
) => {
  const leftCandidates = left.map(toLocalityCandidate);
  const rightCandidates = right.map(toLocalityCandidate);
  const sharedLength = Math.min(leftCandidates.length, rightCandidates.length);
  for (let index = 0; index < sharedLength; index++) {
    const comparison = compareByClickHouseLocality(
      leftCandidates[index],
      rightCandidates[index],
    );
    if (comparison !== 0) return comparison;
  }
  return compareNumbers(leftCandidates.length, rightCandidates.length);
};

const getBatchBounds = (batch: readonly PendingTrace[]) => ({
  minStart: Math.min(...batch.map(({ trace }) => trace.minStart)),
  maxStart: Math.max(...batch.map(({ trace }) => trace.maxStart)),
});

const isFeasibleLocalityBatch = (
  batch: readonly PendingTrace[],
  maxBatchSize: number,
) => {
  if (batch.length === 0 || batch.length > maxBatchSize) return false;
  const canonical = canonicalizeLocalityBatch(batch);
  const { minStart, maxStart } = getBatchBounds(canonical);
  return maxStart - minStart <= allowedEnvelopeMs(canonical[0]);
};

const compareBatchSelectionCost = (
  left: BatchSelectionCost,
  right: BatchSelectionCost,
) =>
  compareNumbers(left.crossProjectBoundaries, right.crossProjectBoundaries) ||
  compareNumbers(left.minuteHashCells, right.minuteHashCells) ||
  compareNumbers(left.traceHashGap, right.traceHashGap);

const addBatchSelectionCost = (
  left: BatchSelectionCost,
  right: BatchSelectionCost,
): BatchSelectionCost => ({
  crossProjectBoundaries:
    left.crossProjectBoundaries + right.crossProjectBoundaries,
  minuteHashCells: left.minuteHashCells + right.minuteHashCells,
  traceHashGap: left.traceHashGap + right.traceHashGap,
});

const ZERO_BATCH_SELECTION_COST: BatchSelectionCost = {
  crossProjectBoundaries: 0,
  minuteHashCells: 0,
  traceHashGap: 0,
};

const selectLocalityBatches = (
  candidates: readonly PendingTrace[],
  maxBatchSize: number,
): PendingTrace[][] => {
  const sorted = candidates
    .map(toLocalityCandidate)
    .toSorted(compareByClickHouseLocality);
  const candidateCount = sorted.length;
  const stride = Math.min(maxBatchSize, candidateCount) + 1;
  const minuteHashCellCosts = new Float64Array(candidateCount * stride);
  const feasibleSlices = new Uint8Array(candidateCount * stride);
  const projectBoundaryPrefix = new Uint32Array(candidateCount + 1);
  const traceHashGapPrefix = new Float64Array(candidateCount + 1);

  for (let index = 1; index < candidateCount; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const sameProject =
      previous.entry.trace.projectId === current.entry.trace.projectId;
    const sameTimeRange =
      previous.minMinute === current.minMinute &&
      previous.maxMinute === current.maxMinute;
    projectBoundaryPrefix[index + 1] =
      projectBoundaryPrefix[index] + (sameProject ? 0 : 1);
    traceHashGapPrefix[index + 1] =
      traceHashGapPrefix[index] +
      (sameProject && sameTimeRange
        ? current.traceHash - previous.traceHash
        : 0);
  }

  for (let start = 0; start < candidateCount; start++) {
    let minMinute = Number.POSITIVE_INFINITY;
    let maxMinute = Number.NEGATIVE_INFINITY;
    let minStart = Number.POSITIVE_INFINITY;
    let maxStart = Number.NEGATIVE_INFINITY;
    const seedEnvelopeMs = allowedEnvelopeMs(sorted[start].entry);
    const maxLength = Math.min(maxBatchSize, candidateCount - start);
    for (let length = 1; length <= maxLength; length++) {
      const candidate = sorted[start + length - 1];
      minMinute = Math.min(minMinute, candidate.minMinute);
      maxMinute = Math.max(maxMinute, candidate.maxMinute);
      minStart = Math.min(minStart, candidate.entry.trace.minStart);
      maxStart = Math.max(maxStart, candidate.entry.trace.maxStart);
      const slot = start * stride + length;
      // The shared time predicate applies every selected trace hash across the
      // complete envelope, so minute × hash count approximates PK cells read.
      minuteHashCellCosts[slot] = (maxMinute - minMinute + 1) * length;
      // Narrow groups stay within one hour. Wide groups may not grow past
      // 125% of the first trace in locality order, the slice seed.
      feasibleSlices[slot] = maxStart - minStart <= seedEnvelopeMs ? 1 : 0;
    }
  }

  const minJobs = new Int32Array(candidateCount + 1).fill(-1);
  minJobs[0] = 0;
  for (let end = 1; end <= candidateCount; end++) {
    const minStart = Math.max(0, end - maxBatchSize);
    let best = Number.MAX_SAFE_INTEGER;
    for (let start = minStart; start < end; start++) {
      if (minJobs[start] < 0) continue;
      if (!feasibleSlices[start * stride + (end - start)]) continue;
      best = Math.min(best, minJobs[start] + 1);
    }
    if (best === Number.MAX_SAFE_INTEGER) {
      throw new Error("Unable to partition trace batch candidates");
    }
    minJobs[end] = best;
  }
  const batchCount = minJobs[candidateCount];

  const predecessors = Array.from({ length: batchCount + 1 }, () =>
    new Int32Array(candidateCount + 1).fill(-1),
  );
  let previousCosts: Array<BatchSelectionCost | null> = Array(
    candidateCount + 1,
  ).fill(null);
  previousCosts[0] = ZERO_BATCH_SELECTION_COST;

  // Find the cheapest path through all prefixes using exactly batchCount jobs.
  for (let batchIndex = 1; batchIndex <= batchCount; batchIndex++) {
    const currentCosts: Array<BatchSelectionCost | null> = Array(
      candidateCount + 1,
    ).fill(null);
    const remainingJobs = batchCount - batchIndex;
    // Leave enough traces for the remaining nonempty, size-bounded batches.
    const minEnd = Math.max(
      batchIndex,
      candidateCount - remainingJobs * maxBatchSize,
    );
    const maxEnd = Math.min(
      candidateCount - remainingJobs,
      batchIndex * maxBatchSize,
    );
    for (let end = minEnd; end <= maxEnd; end++) {
      if (minJobs[end] > batchIndex) continue;
      const minStart = Math.max(batchIndex - 1, end - maxBatchSize);
      for (let start = minStart; start < end; start++) {
        const previousCost = previousCosts[start];
        if (!previousCost) continue;
        const length = end - start;
        if (!feasibleSlices[start * stride + length]) continue;
        const batchCost: BatchSelectionCost = {
          crossProjectBoundaries:
            projectBoundaryPrefix[end] - projectBoundaryPrefix[start + 1],
          minuteHashCells: minuteHashCellCosts[start * stride + length],
          traceHashGap: traceHashGapPrefix[end] - traceHashGapPrefix[start + 1],
        };
        const candidateCost = addBatchSelectionCost(previousCost, batchCost);
        const currentCost = currentCosts[end];
        if (
          !currentCost ||
          compareBatchSelectionCost(candidateCost, currentCost) < 0
        ) {
          currentCosts[end] = candidateCost;
          predecessors[batchIndex][end] = start;
        }
      }
    }
    previousCosts = currentCosts;
  }

  const batches = Array<PendingTrace[]>(batchCount);
  let end = candidateCount;
  for (let batchIndex = batchCount; batchIndex > 0; batchIndex--) {
    const start = predecessors[batchIndex][end];
    if (start < 0)
      throw new Error("Unable to partition trace batch candidates");
    batches[batchIndex - 1] = sorted
      .slice(start, end)
      .map(({ entry }) => entry);
    end = start;
  }
  return batches;
};

/**
 * Deterministically assigns one bounded hydrated candidate window.
 *
 * Locality follows the events table's physical order: project, start-time
 * minute, and xxHash32(trace ID). A batch may not exceed one hour, or 125% of
 * its first trace's span, whichever is larger. Extra jobs are added only when
 * that envelope cap forbids a cheaper fill. Among feasible partitions with
 * that minimum job count, dynamic programming first avoids crossing projects,
 * then minimizes minute × trace-hash cells, then splits the largest hash gaps.
 *
 * Selection uses O(n × k × maxBatchSize) time and
 * O(n × min(n, maxBatchSize) + n × k) memory, where k is the fewest feasible
 * jobs (at least ceil(n / maxBatchSize), up to n for disjoint envelopes).
 * Locality callers bound n to CHUNK_SIZE (1,000) hydrated candidates plus
 * at most maxBatchSize - 1 traces across all retained partials.
 * Project mode also accepts a tail of at most maxBatchSize - 1 traces and is O(n).
 */
export function selectTraceBatches(
  candidates: readonly PendingTrace[],
  maxBatchSize: number,
  strategy: TraceBatchStrategy,
): PendingTrace[][] {
  if (candidates.length === 0) return [];
  if (strategy === "project") {
    const batches: PendingTrace[][] = [];
    for (let offset = 0; offset < candidates.length; offset += maxBatchSize) {
      batches.push(candidates.slice(offset, offset + maxBatchSize));
    }
    return batches;
  }

  return selectLocalityBatches(candidates, maxBatchSize);
}

const compareBatchesByOldestDue = (
  left: readonly PendingTrace[],
  right: readonly PendingTrace[],
) =>
  compareNumbers(
    Math.min(...left.map(({ due }) => due)),
    Math.min(...right.map(({ due }) => due)),
  ) || compareCanonicalBatches(left, right);

const canCoalesceLocalityPartials = (
  left: readonly PendingTrace[],
  right: readonly PendingTrace[],
  maxBatchSize: number,
) => {
  if (left.length + right.length > maxBatchSize) return false;
  const projectId = left[0]?.trace.projectId;
  if (
    !projectId ||
    left.some(({ trace }) => trace.projectId !== projectId) ||
    right.some(({ trace }) => trace.projectId !== projectId)
  ) {
    return false;
  }
  const leftBounds = getBatchBounds(left);
  const rightBounds = getBatchBounds(right);
  const bufferedIntervalsOverlap =
    leftBounds.minStart - QUERY_BUFFER_MS <=
      rightBounds.maxStart + QUERY_BUFFER_MS &&
    rightBounds.minStart - QUERY_BUFFER_MS <=
      leftBounds.maxStart + QUERY_BUFFER_MS;
  return (
    bufferedIntervalsOverlap &&
    isFeasibleLocalityBatch([...left, ...right], maxBatchSize)
  );
};

/**
 * Coalesce compatible locality partials and retain a globally bounded carry.
 * The dispatcher calls this once per hydrated window; work never survives the
 * current dispatch run.
 */
export function prepareLocalityPartials(
  partials: readonly (readonly PendingTrace[])[],
  maxBatchSize: number,
): { dispatch: PendingTrace[][]; carry: PendingTrace[][] } {
  const batches = partials
    .filter((batch) => batch.length > 0)
    .map(canonicalizeLocalityBatch)
    .toSorted(compareCanonicalBatches);

  while (true) {
    let best:
      | {
          leftIndex: number;
          rightIndex: number;
          envelopeIncrease: number;
          merged: PendingTrace[];
        }
      | undefined;
    for (let leftIndex = 0; leftIndex < batches.length; leftIndex++) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < batches.length;
        rightIndex++
      ) {
        const left = batches[leftIndex];
        const right = batches[rightIndex];
        if (!canCoalesceLocalityPartials(left, right, maxBatchSize)) continue;
        const leftBounds = getBatchBounds(left);
        const rightBounds = getBatchBounds(right);
        const merged = canonicalizeLocalityBatch([...left, ...right]);
        const mergedBounds = getBatchBounds(merged);
        const envelopeIncrease =
          mergedBounds.maxStart -
          mergedBounds.minStart -
          Math.max(
            leftBounds.maxStart - leftBounds.minStart,
            rightBounds.maxStart - rightBounds.minStart,
          );
        if (
          !best ||
          envelopeIncrease < best.envelopeIncrease ||
          (envelopeIncrease === best.envelopeIncrease &&
            compareCanonicalBatches(merged, best.merged) < 0)
        ) {
          best = { leftIndex, rightIndex, envelopeIncrease, merged };
        }
      }
    }
    if (!best) break;
    batches[best.leftIndex] = best.merged;
    batches.splice(best.rightIndex, 1);
    batches.sort(compareCanonicalBatches);
  }

  const dispatch = batches
    .filter((batch) => batch.length === maxBatchSize)
    .toSorted(compareBatchesByOldestDue);
  const carry = batches
    .filter((batch) => batch.length < maxBatchSize)
    .toSorted(compareCanonicalBatches);
  const carryBudget = maxBatchSize - 1;
  let carriedTraceCount = carry.reduce(
    (count, batch) => count + batch.length,
    0,
  );
  while (carriedTraceCount > carryBudget) {
    carry.sort(compareBatchesByOldestDue);
    const batch = carry.shift();
    if (!batch) break;
    dispatch.push(batch);
    carriedTraceCount -= batch.length;
  }
  dispatch.sort(compareBatchesByOldestDue);
  carry.sort(compareCanonicalBatches);
  return { dispatch, carry };
}

// Retain traces for a bounded time after readiness. Reuse the due index so
// cleanup needs no full hash scan. Whole-key expiry is an inactivity backstop.
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
  for i = 3, #ARGV, 6 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local eventUpdateCount = tonumber(ARGV[i + 4])
    local serializedEventBytes = tonumber(ARGV[i + 5])
    local previous = redis.call('HGET', KEYS[2], member)
    if previous then
      local state = cjson.decode(previous)
      minStart = math.min(minStart, state.minStart)
      maxStart = math.max(maxStart, state.maxStart)
      if state.eventUpdateCount and state.serializedEventBytes then
        eventUpdateCount = eventUpdateCount + state.eventUpdateCount
        serializedEventBytes = serializedEventBytes + state.serializedEventBytes
      else
        -- Missing history cannot be reconstructed from a later update.
        eventUpdateCount = nil
        serializedEventBytes = nil
      end
    end
    redis.call('HSET', KEYS[2], member, cjson.encode({
      minStart = minStart, maxStart = maxStart, revision = ARGV[i + 3],
      eventUpdateCount = eventUpdateCount, serializedEventBytes = serializedEventBytes
    }))
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[1]), member)
  end
  local retention = tonumber(ARGV[2])
  local expired = expirePending(now, retention, ${CHUNK_SIZE})
  -- Bound abandoned state from the last admitted activity, independent of idle.
  -- A shorter policy on another writer must not shorten an existing expiry.
  local expiresAt = math.max(now + retention,
    redis.call('PEXPIRETIME', KEYS[1]), redis.call('PEXPIRETIME', KEYS[2]))
  redis.call('PEXPIREAT', KEYS[1], expiresAt)
  redis.call('PEXPIREAT', KEYS[2], expiresAt)
  return expired
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

function recordTrackingVolume(
  stage: "eligible" | "sampled" | "recorded",
  entries: Iterable<
    readonly [
      string,
      { eventUpdateCount: number; serializedEventBytes: number },
    ]
  >,
): void {
  let updates = 0;
  let bytes = 0;
  for (const [, state] of entries) {
    updates += state.eventUpdateCount;
    bytes += state.serializedEventBytes;
  }
  recordIncrement("langfuse.trace_batch.event_updates", updates, { stage });
  recordIncrement("langfuse.trace_batch.serialized_event_bytes", bytes, {
    stage,
  });
}

export async function trackTraceBatchActivity(
  projectId: string,
  events: {
    traceId: string;
    startTimeISO: string;
    serializedEventBytes: number;
  }[],
): Promise<void> {
  if (
    !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED !== "true"
  )
    return;

  const bounds = new Map<
    string,
    {
      minStart: number;
      maxStart: number;
      eventUpdateCount: number;
      serializedEventBytes: number;
    }
  >();
  for (const event of events) {
    const start = Date.parse(event.startTimeISO);
    if (!Number.isFinite(start)) continue;
    const previous = bounds.get(event.traceId);
    bounds.set(event.traceId, {
      minStart: Math.min(previous?.minStart ?? start, start),
      maxStart: Math.max(previous?.maxStart ?? start, start),
      eventUpdateCount: (previous?.eventUpdateCount ?? 0) + 1,
      serializedEventBytes:
        (previous?.serializedEventBytes ?? 0) + event.serializedEventBytes,
    });
  }
  if (bounds.size === 0) return;

  try {
    recordTrackingVolume("eligible", bounds);
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
    recordTrackingVolume("sampled", entries);
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
            state.eventUpdateCount,
            state.serializedEventBytes,
          ]),
        ),
      );
      // Count only acknowledged chunks; a timeout can leave Redis's outcome unknown.
      recordTrackingVolume("recorded", chunk);
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
    if (!this.activeDispatch) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.activeDispatch,
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            logger.warn(
              "Trace batch dispatcher drain timed out after 5 seconds; continuing shutdown",
            );
            resolve();
          }, 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async execute(): Promise<number | void> {
    if (
      !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED !== "true" ||
      this.stopping ||
      this.activeDispatch
    )
      return;
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
    const strategy = env.LANGFUSE_TRACE_BATCH_STRATEGY;
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
      const fill =
        batch.length === 1
          ? "singleton"
          : batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE
            ? "full"
            : "partial";
      recordIncrement("langfuse.trace_batch.dispatched_batches", 1, {
        strategy,
        fill,
      });
      recordDistribution(
        "langfuse.trace_batch.event_time_envelope_ms",
        Math.max(...traces.map(({ maxStart }) => maxStart)) -
          Math.min(...traces.map(({ minStart }) => minStart)) +
          2 * QUERY_BUFFER_MS,
        { strategy },
      );
      recordIncrement("langfuse.trace_batch.dispatched_traces", batch.length, {
        batch_kind: batch.length === 1 ? "singleton" : "multi",
      });
      let estimatedEventUpdateCount = 0;
      let estimatedSerializedEventBytes = 0;
      let unavailableEstimates = 0;
      for (const entry of batch) {
        if (entry.estimates) {
          estimatedEventUpdateCount += entry.estimates.eventUpdateCount;
          estimatedSerializedEventBytes += entry.estimates.serializedEventBytes;
          recordDistribution(
            "langfuse.trace_batch.estimated_event_update_count",
            entry.estimates.eventUpdateCount,
            { scope: "trace", strategy },
          );
          recordDistribution(
            "langfuse.trace_batch.estimated_serialized_event_bytes",
            entry.estimates.serializedEventBytes,
            { scope: "trace", strategy },
          );
        } else {
          unavailableEstimates++;
        }
        recordDistribution(
          "langfuse.trace_batch.observed_start_span_ms",
          entry.trace.maxStart - entry.trace.minStart,
          { strategy },
        );
        recordDistribution(
          "langfuse.trace_batch.due_lag_ms",
          Math.max(0, Date.now() - entry.due),
        );
      }
      if (unavailableEstimates === 0) {
        recordDistribution(
          "langfuse.trace_batch.estimated_event_update_count",
          estimatedEventUpdateCount,
          { scope: "batch", strategy },
        );
        recordDistribution(
          "langfuse.trace_batch.estimated_serialized_event_bytes",
          estimatedSerializedEventBytes,
          { scope: "batch", strategy },
        );
      } else {
        recordIncrement(
          "langfuse.trace_batch.estimates_unavailable",
          unavailableEstimates,
          {
            scope: "trace",
            strategy,
          },
        );
        recordIncrement("langfuse.trace_batch.estimates_unavailable", 1, {
          scope: "batch",
          strategy,
        });
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

    let projectBatchTail: PendingTrace[] = [];
    let localityPartials: PendingTrace[][] = [];
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
      const hydratedCandidates: PendingTrace[] = [];
      for (let i = 0; i < hydrated.length; i += 3) {
        if (this.stopping) return;
        const member = hydrated[i];
        const [projectId, traceId] = JSON.parse(member) as [string, string];
        const state = JSON.parse(hydrated[i + 1]);
        hydratedCandidates.push({
          member,
          due: Number(hydrated[i + 2]),
          estimates:
            Number.isSafeInteger(state.eventUpdateCount) &&
            state.eventUpdateCount >= 0 &&
            Number.isSafeInteger(state.serializedEventBytes) &&
            state.serializedEventBytes >= 0
              ? {
                  eventUpdateCount: state.eventUpdateCount,
                  serializedEventBytes: state.serializedEventBytes,
                }
              : undefined,
          trace: TraceBatchTraceSchema.parse({
            ...state,
            projectId,
            traceId,
          }),
        });
      }

      const carriedTraceCount =
        strategy === "project"
          ? projectBatchTail.length
          : localityPartials.reduce((count, batch) => count + batch.length, 0);
      const selectorInput =
        strategy === "project"
          ? [...projectBatchTail, ...hydratedCandidates]
          : [...localityPartials.flat(), ...hydratedCandidates];
      recordDistribution(
        "langfuse.trace_batch.candidate_buffer_size",
        hydratedCandidates.length + carriedTraceCount,
        { strategy },
      );
      const selectorStartedAt = performance.now();
      const selected = selectTraceBatches(
        selectorInput,
        env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
        strategy,
      );
      recordDistribution(
        "langfuse.trace_batch.selector_duration_ms",
        performance.now() - selectorStartedAt,
        { strategy },
      );

      if (strategy === "project") {
        projectBatchTail = [];
        if (selected.at(-1)?.length !== env.LANGFUSE_TRACE_BATCH_MAX_SIZE) {
          projectBatchTail = selected.pop() ?? [];
        }
        for (const batch of selected) {
          if (this.stopping) return;
          await enqueue(batch);
        }
        continue;
      }

      const fullBatches = selected.filter(
        (batch) => batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
      );
      const partialBatches = selected.filter(
        (batch) => batch.length < env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
      );
      for (const batch of fullBatches) {
        if (this.stopping) return;
        await enqueue(batch);
      }
      await this.extendLockOnProgress();
      if (this.stopping) return;
      const prepared = prepareLocalityPartials(
        partialBatches,
        env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
      );
      localityPartials = prepared.carry;
      for (const batch of prepared.dispatch) {
        if (this.stopping) return;
        await enqueue(batch);
      }
    }
    if (this.stopping) return;
    if (strategy === "project") {
      if (projectBatchTail.length > 0) await enqueue(projectBatchTail);
      return;
    }
    for (const batch of localityPartials.toSorted(compareBatchesByOldestDue)) {
      if (this.stopping) return;
      await enqueue(batch);
    }
  }
}
