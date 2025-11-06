import { api } from "@/src/utils/api";
import {
  isSessionScore,
  isTraceScore,
} from "@/src/features/scores/lib/helpers";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreTarget } from "@langfuse/shared";

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

  // Rather than rolling back optimistic updates, we reload the page to clear the cache and invalidate trpc queries
  const onError = () => {
    window.location.reload();
  };

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
        traceId: isTraceScore(scoreTarget) ? scoreTarget.traceId : null,
        observationId: isTraceScore(scoreTarget)
          ? (scoreTarget.observationId ?? null)
          : null,
        sessionId: isSessionScore(scoreTarget) ? scoreTarget.sessionId : null,
        configId: variables.configId,
        name: variables.name,
        dataType: variables.dataType,
        source: "ANNOTATION",
        value: variables.value ?? null,
        stringValue: variables.stringValue ?? null,
        comment: variables.comment ?? null,
        timestamp: variables.timestamp ?? new Date(),
      });
    },
    onError,
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
          traceId: isTraceScore(scoreTarget) ? scoreTarget.traceId : null,
          observationId: isTraceScore(scoreTarget)
            ? (scoreTarget.observationId ?? null)
            : null,
          sessionId: isSessionScore(scoreTarget) ? scoreTarget.sessionId : null,
          configId: variables.configId,
          name: variables.name,
          dataType: variables.dataType,
          source: "ANNOTATION",
          value: variables.value ?? null,
          stringValue: variables.stringValue ?? null,
          comment: variables.comment ?? null,
          timestamp: variables.timestamp ?? new Date(),
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
    onError,
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: (variables) => {
      // Mark score as deleted
      cacheDelete(variables.id);
    },
    onError,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
