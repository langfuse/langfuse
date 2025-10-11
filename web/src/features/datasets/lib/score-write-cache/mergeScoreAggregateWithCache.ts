import { type CachedScore } from "@/src/features/datasets/lib/score-write-cache/types";
import { resolveAggregateType } from "@/src/features/scores/lib/aggregateScores";
import { type ScoreColumn } from "@/src/features/scores/types";
import { type ScoreAggregate } from "@langfuse/shared";

/**
 * Check if a score has been deleted in cache
 */
function isDeleted(scoreId: string, deletes: Set<string>): boolean {
  return deletes.has(scoreId);
}

/**
 * Apply cached update to existing aggregate.
 * Handles both NUMERIC and CATEGORICAL types.
 */
function applyUpdate(
  aggregate: ScoreAggregate[string],
  update: CachedScore,
): ScoreAggregate[string] {
  if (aggregate.type === "NUMERIC") {
    const value = update.value as number;
    return {
      ...aggregate,
      values: [value],
      average: value,
      comment: update.comment,
    };
  }

  // CATEGORICAL
  const value = update.stringValue as string;
  return {
    ...aggregate,
    values: [value],
    valueCounts: [{ value, count: 1 }],
    comment: update.comment,
  };
}

/**
 * Find a cached create matching trace/observation/column.
 * Returns [scoreId, cachedScore] or null if no match.
 */
function findMatchingCreate(
  creates: Map<string, CachedScore>,
  traceId: string,
  observationId: string | undefined,
  scoreName: string,
  scoreDataType: "NUMERIC" | "CATEGORICAL",
): [string, CachedScore] | null {
  for (const [scoreId, cachedScore] of creates.entries()) {
    if (
      cachedScore.traceId === traceId &&
      cachedScore.observationId === observationId &&
      cachedScore.name === scoreName &&
      cachedScore.dataType === scoreDataType
    ) {
      return [scoreId, cachedScore];
    }
  }
  return null;
}

/**
 * Build aggregate from cached create.
 * If update provided, apply it on top of create.
 */
function buildAggregateFromCreate(
  cachedScore: CachedScore,
  scoreId: string,
  update?: CachedScore,
): ScoreAggregate[string] {
  // Determine final values (use update if available, else create)
  const finalValue = (update?.value ?? cachedScore.value) as number;
  const finalStringValue = (update?.stringValue ??
    cachedScore.stringValue) as string;
  const finalComment = update?.comment ?? cachedScore.comment;

  if (cachedScore.dataType === "NUMERIC") {
    return {
      type: "NUMERIC",
      id: scoreId,
      values: [finalValue],
      average: finalValue,
      comment: finalComment,
      hasMetadata: false,
    };
  }

  // CATEGORICAL
  return {
    type: "CATEGORICAL",
    id: scoreId,
    values: [finalStringValue],
    valueCounts: [{ value: finalStringValue, count: 1 }],
    comment: finalComment,
    hasMetadata: false,
  };
}

/**
 * Merges cached score writes into score aggregates for optimistic UI.
 *
 * Operation precedence (applied in this order):
 * 1. Deletes remove scores completely (even if also updated)
 * 2. Updates modify existing scores (including cached creates)
 * 3. Creates add new scores to empty slots
 *
 * @param scoreAggregate - Raw score aggregates from ClickHouse
 * @param cache - Write cache with creates/updates/deletes
 * @param traceId - Trace ID for matching cached creates
 * @param observationId - Observation ID for matching cached creates
 * @param scoreColumns - Score column definitions for iteration
 * @returns Merged aggregate with cache applied (non-mutating)
 */
export function mergeScoreAggregateWithCache(
  scoreAggregate: ScoreAggregate,
  creates: Map<string, CachedScore>,
  updates: Map<string, CachedScore>,
  deletes: Set<string>,
  traceId: string,
  observationId: string | undefined,
  scoreColumns: ScoreColumn[],
): ScoreAggregate {
  const result = { ...scoreAggregate };

  // Process each score column
  for (const column of scoreColumns) {
    const key = column.key;
    const aggregate = result[key];

    // CASE 1: Single value aggregate exists
    if (aggregate?.id) {
      // Priority 1: Check if deleted
      if (isDeleted(aggregate.id, deletes)) {
        delete result[key];
        continue;
      }

      // Priority 2: Check if updated
      const update = updates.get(aggregate.id);
      if (update) {
        result[key] = applyUpdate(aggregate, update);
        continue;
      }

      // No changes, keep as-is
      continue;
    }

    // CASE 2: No single value aggregate
    // Check for cached create matching this trace/obs/column
    const columnDataType = resolveAggregateType(column.dataType);
    const create = findMatchingCreate(
      creates,
      traceId,
      observationId,
      column.name,
      columnDataType,
    );

    if (create) {
      const [scoreId, cachedScore] = create;

      // Check if this create also has an update
      const update = updates.get(scoreId);

      // Build aggregate from create (+ optional update)
      result[key] = buildAggregateFromCreate(cachedScore, scoreId, update);
    }
  }

  return result;
}
