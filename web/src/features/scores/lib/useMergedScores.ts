import { useMemo } from "react";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheProvider";
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
 * Provides the trace UI with scores including local annotation changes.
 *
 * @param serverScores - Flat scores from tRPC query
 * @param target - One score target, or all displayed trace targets in session view.
 * @param mode - Describes whether to include child observation scores or only target scores. Defaults to only target scores.
 * @returns ScoreDomain[] with all cache operations applied
 */
export function useMergedScores(
  serverScores: WithStringifiedMetadata<ScoreDomain>[],
  target: ScoreTarget | ScoreTarget[],
  mode: "target-and-child-scores" | "target-scores-only" = "target-scores-only",
): WithStringifiedMetadata<ScoreDomain>[] {
  const { getAllForTarget, isDeleted } = useScoreCache();

  const cachedScores = useMemo(() => {
    if (!Array.isArray(target)) {
      return getAllForTarget(mode, {
        traceId: target.type === "trace" ? target.traceId : undefined,
        observationId:
          target.type === "trace" ? target.observationId : undefined,
        sessionId: target.type === "session" ? target.sessionId : undefined,
      });
    }

    // Session view overlays local changes for every displayed trace.
    return target.flatMap((current) =>
      getAllForTarget(mode, {
        traceId: current.type === "trace" ? current.traceId : undefined,
        observationId:
          current.type === "trace" ? current.observationId : undefined,
        sessionId: current.type === "session" ? current.sessionId : undefined,
      }),
    );
  }, [target, mode, getAllForTarget]);

  // Filter server scores based on mode and target
  const filteredServerScores = useMemo(() => {
    if (!Array.isArray(target)) {
      return filterScoresByTarget(serverScores, target, mode);
    }

    if (target.length === 0) return [];
    // This mode receives server scores already scoped by the caller.
    if (mode === "target-and-child-scores") return serverScores;

    const ids = new Set(
      target.flatMap((current) =>
        filterScoresByTarget(serverScores, current, mode).map(
          (score) => score.id,
        ),
      ),
    );
    return serverScores.filter((score) => ids.has(score.id));
  }, [serverScores, target, mode]);

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
