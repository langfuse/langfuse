import { api } from "@/src/utils/api";
import {
  type OnMutateCallbacks,
  type AnnotateFormSchemaType,
  type ScoreTarget,
} from "../types";
import { type ScoreConfigDomain, type APIScoreV2 } from "@langfuse/shared";
import {
  type UseFieldArrayUpdate,
  type UseFieldArrayRemove,
  type FieldArrayWithId,
  type useFieldArray,
} from "react-hook-form";
import { isTraceScore } from "@/src/features/scores/lib/helpers";

const onScoreSettledUpsert =
  ({
    fields,
    update,
    invalidateQueries,
  }: {
    fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
    update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
    invalidateQueries: Promise<void>[];
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

    await Promise.all(invalidateQueries);
  };

const onScoreSettledDelete =
  ({
    fields,
    update,
    configs,
    remove,
    invalidateQueries,
  }: {
    fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
    update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
    configs: ScoreConfigDomain[];
    remove: ReturnType<typeof useFieldArray>["remove"];
    invalidateQueries: Promise<void>[];
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

    await Promise.all(invalidateQueries);
  };

export function useScoreMutations({
  scoreTarget,
  fields,
  update,
  remove,
  configs,
  onMutateCallbacks,
}: {
  scoreTarget: ScoreTarget;
  fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
  update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
  remove: UseFieldArrayRemove;
  configs: ScoreConfigDomain[];
  onMutateCallbacks?: OnMutateCallbacks;
}) {
  const utils = api.useUtils();

  const invalidateQueries = isTraceScore(scoreTarget)
    ? [
        utils.traces.byIdWithObservationsAndScores.invalidate(),
        utils.sessions.invalidate(),
      ]
    : [utils.sessions.byIdWithScores.invalidate()];

  const onSettledUpsert = onScoreSettledUpsert({
    fields,
    update,
    invalidateQueries,
  });

  const onSettledDelete = onScoreSettledDelete({
    fields,
    update,
    remove,
    configs,
    invalidateQueries,
  });

  // Create mutations with shared invalidation logic
  const createMutation = api.scores.createAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
    onMutate: (variables) =>
      variables.id
        ? onMutateCallbacks?.onScoreCreate?.(variables.id, {
            ...variables,
            environment: variables.environment ?? "default", // environment is set to default if not provided
          })
        : undefined,
  });

  const updateMutation = api.scores.updateAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
    onMutate: (variables) =>
      onMutateCallbacks?.onScoreUpdate?.(variables.id, {
        ...variables,
        environment: variables.environment ?? "default", // environment is set to default if not provided
      }),
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onSettled: onSettledDelete,
    onMutate: (variables) => onMutateCallbacks?.onScoreDelete?.(variables.id),
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
