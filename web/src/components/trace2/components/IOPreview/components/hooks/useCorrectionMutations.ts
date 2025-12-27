import { useState } from "react";
import { api } from "@/src/utils/api";
import { useCorrectionCache } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { type ScoreDomain } from "@langfuse/shared";

interface UseCorrectionMutationsParams {
  projectId: string;
  traceId: string;
  observationId: string | undefined;
  environment: string | undefined;
  effectiveCorrection: ScoreDomain | null | undefined;
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
    onMutate: async () => {
      // Optimistic update: cache metadata only
      const tempId = effectiveCorrection?.id ?? `temp-${Date.now()}`;
      correctionCache.set(tempId, {
        id: tempId,
        timestamp: new Date(),
        projectId,
        traceId,
        observationId,
        environment,
      });
      setSaveStatus("saved");
      return { tempId };
    },
    onError: (error, vars, context) => {
      console.error("Failed to save correction:", error);
      if (context?.tempId) {
        correctionCache.rollbackSet(context.tempId);
      }
      setSaveStatus("idle");
    },
    onSuccess: (data, vars, context) => {
      // Replace temp ID with real ID from server
      if (context?.tempId && data.id !== context.tempId) {
        correctionCache.rollbackSet(context.tempId);
      }
      correctionCache.set(data.id, {
        id: data.id,
        timestamp: data.timestamp,
        projectId,
        traceId,
        observationId,
        environment,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      // Invalidate queries to refetch full data with value
      void utils.observations.byId.invalidate();
    },
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onMutate: async () => {
      if (!effectiveCorrection) return;
      // Optimistic delete
      correctionCache.delete(effectiveCorrection.id);
      return { deletedCorrection: effectiveCorrection };
    },
    onError: (error, vars, context) => {
      console.error("Failed to delete correction:", error);
      if (context?.deletedCorrection) {
        correctionCache.rollbackDelete(context.deletedCorrection.id, {
          id: context.deletedCorrection.id,
          timestamp: context.deletedCorrection.timestamp,
          projectId,
          traceId,
          observationId,
          environment,
        });
      }
    },
    onSuccess: () => {
      void utils.observations.byId.invalidate();
    },
  });

  const handleSave = (value: string) => {
    upsertMutation.mutate({
      projectId,
      id: effectiveCorrection?.id,
      environment,
      traceId,
      observationId,
      value,
    });
  };

  const handleDelete = () => {
    if (!effectiveCorrection) return;
    deleteMutation.mutate({
      projectId,
      id: effectiveCorrection.id,
    });
  };

  return {
    saveStatus,
    setSaveStatus,
    handleSave,
    handleDelete,
    isDeleting: deleteMutation.isPending,
  };
}
