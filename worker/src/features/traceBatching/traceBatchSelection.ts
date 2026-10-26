import { xxh32 } from "@node-rs/xxhash";
import {
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";

export const QUERY_BUFFER_MS = 2 * 60_000;
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

export const toLimit = (value: number) =>
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

export type TraceExclusionReason = "event_updates" | "serialized_bytes";

export const getTraceExclusionReason = (
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

export const compareNumbers = (left: number, right: number) => left - right;

export const compareStrings = (left: string, right: string) => {
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

export const compareBatchesByOldestDue = (
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
