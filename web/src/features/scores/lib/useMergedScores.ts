import { useMemo } from "react";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreTarget } from "@/src/features/scores/types";
import { mergeScoresWithCache } from "@/src/features/scores/lib/mergeScoresWithCache";
import { filterScoresByTarget } from "@/src/features/scores/lib/filterScoresByTarget";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

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
 * @returns ScoreDomain[] with all cache operations applied
 */
export function useMergedScores(
  serverScores: WithStringifiedMetadata<ScoreDomain>[],
  target: ScoreTarget | ScoreTarget[],
  mode: "target-and-child-scores" | "target-scores-only" = "target-scores-only",
): WithStringifiedMetadata<ScoreDomain>[] {
  const { getAllForTarget, isDeleted } = useScoreCache();

  const targets = useMemo(
    () => (Array.isArray(target) ? target : [target]),
    [target],
  );
  const cachedScores = targets.flatMap((current) =>
    getAllForTarget(mode, {
      traceId: current.type === "trace" ? current.traceId : undefined,
      observationId:
        current.type === "trace" ? current.observationId : undefined,
      sessionId: current.type === "session" ? current.sessionId : undefined,
    }),
  );

  // Filter server scores based on mode and target
  const filteredServerScores = useMemo(() => {
    const ids = new Set(
      targets.flatMap((current) =>
        filterScoresByTarget(serverScores, current, mode).map(
          (score) => score.id,
        ),
      ),
    );
    return serverScores.filter((score) => ids.has(score.id));
  }, [serverScores, targets, mode]);

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
