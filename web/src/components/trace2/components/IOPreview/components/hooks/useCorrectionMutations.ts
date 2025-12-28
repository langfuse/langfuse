import { useState, useCallback } from "react";
import { api } from "@/src/utils/api";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";

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
  const utils = api.useUtils();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const upsertMutation = api.scores.upsertCorrection.useMutation({
    onMutate: async (variables) => {
      // Get previous cache value for rollback
      const previousValue = effectiveCorrection?.id
        ? correctionCache.get(effectiveCorrection.id)
        : undefined;

      // Use existing ID or create temp ID
      const id = effectiveCorrection?.id ?? `temp-${Date.now()}`;

      // Write to cache with full value for optimistic updates
      correctionCache.set(id, {
        id,
        timestamp: new Date(),
        projectId,
        traceId,
        observationId: observationId ?? null,
        environment,
        value: variables.value, // Store full value
        isSaving: true,
      });

      setSaveStatus("saving");
      return { previousValue, id };
    },
    onError: (error, _, context) => {
      console.error("Failed to save correction:", error);
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
    onSuccess: (data) => {
      // Update cache with final server ID and clear saving state
      correctionCache.set(data.id, {
        id: data.id,
        timestamp: new Date(data.timestamp),
        projectId,
        traceId,
        observationId: observationId ?? null,
        environment,
        value: data.longStringValue ?? "",
        isSaving: false,
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      // Invalidate queries to refetch full data with value
      void utils.observations.byId.invalidate();
      void utils.traces.byId.invalidate();
    },
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: async () => {
      if (!effectiveCorrection) return;

      // Get previous cache value for rollback
      const previousValue = correctionCache.get(effectiveCorrection.id);

      // Mark as deleted in cache
      correctionCache.delete(effectiveCorrection.id);

      return { previousValue };
    },
    onError: (error, _, context) => {
      console.error("Failed to delete correction:", error);
      // Rollback delete
      if (context?.previousValue) {
        correctionCache.rollbackDelete(
          context.previousValue.id,
          context.previousValue,
        );
      }
    },
    onSuccess: () => {
      void utils.observations.byId.invalidate();
      void utils.traces.byId.invalidate();
    },
  });

  const handleSave = useCallback(
    (value: string) => {
      upsertMutation.mutate({
        projectId,
        id: effectiveCorrection?.id,
        environment,
        traceId,
        observationId,
        value,
      });
    },
    [
      projectId,
      traceId,
      observationId,
      environment,
      effectiveCorrection?.id,
      upsertMutation,
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
