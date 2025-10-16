import { useMemo } from "react";
import { type APIScoreV2 } from "@langfuse/shared";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreTarget } from "@/src/features/scores/types";

/**
 * Hook for merging server scores with cached scores
 *
 * Overlays cached scores onto server data for a specific target.
 * Used in trace detail annotation drawer for flat score list.
 *
 * @param serverScores - Flat scores from tRPC query
 * @param target - Target to filter cache by (traceId, observationId, sessionId)
 * @returns Merged flat scores with cache overlay
 */
export function useMergedScores(
  serverScores: APIScoreV2[],
  target: ScoreTarget,
): APIScoreV2[] {
  const cache = useScoreCache();

  return useMemo(() => {
    const merged = new Map<string, APIScoreV2>();

    // Start with server scores
    serverScores.forEach((s) => merged.set(s.id, s));

    // Overlay cached scores for this target
    const cachedForTarget = cache.getAllForTarget({
      traceId: target.type === "trace" ? target.traceId : undefined,
      observationId: target.type === "trace" ? target.observationId : undefined,
      sessionId: target.type === "session" ? target.sessionId : undefined,
    });

    cachedForTarget.forEach((cached) => {
      merged.set(cached.id, cached as unknown as APIScoreV2);
    });

    return Array.from(merged.values());
  }, [serverScores, cache, target]);
}
