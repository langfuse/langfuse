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

    await Promise.all([
      utils.scores.invalidate(),
      utils.traces.byIdWithObservationsAndScores.invalidate(),
      utils.sessions.invalidate(),
    ]);

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
  }: {
    utils: ReturnType<typeof api.useUtils>;
    fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
    update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
    configs: ValidatedScoreConfig[];
    remove: ReturnType<typeof useFieldArray>["remove"];
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
  }) =>
  async (data?: APIScoreV2, error?: unknown) => {
    if (!data || error) return;

    const { id, name, dataType, configId } = data;
    const updatedScoreIndex = fields.findIndex((field) => field.scoreId === id);

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

    await Promise.all(
      [
        utils.scores.invalidate(),
        utils.traces.byIdWithObservationsAndScores.invalidate(),
        utils.sessions.invalidate(),
      ].filter(Boolean),
    );

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

    await Promise.all([
      utils.scores.invalidate(),
      utils.sessions.byIdWithScores.invalidate(),
    ]);

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

  const onSettledUpsert = isTraceScore(scoreTarget)
    ? onTraceScoreSettledUpsert({
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
