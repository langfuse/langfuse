import { useMemo } from "react";
import {
  type ScoreTarget,
  type AnnotationScore,
} from "@/src/features/scores/types";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { mergeAnnotationScoresWithCache } from "@/src/features/scores/lib/mergeScoresWithCache";
import { filterScoresByTarget } from "@/src/features/scores/lib/filterScoresByTarget";

/**
 * Hook for merging server annotation scores with cached scores
 *
 * Takes already-transformed AnnotationScore[] from server and overlays:
 * - Cached creates/updates (optimistic)
 * - Cached deletes (filters out)
 *
 * This is the single merge point for AnnotationScore[] + cache.
 * Callers must transform their server data to AnnotationScore[] first.
 *
 * @param serverAnnotationScores - Pre-transformed annotation scores from server
 * @param target - Target for cache filtering
 * @param mode - Describes whether to include child observation scores or only target scores. Defaults to only target scores.
 * @returns Merged annotation scores with cache overlay
 */
export function useMergedAnnotationScores(
  serverAnnotationScores: AnnotationScore[],
  target: ScoreTarget,
  mode: "target-and-child-scores" | "target-scores-only" = "target-scores-only",
): AnnotationScore[] {
  const { getAllForTarget, isDeleted } = useScoreCache();

  const cachedScores = getAllForTarget(mode, {
    traceId: target.type === "trace" ? target.traceId : undefined,
    observationId: target.type === "trace" ? target.observationId : undefined,
    sessionId: target.type === "session" ? target.sessionId : undefined,
  });

  // Filter server scores based on mode and target
  const filteredServerScores = useMemo(
    () => filterScoresByTarget(serverAnnotationScores, target, mode),
    [serverAnnotationScores, target, mode],
  );

  // Build deletedIds Set
  const deletedIds = useMemo(() => {
    const ids = new Set<string>();
    filteredServerScores.forEach((s) => {
      if (s.id && isDeleted(s.id)) ids.add(s.id);
    });
    return ids;
  }, [filteredServerScores, isDeleted]);

  return useMemo(
    () =>
      mergeAnnotationScoresWithCache(
        filteredServerScores,
        cachedScores,
        deletedIds,
      ),
    [filteredServerScores, cachedScores, deletedIds],
  );
}
