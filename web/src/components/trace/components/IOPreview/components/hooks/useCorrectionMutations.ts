import { useState, useCallback } from "react";
import { api } from "@/src/utils/api";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";
import { toast } from "sonner";
import { v4 } from "uuid";

interface UseCorrectionMutationsParams {
  projectId: string;
  traceId: string;
  observationId: string | undefined;
  environment: string | undefined;
  effectiveCorrection:
    | Pick<ScoreDomain, "id" | "longStringValue" | "timestamp">
    | null
    | undefined;
}

/**
 * Handles correction save/delete mutations with optimistic updates
 */
export function useCorrectionMutations({
  projectId,
  traceId,
  observationId,
  environment,
  effectiveCorrection,
}: UseCorrectionMutationsParams) {
  const correctionCache = useCorrectionCache();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const upsertMutation = api.scores.upsertCorrection.useMutation({
    onMutate: async (variables) => {
      // Get previous cache value for rollback
      const previousValue = correctionCache.get(variables.id);

      // Write to cache with full value for optimistic updates
      correctionCache.set(variables.id, {
        id: variables.id,
        timestamp: variables.timestamp,
        projectId,
        traceId,
        observationId: observationId ?? null,
        environment,
        value: variables.value, // Store full value
      });

      setSaveStatus("saving");
      return { previousValue, id: variables.id };
    },
    onError: (error, _, context) => {
      if (!context?.id) return;

      if (context.previousValue) {
        // Restore previous value
        correctionCache.set(context.id, context.previousValue);
      } else {
        // No previous value - rollback optimistic create
        correctionCache.rollbackSet(context.id);
      }
      setSaveStatus("idle");
    },
    onSuccess: () => {
      setSaveStatus("saved");
    },
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: async () => {
      if (!effectiveCorrection) return;

      // Get previous cache value for rollback
      const previousValue = correctionCache.get(effectiveCorrection.id);

      // Mark as deleted in cache (optimistic delete)
      correctionCache.delete(effectiveCorrection.id);

      return { previousValue, correctionId: effectiveCorrection.id };
    },
    onError: (error, _, context) => {
      toast.error("Failed to delete correction");
      // Rollback delete - restore to cache if we had a previous value
      if (context?.correctionId) {
        correctionCache.rollbackDelete(
          context.correctionId,
          context.previousValue,
        );
      }
    },
  });

  const handleSave = useCallback(
    (value: string) => {
      const isDeleted = correctionCache.isDeleted(
        effectiveCorrection?.id ?? "",
      );

      upsertMutation.mutate({
        projectId,
        id: isDeleted ? v4() : (effectiveCorrection?.id ?? v4()),
        environment,
        traceId,
        observationId,
        value,
        timestamp: isDeleted
          ? new Date()
          : (effectiveCorrection?.timestamp ?? new Date()),
      });
    },
    [
      projectId,
      traceId,
      observationId,
      environment,
      effectiveCorrection?.id,
      effectiveCorrection?.timestamp,
      upsertMutation,
      correctionCache,
    ],
  );

  const handleDelete = useCallback(() => {
    if (!effectiveCorrection) return;
    deleteMutation.mutate({
      projectId,
      id: effectiveCorrection.id,
    });
  }, [projectId, effectiveCorrection, deleteMutation]);

  return {
    saveStatus,
    setSaveStatus,
    handleSave,
    handleDelete,
    isDeleting: deleteMutation.isPending,
  };
}
