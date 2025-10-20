import { useMemo } from "react";
import { type ScoreAggregate } from "@langfuse/shared";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { mergeAggregatesWithCache } from "@/src/features/scores/lib/mergeScoresWithCache";

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
 * @param mode - Describes whether to include child observation scores or only target scores. Defaults to only target scores.
 * @returns Merged aggregates with all cache operations applied
 */
export function useMergedAggregates(
  serverAggregates: ScoreAggregate,
  traceId: string,
  observationId?: string,
  mode: "target-and-child-scores" | "target-scores-only" = "target-scores-only",
): ScoreAggregate {
  const { getAllForTarget, isDeleted } = useScoreCache();

  const cachedScores = getAllForTarget(mode, { traceId, observationId });

  // Build deletedIds Set
  const deletedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(serverAggregates).forEach((agg) => {
      if (agg.id && isDeleted(agg.id)) ids.add(agg.id);
    });
    return ids;
  }, [serverAggregates, isDeleted]);

  return useMemo(
    () => mergeAggregatesWithCache(serverAggregates, cachedScores, deletedIds),
    [serverAggregates, cachedScores, deletedIds],
  );
}
