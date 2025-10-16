import { useMemo } from "react";
import {
  type CategoricalAggregate,
  type NumericAggregate,
  type ScoreAggregate,
} from "@langfuse/shared";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";

/**
 * Hook for merging server aggregates with cached scores (F3: Compare View)
 *
 * Directly patches aggregate entries with cached values - no flatten/re-aggregate.
 * Only patches single-value aggregates (those with an id field).
 * Used in compare view table cells for optimistic score display.
 *
 * @param serverAggregates - Score aggregates from server
 * @param traceId - Trace ID for filtering cache
 * @param observationId - Optional observation ID for filtering cache
 * @returns Merged aggregates with cache applied
 */
export function useMergedAggregates(
  serverAggregates: ScoreAggregate,
  traceId: string,
  observationId?: string,
): ScoreAggregate {
  const cache = useScoreCache();

  return useMemo(() => {
    const merged = { ...serverAggregates };

    // For each cached score, patch its aggregate entry directly
    cache.getAllForTarget({ traceId, observationId }).forEach((cached) => {
      const key = composeAggregateScoreKey({
        name: cached.name,
        source: cached.source,
        dataType: cached.dataType,
      });

      // Only patch if this aggregate entry has the same ID (single-value)
      if (merged[key]?.id === cached.id) {
        if (cached.deleted) {
          delete merged[key]; // Remove deleted scores
        } else {
          // Update aggregate with cached values
          if (cached.dataType === "NUMERIC") {
            const numericAggregate: NumericAggregate = {
              type: "NUMERIC",
              values: [cached.value as number],
              average: cached.value as number,
              comment: cached.comment,
            };
            merged[key] = numericAggregate;
          } else {
            const categoricalAggregate: CategoricalAggregate = {
              type: "CATEGORICAL",
              values: [cached.stringValue as string],
              valueCounts: [
                {
                  value: cached.stringValue as string,
                  count: 1,
                },
              ],
              comment: cached.comment,
            };
            merged[key] = categoricalAggregate;
          }
        }
      }
    });

    return merged;
  }, [serverAggregates, cache, traceId, observationId]);
}
