import { createHash, randomUUID } from "node:crypto";
import { xxh32 } from "@node-rs/xxhash";
import {
  getTracingReadinessSettings,
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
import {
  isTopicsProcessingActive,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import {
  getTraceBatchFirstKeys,
  getTraceBatchFirstMember,
  getTraceBatchReadinessKeys,
  getTraceBatchShard,
} from "./traceBatchReadiness";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

const CHUNK_SIZE = 1_000;
const REDIS_CHUNK_SIZE = 50;
const REDIS_PIPELINE_SIZE = 4;
const CLEANUP_SIZE = 100;
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

/**
 * Upper bounds on the summed ingestion estimates of one dispatched batch.
 * Traces without estimates weigh nothing, and a single trace always forms a
 * batch even when it alone exceeds a budget.
 */
export type TraceBatchWeightLimits = {
  maxEventUpdates: number;
  maxSerializedEventBytes: number;
};

const UNBOUNDED_WEIGHT_LIMITS: TraceBatchWeightLimits = {
  maxEventUpdates: Number.POSITIVE_INFINITY,
  maxSerializedEventBytes: Number.POSITIVE_INFINITY,
};

const toLimit = (value: number) =>
  value > 0 ? value : Number.POSITIVE_INFINITY;

const getEventUpdates = ({ estimates }: PendingTrace) =>
  estimates?.eventUpdateCount ?? 0;

const getSerializedEventBytes = ({ estimates }: PendingTrace) =>
  estimates?.serializedEventBytes ?? 0;

const fitsWeightLimits = (
  eventUpdates: number,
  serializedEventBytes: number,
  limits: TraceBatchWeightLimits,
) =>
  eventUpdates <= limits.maxEventUpdates &&
  serializedEventBytes <= limits.maxSerializedEventBytes;

const isWithinWeightLimits = (
  batch: readonly PendingTrace[],
  limits: TraceBatchWeightLimits,
) =>
  batch.length <= 1 ||
  fitsWeightLimits(
    batch.reduce((total, entry) => total + getEventUpdates(entry), 0),
    batch.reduce((total, entry) => total + getSerializedEventBytes(entry), 0),
    limits,
  );

// A heavy trace uses more than half of a batch budget.
const isHeavyTrace = (entry: PendingTrace, limits: TraceBatchWeightLimits) =>
  getEventUpdates(entry) * 2 > limits.maxEventUpdates ||
  getSerializedEventBytes(entry) * 2 > limits.maxSerializedEventBytes;

type TraceExclusionReason = "event_updates" | "serialized_bytes";

const getTraceExclusionReason = (
  { estimates }: PendingTrace,
  limits: TraceBatchWeightLimits,
): TraceExclusionReason | undefined => {
  if (!estimates) return undefined;
  if (estimates.eventUpdateCount > limits.maxEventUpdates)
    return "event_updates";
  if (estimates.serializedEventBytes > limits.maxSerializedEventBytes)
    return "serialized_bytes";
  return undefined;
};

const compareNumbers = (left: number, right: number) => left - right;

const compareStrings = (left: string, right: string) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

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
  weightLimits: TraceBatchWeightLimits,
) => {
  if (batch.length === 0 || batch.length > maxBatchSize) return false;
  if (!isWithinWeightLimits(batch, weightLimits)) return false;
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
  weightLimits: TraceBatchWeightLimits,
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
    let eventUpdates = 0;
    let serializedEventBytes = 0;
    const seedEnvelopeMs = allowedEnvelopeMs(sorted[start].entry);
    const maxLength = Math.min(maxBatchSize, candidateCount - start);
    for (let length = 1; length <= maxLength; length++) {
      const candidate = sorted[start + length - 1];
      eventUpdates += getEventUpdates(candidate.entry);
      serializedEventBytes += getSerializedEventBytes(candidate.entry);
      // Weights are nonnegative, so every longer slice is also over budget.
      if (
        length > 1 &&
        !fitsWeightLimits(eventUpdates, serializedEventBytes, weightLimits)
      )
        break;
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
 * Both strategies also close a multi-trace batch before its estimated event
 * updates or serialized bytes would exceed `weightLimits`. Locality packs
 * traces above half of either budget in a separate lane.
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
  weightLimits: TraceBatchWeightLimits = UNBOUNDED_WEIGHT_LIMITS,
): PendingTrace[][] {
  if (candidates.length === 0) return [];
  if (strategy === "project") {
    const batches: PendingTrace[][] = [];
    let batch: PendingTrace[] = [];
    let eventUpdates = 0;
    let serializedEventBytes = 0;
    for (const candidate of candidates) {
      const candidateEventUpdates = getEventUpdates(candidate);
      const candidateBytes = getSerializedEventBytes(candidate);
      if (
        batch.length > 0 &&
        (batch.length === maxBatchSize ||
          !fitsWeightLimits(
            eventUpdates + candidateEventUpdates,
            serializedEventBytes + candidateBytes,
            weightLimits,
          ))
      ) {
        batches.push(batch);
        batch = [];
        eventUpdates = 0;
        serializedEventBytes = 0;
      }
      batch.push(candidate);
      eventUpdates += candidateEventUpdates;
      serializedEventBytes += candidateBytes;
    }
    batches.push(batch);
    return batches;
  }

  // Two heavy traces cannot share a batch on the dimension that makes them
  // heavy, so packing them separately keeps them from fragmenting the light
  // traces around them in locality order.
  const light: PendingTrace[] = [];
  const heavy: PendingTrace[] = [];
  for (const candidate of candidates) {
    if (isHeavyTrace(candidate, weightLimits)) heavy.push(candidate);
    else light.push(candidate);
  }
  return [
    ...selectLocalityBatches(light, maxBatchSize, weightLimits),
    ...selectLocalityBatches(heavy, maxBatchSize, weightLimits),
  ];
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
  weightLimits: TraceBatchWeightLimits,
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
    isFeasibleLocalityBatch([...left, ...right], maxBatchSize, weightLimits)
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
  weightLimits: TraceBatchWeightLimits = UNBOUNDED_WEIGHT_LIMITS,
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
        if (
          !canCoalesceLocalityPartials(left, right, maxBatchSize, weightLimits)
        )
          continue;
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
  local firstTtl = tonumber(ARGV[3])
  local width = tonumber(ARGV[4])
  local bucket = math.floor(now / width)
  local current = bucket - tonumber(ARGV[5]) + 3
  if current < 3 or current > #KEYS then
    return redis.error_reply('Trace readiness bucket clock changed; retry intake')
  end
  for i = 6, #ARGV, 7 do
    local member = ARGV[i]
    local minStart = tonumber(ARGV[i + 1])
    local maxStart = tonumber(ARGV[i + 2])
    local eventUpdateCount = tonumber(ARGV[i + 4])
    local serializedEventBytes = tonumber(ARGV[i + 5])
    local identity = ARGV[i + 6]
    local previous = redis.call('HGET', KEYS[2], member)
    local state = previous and cjson.decode(previous)
    local priorDue = tonumber(redis.call('ZSCORE', KEYS[1], member))
    if not priorDue or priorDue <= now - tonumber(ARGV[2]) then state = nil end
    if state and state.historyBucket then
      local old = state.historyBucket - tonumber(ARGV[5]) + 3
      if old >= 3 and old <= #KEYS and old ~= current then
        redis.call('HDEL', KEYS[old], identity)
      end
    else
      local retainedUpdates = 0
      local retainedBytes = 0
      local estimatesKnown = true
      for key = 3, #KEYS do
        local retained = redis.call('HGET', KEYS[key], identity)
        if retained then
          local bounds = cmsgpack.unpack(retained)
          if bounds[3] > now then
            minStart = math.min(minStart, bounds[1])
            maxStart = math.max(maxStart, bounds[2])
            if bounds[4] and bounds[5] then
              retainedUpdates = math.max(retainedUpdates, bounds[4])
              retainedBytes = math.max(retainedBytes, bounds[5])
            else
              estimatesKnown = false
            end
          end
          if key ~= current then redis.call('HDEL', KEYS[key], identity) end
        end
      end
      if not estimatesKnown then
        eventUpdateCount = nil
        serializedEventBytes = nil
      elseif not state then
        eventUpdateCount = eventUpdateCount + retainedUpdates
        serializedEventBytes = serializedEventBytes + retainedBytes
      end
    end
    if state then
      minStart = math.min(minStart, state.minStart)
      maxStart = math.max(maxStart, state.maxStart)
      if eventUpdateCount and serializedEventBytes and state.eventUpdateCount and state.serializedEventBytes then
        eventUpdateCount = eventUpdateCount + state.eventUpdateCount
        serializedEventBytes = serializedEventBytes + state.serializedEventBytes
      else
        -- Missing history cannot be reconstructed from a later update.
        eventUpdateCount = nil
        serializedEventBytes = nil
      end
    end
    redis.call('HSET', KEYS[2], member, cjson.encode({
      minStart = minStart, maxStart = maxStart, revision = ARGV[i + 3], historyBucket = bucket,
      eventUpdateCount = eventUpdateCount, serializedEventBytes = serializedEventBytes
    }))
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[1]), member)
    redis.call('HSET', KEYS[current], identity,
      cmsgpack.pack({minStart, maxStart, now + firstTtl, eventUpdateCount, serializedEventBytes}))
  end
  local firstExpiry = math.max((bucket + 1) * width + firstTtl,
    redis.call('PEXPIRETIME', KEYS[current]))
  -- Integer command arguments need decimal strings, including round timestamps.
  redis.call('PEXPIREAT', KEYS[current], string.format('%.0f', firstExpiry))
  local retention = tonumber(ARGV[2])
  local expired = expirePending(now, retention, ${CLEANUP_SIZE})
  -- The shared inactivity backstop covers the latest required member deadline.
  local expiresAt = math.max(now + tonumber(ARGV[1]) + retention,
    redis.call('PEXPIRETIME', KEYS[1]), redis.call('PEXPIRETIME', KEYS[2]))
  redis.call('PEXPIREAT', KEYS[1], string.format('%.0f', expiresAt))
  redis.call('PEXPIREAT', KEYS[2], string.format('%.0f', expiresAt))
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
  local expired = expirePending(now, retention, ${CLEANUP_SIZE})
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

// Returns one flag per member, in argument order: 1 when removed, 0 when a
// newer revision keeps the trace pending.
const ACKNOWLEDGE_SCRIPT = `
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  local width = tonumber(ARGV[2])
  local bucket = math.floor(now / width)
  local current = bucket - tonumber(ARGV[3]) + 3
  if current < 3 or current > #KEYS then
    return redis.error_reply('Trace readiness bucket clock changed; retry acknowledgement')
  end
  local removed = {}
  local retained = false
  for i = 4, #ARGV, 3 do
    local state = redis.call('HGET', KEYS[2], ARGV[i])
    local decoded = state and cjson.decode(state)
    if decoded and decoded.revision == ARGV[i + 1] then
      local identity = ARGV[i + 2]
      if decoded.historyBucket then
        local old = decoded.historyBucket - tonumber(ARGV[3]) + 3
        if old >= 3 and old <= #KEYS and old ~= current then redis.call('HDEL', KEYS[old], identity) end
      else
        for key = 3, #KEYS do
          if key ~= current then redis.call('HDEL', KEYS[key], identity) end
        end
      end
      redis.call('HSET', KEYS[current], identity,
        cmsgpack.pack({decoded.minStart, decoded.maxStart, now + tonumber(ARGV[1]), decoded.eventUpdateCount, decoded.serializedEventBytes}))
      retained = true
      redis.call('ZREM', KEYS[1], ARGV[i])
      redis.call('HDEL', KEYS[2], ARGV[i])
      table.insert(removed, 1)
    else
      table.insert(removed, 0)
    end
  end
  if retained then
    local expiresAt = math.max((bucket + 1) * width + tonumber(ARGV[1]),
      redis.call('PEXPIRETIME', KEYS[current]))
    redis.call('PEXPIREAT', KEYS[current], string.format('%.0f', expiresAt))
  end
  return removed
`;

const readinessScriptHashes = new Map(
  [TRACK_SCRIPT, SNAPSHOT_SCRIPT, HYDRATE_SCRIPT, ACKNOWLEDGE_SCRIPT].map(
    (script) =>
      [script, createHash("sha1").update(script).digest("hex")] as const,
  ),
);

async function evalReadiness(
  script: string,
  keys: string[],
  args: (string | number | Buffer)[],
): Promise<unknown> {
  if (!redis) throw new Error("Trace batching requires Redis");
  try {
    return await redis.evalsha(
      readinessScriptHashes.get(script)!,
      keys.length,
      ...keys,
      ...args,
    );
  } catch (error) {
    // SCRIPT FLUSH or a promoted primary can have an empty script cache.
    if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT"))
      throw error;
    return redis.eval(script, keys.length, ...keys, ...args);
  }
}

function recordTrackingVolume(
  stage: "eligible" | "recorded",
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
  idleMs?: number,
): Promise<void> {
  if (
    !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED !== "true"
  )
    return;
  const samplingRate = env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
  // Topics summarizes every trace of an active project, so those bypass sampling.
  const topicsProject = await resolveTopicsProcessingActive(projectId);
  // Rate 0 admits only Topics projects; skip all tracking work for the rest.
  if (samplingRate === 0 && !topicsProject) return;

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
    const admitAll = samplingRate === 1 || topicsProject;
    // Sample by trace ID so later observations and retries keep the same decision.
    // Dispatcher and consumer process admitted work without resampling.
    const entries = [...bounds].filter(
      ([traceId]) =>
        admitAll ||
        shouldSampleEvaluation({
          samplingValue: getDeterministicSamplingValue(traceId),
          samplingRate,
        }),
    );
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
    const effectiveIdleMs = idleMs ?? (await resolveTraceIdleMs(projectId));
    if (!Number.isSafeInteger(effectiveIdleMs) || effectiveIdleMs <= 0)
      throw new Error("Trace batch idle time must be a positive integer");
    if (!redis) throw new Error("Trace batching requires Redis");
    const shards = new Map<number, typeof entries>();
    for (const entry of entries) {
      const shard = getTraceBatchShard(JSON.stringify([projectId, entry[0]]));
      const group = shards.get(shard) ?? [];
      group.push(entry);
      shards.set(shard, group);
    }
    const clock = await redis.time();
    const now = Number(clock[0]) * 1_000 + Math.floor(Number(clock[1]) / 1_000);
    // Each pipeline contains bounded scripts from one cluster slot.
    for (const [shard, group] of shards) {
      const { due, state: stateKey } = getTraceBatchReadinessKeys(shard);
      const first = getTraceBatchFirstKeys(shard, now);
      const keys = [due, stateKey, ...first.keys];
      for (
        let offset = 0;
        offset < group.length;
        offset += REDIS_CHUNK_SIZE * REDIS_PIPELINE_SIZE
      ) {
        const pipeline =
          group.length - offset > REDIS_CHUNK_SIZE
            ? redis.pipeline()
            : undefined;
        const commands: {
          chunk: typeof entries;
          args: (string | number | Buffer)[];
        }[] = [];
        for (
          let start = offset;
          start <
          Math.min(
            group.length,
            offset + REDIS_CHUNK_SIZE * REDIS_PIPELINE_SIZE,
          );
          start += REDIS_CHUNK_SIZE
        ) {
          const chunk = group.slice(start, start + REDIS_CHUNK_SIZE);
          const args = [
            effectiveIdleMs,
            env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
            env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
            first.width,
            first.firstBucket,
            ...chunk.flatMap(([traceId, state]) => [
              JSON.stringify([projectId, traceId]),
              state.minStart,
              state.maxStart,
              // Unique even after dispatch deletes and a later arrival recreates state.
              randomUUID(),
              state.eventUpdateCount,
              state.serializedEventBytes,
              getTraceBatchFirstMember(JSON.stringify([projectId, traceId])),
            ]),
          ];
          pipeline?.evalsha(
            readinessScriptHashes.get(TRACK_SCRIPT)!,
            keys.length,
            ...keys,
            ...args,
          );
          commands.push({ chunk, args });
        }
        const results: [Error | null, unknown][] | null = pipeline
          ? await pipeline.exec()
          : [[null, await evalReadiness(TRACK_SCRIPT, keys, commands[0].args)]];
        if (!results)
          throw new Error("Trace batch tracking pipeline returned no results");
        let failure: unknown;
        // A command error does not undo successful siblings. Record every known result.
        for (const [index, { chunk, args }] of commands.entries()) {
          try {
            const [error, result] = results[index];
            let expired: number;
            if (error) {
              if (!error.message.startsWith("NOSCRIPT")) throw error;
              // Only this cache miss is safe to retry; successful siblings are not replayed.
              expired = Number(
                await redis.eval(TRACK_SCRIPT, keys.length, ...keys, ...args),
              );
            } else {
              expired = Number(result);
            }
            recordTrackingVolume("recorded", chunk);
            recordIncrement("langfuse.trace_batch.expired_traces", expired, {
              source: "ingestion",
            });
            recordIncrement(
              "langfuse.trace_batch.tracked_traces",
              chunk.length,
            );
          } catch (error) {
            if (failure === undefined) failure = error;
          }
        }
        if (failure !== undefined) throw failure;
      }
    }
  } catch (error) {
    // This optional load experiment must not fail normal event ingestion.
    recordIncrement("langfuse.trace_batch.tracking_errors", 1);
    logger.error("Failed to track trace batch activity", { error });
  }
}

async function resolveTopicsProcessingActive(
  projectId: string,
): Promise<boolean> {
  try {
    return await isTopicsProcessingActive(projectId);
  } catch (error) {
    // The allowlist keeps Topics traces during an outage; the consumer still
    // loads each project's models and skips projects without them.
    recordIncrement("langfuse.trace_batch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, using allowlist", {
      projectId,
      error,
    });
    return isTopicsProjectEnabled(projectId);
  }
}

async function resolveTraceIdleMs(projectId: string): Promise<number> {
  let traceIdleMs: number | null = null;
  try {
    ({ traceIdleMs } = await getTracingReadinessSettings(projectId));
  } catch (error) {
    recordIncrement("langfuse.trace_batch.idle_time_read_failures", 1);
    logger.warn("Failed to read trace idle time, using the default", {
      projectId,
      error,
    });
  }
  if (traceIdleMs === null) return env.LANGFUSE_TRACE_BATCH_IDLE_MS;
  // A due time past the pending TTL would expire the trace before dispatch.
  const cap =
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS -
    env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
  return cap > 0 ? Math.min(traceIdleMs, cap) : traceIdleMs;
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
    const totals = { pending: 0, ready: 0, oldestAge: 0 };
    const members: {
      member: string;
      projectId: string;
      shard: number;
      cutoff: string;
      due: number;
    }[] = [];
    for (let shard = 0; shard < env.LANGFUSE_TRACE_BATCH_SHARD_COUNT; shard++) {
      if (this.stopping) return;
      const { due, state } = getTraceBatchReadinessKeys(shard);
      let cutoff = "";
      let now = 0;
      while (!this.stopping) {
        await this.extendLockOnProgress();
        const snapshot = (await evalReadiness(
          SNAPSHOT_SCRIPT,
          [due, state],
          [env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS, cutoff],
        )) as (string | number)[];
        const [clock, , pending, ready, oldest, expired] = snapshot.map(Number);
        now = clock;
        cutoff = String(snapshot[1]);
        recordIncrement("langfuse.trace_batch.expired_traces", expired, {
          source: "dispatcher",
        });
        if (expired < CLEANUP_SIZE) {
          totals.pending += pending;
          totals.ready += ready;
          totals.oldestAge = Math.max(
            totals.oldestAge,
            Math.max(0, now - oldest),
          );
          break;
        }
      }
      if (this.stopping) return;
      const dueMembers = await redis.zrange(
        due,
        `(${now - env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS}`,
        cutoff,
        "BYSCORE",
        "WITHSCORES",
      );
      recordDistribution(
        "langfuse.trace_batch.snapshot_size",
        dueMembers.length / 2,
      );
      for (let index = 0; index < dueMembers.length; index += 2) {
        const member = dueMembers[index];
        members.push({
          member,
          projectId: (JSON.parse(member) as [string, string])[0],
          shard,
          cutoff,
          due: Number(dueMembers[index + 1]),
        });
      }
    }
    // The lease moves between workers after every run, so per-shard series
    // would multiply custom metrics by the shard count on each dispatcher.
    recordGauge("langfuse.trace_batch.pending_traces", totals.pending);
    recordGauge("langfuse.trace_batch.ready_traces", totals.ready);
    recordGauge("langfuse.trace_batch.oldest_due_age_ms", totals.oldestAge);
    if (this.stopping) return;

    // Each range read captures one shard's due IDs. Pack the combined cohort so
    // Redis placement does not determine the ClickHouse query boundaries.
    const strategy = env.LANGFUSE_TRACE_BATCH_STRATEGY;
    // Project packing needs due order within each project, including across shards.
    members.sort(
      (a, b) =>
        compareStrings(a.projectId, b.projectId) ||
        compareNumbers(a.due, b.due) ||
        compareStrings(a.member, b.member),
    );
    const batchWeightLimits: TraceBatchWeightLimits = {
      maxEventUpdates: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_BATCH_EVENT_UPDATES,
      ),
      maxSerializedEventBytes: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_BATCH_SERIALIZED_BYTES,
      ),
    };
    const traceWeightLimits: TraceBatchWeightLimits = {
      maxEventUpdates: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_TRACE_EVENT_UPDATES,
      ),
      maxSerializedEventBytes: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_TRACE_SERIALIZED_BYTES,
      ),
    };

    const acknowledge = async (
      batch: readonly PendingTrace[],
    ): Promise<boolean[]> => {
      const removed = Array<boolean>(batch.length).fill(false);
      const groups = new Map<
        number,
        { entry: PendingTrace; index: number }[]
      >();
      batch.forEach((entry, index) => {
        const shard = getTraceBatchShard(entry.member);
        const group = groups.get(shard) ?? [];
        group.push({ entry, index });
        groups.set(shard, group);
      });
      for (const [shard, group] of groups) {
        const { due, state } = getTraceBatchReadinessKeys(shard);
        for (
          let offset = 0;
          offset < group.length;
          offset += REDIS_CHUNK_SIZE
        ) {
          const chunk = group.slice(offset, offset + REDIS_CHUNK_SIZE);
          const clock = await redis!.time();
          const first = getTraceBatchFirstKeys(
            shard,
            Number(clock[0]) * 1_000 + Math.floor(Number(clock[1]) / 1_000),
          );
          const flags = (await evalReadiness(
            ACKNOWLEDGE_SCRIPT,
            [due, state, ...first.keys],
            [
              env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
              first.width,
              first.firstBucket,
              ...chunk.flatMap(({ entry: { member, trace } }) => [
                member,
                trace.revision,
                getTraceBatchFirstMember(member),
              ]),
            ],
          )) as number[];
          chunk.forEach(({ index }, position) => {
            removed[index] = Number(flags[position]) === 1;
          });
        }
      }
      return removed;
    };

    const enqueued: PendingTrace[] = [];
    const flushEnqueued = async () => {
      if (enqueued.length === 0) return;
      const removed = await acknowledge(enqueued.splice(0));
      recordIncrement(
        "langfuse.trace_batch.reactivated_traces",
        removed.filter((wasRemoved) => !wasRemoved).length,
      );
    };

    // Excluded traces leave Redis like dispatched ones; activity after this
    // run's snapshot starts a fresh pending window that is evaluated again.
    // A trace whose revision changed before acknowledgement stays pending and
    // is reported only once a later run removes it.
    const exclude = async (
      excluded: readonly {
        entry: PendingTrace;
        reason: TraceExclusionReason;
      }[],
    ) => {
      if (excluded.length === 0) return;
      await this.extendLockOnProgress(true);
      if (this.stopping) return;
      const removed = await acknowledge(excluded.map(({ entry }) => entry));
      for (const [index, { entry, reason }] of excluded.entries()) {
        if (!removed[index]) continue;
        recordIncrement("langfuse.trace_batch.excluded_traces", 1, {
          reason,
          strategy,
        });
        logger.warn("Trace batch excluded oversized trace", {
          projectId: entry.trace.projectId,
          traceId: entry.trace.traceId,
          reason,
          estimatedEventUpdateCount: entry.estimates?.eventUpdateCount,
          estimatedSerializedEventBytes: entry.estimates?.serializedEventBytes,
          eventTimeEnvelopeMs: entry.trace.maxStart - entry.trace.minStart,
        });
      }
    };

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
      enqueued.push(...batch);
      recordDistribution("langfuse.trace_batch.size", batch.length);
      recordDistribution(
        "langfuse.trace_batch.project_count",
        new Set(traces.map((trace) => trace.projectId)).size,
      );
      const fill = (() => {
        if (batch.length === 1) {
          return "singleton";
        }
        if (batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE) {
          return "full";
        }
        return "partial";
      })();
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
      const byShard = new Map<number, typeof candidates>();
      for (const candidate of candidates) {
        const group = byShard.get(candidate.shard) ?? [];
        group.push(candidate);
        byShard.set(candidate.shard, group);
      }
      const hydratedByMember = new Map<string, [string, string]>();
      for (const [shard, group] of byShard) {
        const { due, state } = getTraceBatchReadinessKeys(shard);
        for (let start = 0; start < group.length; start += REDIS_CHUNK_SIZE) {
          await this.extendLockOnProgress();
          const part = (await evalReadiness(
            HYDRATE_SCRIPT,
            [due, state],
            [
              group[0].cutoff,
              env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
              ...group
                .slice(start, start + REDIS_CHUNK_SIZE)
                .map(({ member }) => member),
            ],
          )) as string[];
          for (let index = 0; index < part.length; index += 3) {
            hydratedByMember.set(part[index], [
              part[index + 1],
              part[index + 2],
            ]);
          }
        }
      }
      recordIncrement(
        "langfuse.trace_batch.skipped_traces",
        candidates.length - hydratedByMember.size,
      );
      const hydratedCandidates: PendingTrace[] = [];
      const excluded: {
        entry: PendingTrace;
        reason: TraceExclusionReason;
      }[] = [];
      for (const { member } of candidates) {
        if (this.stopping) return;
        const hydrated = hydratedByMember.get(member);
        if (!hydrated) continue;
        const [projectId, traceId] = JSON.parse(member) as [string, string];
        const state = JSON.parse(hydrated[0]);
        const entry: PendingTrace = {
          member,
          due: Number(hydrated[1]),
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
        };
        const reason = getTraceExclusionReason(entry, traceWeightLimits);
        if (reason) excluded.push({ entry, reason });
        else hydratedCandidates.push(entry);
      }
      await exclude(excluded);
      if (this.stopping) return;

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
        batchWeightLimits,
      );
      recordDistribution(
        "langfuse.trace_batch.selector_duration_ms",
        performance.now() - selectorStartedAt,
        { strategy },
      );

      try {
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
          batchWeightLimits,
        );
        localityPartials = prepared.carry;
        for (const batch of prepared.dispatch) {
          if (this.stopping) return;
          await enqueue(batch);
        }
      } finally {
        await flushEnqueued();
      }
    }
    if (this.stopping) return;
    try {
      if (strategy === "project") {
        if (projectBatchTail.length > 0) await enqueue(projectBatchTail);
        return;
      }
      for (const batch of localityPartials.toSorted(
        compareBatchesByOldestDue,
      )) {
        if (this.stopping) return;
        await enqueue(batch);
      }
    } finally {
      await flushEnqueued();
    }
  }
}
