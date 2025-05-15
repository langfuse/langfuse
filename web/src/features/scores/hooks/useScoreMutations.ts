import { api } from "@/src/utils/api";
import { type AnnotateFormSchemaType, type ScoreTarget } from "../types";
import { type ValidatedScoreConfig, type APIScoreV2 } from "@langfuse/shared";
import {
  type UseFieldArrayUpdate,
  type UseFieldArrayRemove,
  type FieldArrayWithId,
  type useFieldArray,
} from "react-hook-form";
import { isTraceScore } from "@/src/features/scores/lib/helpers";

const onTraceScoreSettledUpsert =
  ({
    projectId,
    traceId,
    utils,
    fields,
    update,
    isDrawerOpen,
    setShowSaving,
  }: {
    projectId: string;
    traceId: string;
    utils: ReturnType<typeof api.useUtils>;
    fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
    update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
  }) =>
  async (data?: APIScoreV2, error?: unknown) => {
    if (!data || error) return;

    const { id, value, stringValue, name, dataType, configId, comment } = data;
    const updatedScoreIndex = fields.findIndex(
      (field) => field.configId === configId,
    );

    update(updatedScoreIndex, {
      value,
      name,
      dataType,
      scoreId: id,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
    });

    console.log("invalidating traces");

    try {
      await Promise.all([
        // Invalidate all scores data
        utils.scores.invalidate(),

        utils.traces.byIdWithObservationsAndScores.invalidate(
          { projectId, traceId },
          {
            type: "all",
            refetchType: "all",
          },
        ),
        // Invalidate sessions in case they're affected
        utils.sessions.invalidate(),
      ]);
    } catch (error) {
      console.error("Error invalidating data after score update:", error);
    }

    if (!isDrawerOpen) setShowSaving(false);
  };

const onScoreSettledDelete =
  ({
    utils,
    fields,
    update,
    configs,
    remove,
    isDrawerOpen,
    setShowSaving,
    projectId,
    traceId,
  }: {
    utils: ReturnType<typeof api.useUtils>;
    fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
    update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
    configs: ValidatedScoreConfig[];
    remove: ReturnType<typeof useFieldArray>["remove"];
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
    projectId: string;
    traceId?: string;
  }) =>
  async (data?: APIScoreV2, error?: unknown) => {
    if (!data || error) return;

    const { id, name, dataType, configId } = data;
    const updatedScoreIndex = fields.findIndex((field) => field.scoreId === id);

    // Skip if index not found - might have been removed already
    if (updatedScoreIndex === -1) {
      console.log("Score index not found in form data, skipping update");
      if (!isDrawerOpen) setShowSaving(false);
      return;
    }

    const config = configs.find((config) => config.id === configId);
    if (config && config.isArchived) {
      remove(updatedScoreIndex);
    } else {
      update(updatedScoreIndex, {
        name,
        dataType,
        configId: configId ?? undefined,
        value: null,
        scoreId: undefined,
        stringValue: undefined,
        comment: undefined,
      });
    }

    try {
      await Promise.all([
        // Invalidate all scores data
        utils.scores.invalidate(),

        traceId
          ? utils.traces.byIdWithObservationsAndScores.invalidate(
              { projectId, traceId },
              {
                type: "all",
                refetchType: "all",
              },
            )
          : utils.traces.invalidate(),

        // Invalidate sessions in case they're affected
        utils.sessions.invalidate(),
      ]);
    } catch (error) {
      console.error("Error invalidating data after score deletion:", error);
    }

    if (!isDrawerOpen) setShowSaving(false);
  };

const onSessionScoreSettledUpsert =
  ({
    utils,
    fields,
    update,
    isDrawerOpen,
    setShowSaving,
  }: {
    utils: ReturnType<typeof api.useUtils>;
    fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
    update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
  }) =>
  async (data?: APIScoreV2, error?: unknown) => {
    if (!data || error) return;

    const { id, value, stringValue, name, dataType, configId, comment } = data;
    const updatedScoreIndex = fields.findIndex(
      (field) => field.configId === configId,
    );

    update(updatedScoreIndex, {
      value,
      name,
      dataType,
      scoreId: id,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
    });

    try {
      await Promise.all([
        // Invalidate all scores data
        utils.scores.invalidate(),
        // Invalidate all sessions
        utils.sessions.invalidate(),
      ]);
    } catch (error) {
      console.error(
        "Error invalidating data after session score update:",
        error,
      );
    }

    if (!isDrawerOpen) setShowSaving(false);
  };

export function useScoreMutations(
  scoreTarget: ScoreTarget,
  projectId: string,
  fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[],
  update: UseFieldArrayUpdate<AnnotateFormSchemaType>,
  remove: UseFieldArrayRemove,
  configs: ValidatedScoreConfig[],
  isDrawerOpen: boolean,
  setShowSaving: (showSaving: boolean) => void,
) {
  const utils = api.useUtils();
  const traceId = isTraceScore(scoreTarget) ? scoreTarget.traceId : undefined;

  const onSettledUpsert = isTraceScore(scoreTarget)
    ? onTraceScoreSettledUpsert({
        projectId,
        traceId: scoreTarget.traceId,
        utils,
        fields,
        update,
        isDrawerOpen,
        setShowSaving,
      })
    : onSessionScoreSettledUpsert({
        utils,
        fields,
        update,
        isDrawerOpen,
        setShowSaving,
      });

  const onSettledDelete = onScoreSettledDelete({
    utils,
    fields,
    update,
    remove,
    configs,
    isDrawerOpen,
    setShowSaving,
    projectId,
    traceId,
  });

  // Create mutations with shared invalidation logic
  const createMutation = api.scores.createAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
  });

  const updateMutation = api.scores.updateAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onSettled: onSettledDelete,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
