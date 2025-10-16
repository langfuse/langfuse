import { useMemo } from "react";
import {
  type APIScoreV2,
  type ScoreAggregate,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import {
  type ScoreTarget,
  type AnnotationScore,
} from "@/src/features/scores/types";
import { useMergedScores } from "@/src/features/scores/lib/useMergedScores";
import {
  flattenAggregates,
  transformToAnnotationScores,
} from "@/src/features/scores/lib/transformScores";

/**
 * Hook for merging either flat scores or aggregates with cache, then transforming to annotation scores
 *
 * This hook handles both data formats (flat APIScoreV2[] and ScoreAggregate) by:
 * 1. Normalizing aggregates to flat format
 * 2. Merging with cache (single path)
 * 3. Transforming to AnnotationScore[]
 *
 * @param serverData - Either flat scores or aggregates from server
 * @param configs - Score configs for transformation
 * @param scoreTarget - Target for cache filtering
 * @returns Annotation scores with cache overlay
 */
export function useMergedAnnotationScores(
  serverData: APIScoreV2[] | ScoreAggregate,
  configs: ScoreConfigDomain[],
  scoreTarget: ScoreTarget,
): AnnotationScore[] {
  // Normalize to flat format
  const flatScores = useMemo(() => {
    if (Array.isArray(serverData)) {
      return serverData; // Already flat
    } else {
      // Convert aggregate to flat
      return flattenAggregates(
        serverData,
        configs,
        scoreTarget.type === "trace" ? scoreTarget.traceId : "",
        scoreTarget.type === "trace" ? scoreTarget.observationId : undefined,
      );
    }
  }, [serverData, configs, scoreTarget]);

  // Merge with cache
  const mergedScores = useMergedScores(flatScores, scoreTarget);

  // Transform to annotation scores
  return useMemo(
    () => transformToAnnotationScores(mergedScores, configs),
    [mergedScores, configs],
  );
}
