import { useMemo } from "react";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreTarget } from "@/src/features/scores/types";
import { mergeScoresWithCache } from "@/src/features/scores/lib/mergeScoresWithCache";
import { type APIScoreV2 } from "@langfuse/shared";

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
 * @returns APIScoreV2[] with all cache operations applied
 */
export function useMergedScores(
  serverScores: APIScoreV2[],
  target: ScoreTarget,
): Omit<APIScoreV2, "timestamp" | "createdAt" | "updatedAt">[] {
  const { getAllForTarget, isDeleted } = useScoreCache();

  const cachedScores = getAllForTarget({
    traceId: target.type === "trace" ? target.traceId : undefined,
    observationId: target.type === "trace" ? target.observationId : undefined,
    sessionId: target.type === "session" ? target.sessionId : undefined,
  });

  // Build deletedIds Set
  const deletedIds = useMemo(() => {
    const ids = new Set<string>();
    serverScores.forEach((s) => {
      if (isDeleted(s.id)) ids.add(s.id);
    });
    return ids;
  }, [serverScores, isDeleted]);

  return useMemo(
    () => mergeScoresWithCache(serverScores, cachedScores, deletedIds),
    [serverScores, cachedScores, deletedIds],
  );
}
