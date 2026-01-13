import { api } from "@/src/utils/api";
import {
  isSessionScore,
  isTraceScore,
} from "@/src/features/scores/lib/helpers";
import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreTarget } from "@langfuse/shared";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

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
    rollbackSet: cacheRollbackSet,
    rollbackDelete: cacheRollbackDelete,
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
        timestamp: (variables.timestamp as Date | undefined) ?? new Date(),
      });

      return { scoreId: variables.id! };
    },
    onError: (err, variables) => {
      if (!variables.id) return;
      // Rollback failed create from cache
      cacheRollbackSet(variables.id);
      showErrorToast("Failed to create score", err.message, "WARNING");
    },
  });

  const updateMutation = api.scores.updateAnnotationScore.useMutation({
    onMutate: (variables) => {
      const previousCacheValue = cacheGet(variables.id);

      if (!previousCacheValue) {
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
          timestamp: (variables.timestamp as Date | undefined) ?? new Date(),
        });
      } else {
        // Merge update into existing cache entry
        cacheSet(variables.id, {
          ...previousCacheValue,
          value: variables.value ?? previousCacheValue.value,
          stringValue: variables.stringValue ?? previousCacheValue.stringValue,
          comment: variables.comment ?? null,
        });
      }

      return { previousCacheValue };
    },
    onError: (err, variables, context) => {
      // Rollback cache
      if (context?.previousCacheValue) {
        // Had cache entry → restore previous value
        cacheSet(variables.id, context.previousCacheValue);
      } else {
        // No cache entry → was DB-persisted → rollback optimistic update
        cacheRollbackSet(variables.id);
      }
      showErrorToast("Failed to update score", err.message, "WARNING");
    },
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: (variables) => {
      // Snapshot score before delete (may be undefined)
      const previousCacheValue = cacheGet(variables.id);

      // Mark score as deleted
      cacheDelete(variables.id);

      return { previousCacheValue };
    },
    onError: (err, variables, context) => {
      // Rollback
      cacheRollbackDelete(variables.id, context?.previousCacheValue);
      showErrorToast("Failed to delete score", err.message, "WARNING");
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
