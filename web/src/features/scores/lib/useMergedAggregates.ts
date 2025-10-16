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
 * Applies all cache operations to server aggregates:
 * - Adds new cache-only scores as single-value aggregates
 * - Updates existing scores with cached values
 * - Removes deleted scores from aggregates
 *
 * Used in compare view table cells for optimistic score display.
 *
 * @param serverAggregates - Score aggregates from server
 * @param traceId - Trace ID for filtering cache
 * @param observationId - Optional observation ID for filtering cache
 * @returns Merged aggregates with all cache operations applied
 */
export function useMergedAggregates(
  serverAggregates: ScoreAggregate,
  traceId: string,
  observationId?: string,
): ScoreAggregate {
  const { getAllForTarget, isDeleted } = useScoreCache();

  return useMemo(() => {
    const merged = { ...serverAggregates };

    // Remove deleted scores from server aggregates
    Object.entries(merged).forEach(([key, aggregate]) => {
      if (aggregate.id && isDeleted(aggregate.id)) {
        delete merged[key];
      }
    });

    // Apply cached scores to aggregates
    getAllForTarget({ traceId, observationId }).forEach((cached) => {
      const key = composeAggregateScoreKey({
        name: cached.name,
        source: cached.source,
        dataType: cached.dataType,
      });

      // Add or update aggregate with cached values
      if (cached.dataType === "NUMERIC") {
        const numericAggregate: NumericAggregate = {
          type: "NUMERIC",
          values: [cached.value as number],
          average: cached.value as number,
          comment: cached.comment,
          id: cached.id, // Include ID to indicate single-value aggregate
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
          id: cached.id, // Include ID to indicate single-value aggregate
        };
        merged[key] = categoricalAggregate;
      }
    });

    return merged;
  }, [serverAggregates, getAllForTarget, isDeleted, traceId, observationId]);
}
