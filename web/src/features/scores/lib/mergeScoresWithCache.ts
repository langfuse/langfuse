import { type ScoreDomain, type ScoreAggregate } from "@langfuse/shared";
import { type CachedScore } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type AnnotationScore } from "@/src/features/scores/types";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

/**
 * Pure function: Merge ScoreDomain[] with cache
 *
 * Applies cache operations while preserving complete server objects:
 * - Update existing: Overlays only editable fields (value, stringValue, comment)
 * - Add new: Adds cache-only scores (these are incomplete but OK for optimistic UI)
 * - Delete: Removes deleted scores
 *
 * @param serverScores - Scores from tRPC
 * @param cachedScores - Scores from cache for this target
 * @param deletedIds - Set of deleted score IDs
 * @returns Merged scores with cache overlay
 */
export function mergeScoresWithCache(
  serverScores: WithStringifiedMetadata<ScoreDomain>[],
  cachedScores: CachedScore[],
  deletedIds: Set<string>,
): WithStringifiedMetadata<ScoreDomain>[] {
  const merged = new Map<string, WithStringifiedMetadata<ScoreDomain>>();

  // Start with server scores (filter out deleted ones)
  serverScores.forEach((s) => {
    if (!deletedIds.has(s.id)) {
      merged.set(s.id, s);
    }
  });

  // Overlay cached scores
  cachedScores.forEach((cached) => {
    const existing = merged.get(cached.id);

    if (existing) {
      // Update existing: preserve server object, overlay editable fields only
      merged.set(cached.id, {
        ...existing,
        value: cached.value,
        stringValue: cached.stringValue,
        comment: cached.comment,
      } as WithStringifiedMetadata<ScoreDomain>);
    } else {
      // New score: only exists in cache (incomplete but OK for optimistic UI)
      merged.set(cached.id, cached as WithStringifiedMetadata<ScoreDomain>);
    }
  });

  return Array.from(merged.values());
}

/**
 * Pure function: Merge ScoreAggregate with cache
 *
 * Removes deleted aggregates and overlays cached values.
 *
 * @param serverAggregates - Aggregates from tRPC
 * @param cachedScores - Scores from cache for this target
 * @param deletedIds - Set of deleted score IDs
 * @returns Merged aggregates with cache overlay
 */
export function mergeAggregatesWithCache(
  serverAggregates: ScoreAggregate,
  cachedScores: CachedScore[],
  deletedIds: Set<string>,
): ScoreAggregate {
  const merged = { ...serverAggregates };

  // Remove deleted scores from server aggregates
  Object.entries(merged).forEach(([key, aggregate]) => {
    if (aggregate.id && deletedIds.has(aggregate.id)) {
      delete merged[key];
    }
  });

  // Apply cached scores to aggregates
  cachedScores.forEach((cached) => {
    const key = composeAggregateScoreKey({
      name: cached.name,
      source: cached.source,
      dataType: cached.dataType,
    });

    // Add or update aggregate with cached values
    if (cached.dataType === "NUMERIC") {
      merged[key] = {
        type: "NUMERIC",
        values: [cached.value as number],
        average: cached.value as number,
        comment: cached.comment,
        id: cached.id,
      };
    } else {
      merged[key] = {
        type: "CATEGORICAL",
        values: [cached.stringValue as string],
        valueCounts: [
          {
            value: cached.stringValue as string,
            count: 1,
          },
        ],
        comment: cached.comment,
        id: cached.id,
      };
    }
  });

  return merged;
}

/**
 * Pure function: Merge AnnotationScore[] with cache
 *
 * Applies cache operations while preserving complete server objects:
 * - Update existing: Overlays only editable fields (value, stringValue, comment)
 * - Add new: Creates new AnnotationScore from cached data
 * - Delete: Removes deleted scores
 *
 * @param serverAnnotationScores - Already-transformed annotation scores from server
 * @param cachedScores - Scores from cache for this target
 * @param deletedIds - Set of deleted score IDs
 * @returns Merged annotation scores with cache overlay
 */
export function mergeAnnotationScoresWithCache(
  serverAnnotationScores: AnnotationScore[],
  cachedScores: CachedScore[],
  deletedIds: Set<string>,
): AnnotationScore[] {
  const merged = new Map<string, AnnotationScore>();

  // Start with server scores (filter out deleted ones)
  serverAnnotationScores.forEach((s) => {
    if (!deletedIds.has(s.id ?? "")) {
      merged.set(s.id ?? "", s);
    }
  });

  // Overlay cached scores
  cachedScores.forEach((cached) => {
    const existing = merged.get(cached.id);

    if (existing) {
      // Update existing: preserve server object, overlay editable fields only
      merged.set(cached.id, {
        ...existing,
        value: cached.value,
        stringValue: cached.stringValue,
        comment: cached.comment,
      });
    } else {
      // New score: create AnnotationScore from cached data
      merged.set(cached.id, {
        id: cached.id,
        name: cached.name,
        dataType: cached.dataType,
        source: cached.source,
        configId: cached.configId,
        value: cached.value,
        stringValue: cached.stringValue,
        comment: cached.comment,
        traceId: cached.traceId ?? null,
        observationId: cached.observationId ?? null,
        sessionId: cached.sessionId ?? null,
        timestamp: cached.timestamp ?? null,
      });
    }
  });

  return Array.from(merged.values());
}
