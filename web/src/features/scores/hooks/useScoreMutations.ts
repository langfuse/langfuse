import { api } from "@/src/utils/api";
import { type ScoreTarget } from "../types";
import { isTraceScore } from "@/src/features/scores/lib/helpers";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";

export function useScoreMutations({
  scoreTarget,
}: {
  scoreTarget: ScoreTarget;
}) {
  const cache = useScoreCache();

  // Create mutations with cache writes
  const createMutation = api.scores.createAnnotationScore.useMutation({
    onMutate: (variables) => {
      if (!variables.id) return;

      // Write to cache for optimistic update
      cache.set(variables.id, {
        id: variables.id,
        traceId: isTraceScore(scoreTarget) ? scoreTarget.traceId : undefined,
        observationId: isTraceScore(scoreTarget)
          ? scoreTarget.observationId
          : undefined,
        sessionId: isTraceScore(scoreTarget)
          ? undefined
          : scoreTarget.sessionId,
        configId: variables.configId,
        name: variables.name,
        dataType: variables.dataType,
        source: "ANNOTATION",
        value: variables.value ?? null,
        stringValue: variables.stringValue ?? null,
        comment: variables.comment ?? null,
      });
    },
  });

  const updateMutation = api.scores.updateAnnotationScore.useMutation({
    onMutate: (variables) => {
      const existing = cache.get(variables.id);
      if (!existing) return;

      // Merge update into existing cache entry
      cache.set(variables.id, {
        ...existing,
        value: variables.value ?? existing.value,
        stringValue: variables.stringValue ?? existing.stringValue,
        comment: variables.comment ?? existing.comment,
      });
    },
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: (variables) => {
      const existing = cache.get(variables.id);
      if (!existing) return;

      // Mark as deleted in cache
      cache.set(variables.id, { ...existing, deleted: true });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
