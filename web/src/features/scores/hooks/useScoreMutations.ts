import { api } from "@/src/utils/api";
import { type ScoreTarget } from "../types";
import { isTraceScore } from "@/src/features/scores/lib/helpers";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";

export function useScoreMutations({
  scoreTarget,
  scoreMetadata,
}: {
  scoreTarget: ScoreTarget;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
}) {
  const {
    set: cacheSet,
    get: cacheGet,
    delete: cacheDelete,
    setColumn: cacheSetColumn,
  } = useScoreCache();

  // Create mutations with cache writes
  const createMutation = api.scores.createAnnotationScore.useMutation({
    onMutate: (variables) => {
      if (!variables.id) return;

      // Write to columns cache
      cacheSetColumn({
        name: variables.name,
        dataType: variables.dataType,
        source: "ANNOTATION",
      });

      // Write to cache for optimistic update
      cacheSet(variables.id, {
        id: variables.id,
        projectId: scoreMetadata.projectId,
        environment: scoreMetadata.environment ?? "default",
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
      const existing = cacheGet(variables.id);

      if (!existing) {
        // Write to cache for optimistic update
        cacheSet(variables.id, {
          id: variables.id,
          projectId: scoreMetadata.projectId,
          environment: scoreMetadata.environment ?? "default",
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
      } else {
        // Merge update into existing cache entry
        cacheSet(variables.id, {
          ...existing,
          value: variables.value ?? existing.value,
          stringValue: variables.stringValue ?? existing.stringValue,
          comment: variables.comment ?? null,
        });
      }
    },
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: (variables) => {
      // Mark score as deleted
      cacheDelete(variables.id);
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
