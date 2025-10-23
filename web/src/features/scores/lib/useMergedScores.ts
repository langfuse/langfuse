import { useMemo } from "react";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreTarget } from "@/src/features/scores/types";
import { mergeScoresWithCache } from "@/src/features/scores/lib/mergeScoresWithCache";
import { type APIScoreV2 } from "@langfuse/shared";
import { filterScoresByTarget } from "@/src/features/scores/lib/filterScoresByTarget";

/**
 * Hook for merging server scores with cached scores
 *
 * Applies all cache operations to server scores:
 * - Adds new cache-only scores
 * - Updates existing scores with cached values
 * - Removes deleted scores
 *
 * Used in trace detail annotation drawer for flat score list.
 *
 * @param serverScores - Flat scores from tRPC query
 * @param target - Target to filter cache by (traceId, observationId, sessionId)
 * @param mode - Describes whether to include child observation scores or only target scores. Defaults to only target scores.
 * @returns APIScoreV2[] with all cache operations applied
 */
export function useMergedScores(
  serverScores: APIScoreV2[],
  target: ScoreTarget,
  mode: "target-and-child-scores" | "target-scores-only" = "target-scores-only",
): APIScoreV2[] {
  const { getAllForTarget, isDeleted } = useScoreCache();

  const cachedScores = getAllForTarget(mode, {
    traceId: target.type === "trace" ? target.traceId : undefined,
    observationId: target.type === "trace" ? target.observationId : undefined,
    sessionId: target.type === "session" ? target.sessionId : undefined,
  });

  // Filter server scores based on mode and target
  const filteredServerScores = useMemo(
    () => filterScoresByTarget(serverScores, target, mode),
    [serverScores, target, mode],
  );

  // Build deletedIds Set
  const deletedIds = useMemo(() => {
    const ids = new Set<string>();
    filteredServerScores.forEach((s) => {
      if (isDeleted(s.id)) ids.add(s.id);
    });
    return ids;
  }, [filteredServerScores, isDeleted]);

  return useMemo(
    () => mergeScoresWithCache(filteredServerScores, cachedScores, deletedIds),
    [filteredServerScores, cachedScores, deletedIds],
  );
}
