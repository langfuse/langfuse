import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useScoreMutations } from "@/src/features/scores/hooks/useScoreMutations";
import { getAnnotationFormError } from "@/src/features/scores/lib/annotationFormHelpers";
import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import {
  type OptimisticScore,
  type AnnotateFormSchemaType,
  type AnnotationScoreSchemaType,
  type OnMutateCallbacks,
} from "@/src/features/scores/types";
import {
  type APIScoreV2,
  CreateAnnotationScoreData,
  isPresent,
  type ScoreConfigCategoryDomain,
  type ScoreConfigDomain,
  type ScoreTarget,
  UpdateAnnotationScoreData,
} from "@langfuse/shared";
import { useRef } from "react";
import {
  type ControllerRenderProps,
  type UseFormReturn,
  type FieldArrayWithId,
  type UseFieldArrayUpdate,
  type UseFieldArrayRemove,
} from "react-hook-form";
import { v4 } from "uuid";

export function useAnnotationFormHandlers({
  form,
  fields,
  remove,
  update,
  setOptimisticScore,
  configs,
  scoreMetadata,
  scoreTarget,
  analyticsData,
  onMutateCallbacks,
}: {
  form: UseFormReturn<AnnotateFormSchemaType>;
  fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
  update: UseFieldArrayUpdate<AnnotateFormSchemaType>;
  remove: UseFieldArrayRemove;
  setOptimisticScore: (score: OptimisticScore) => void;
  configs: ScoreConfigDomain[];
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  scoreTarget: ScoreTarget;
  analyticsData?: { type: string; source: string };
  onMutateCallbacks?: OnMutateCallbacks;
}) {
  const capture = usePostHogClientCapture();

  // Mutations
  const { createMutation, updateMutation, deleteMutation } = useScoreMutations({
    scoreTarget,
    fields,
    update,
    remove,
    configs,
    onMutateCallbacks,
  });

  // Track pending creates and deletes
  const pendingCreates = useRef(new Map<number, Promise<APIScoreV2>>());
  const pendingDeletes = useRef(new Set<string>());
  // Track when deletion was initiated for each score ID
  const deletionTimestamps = useRef(new Map<string, number>());

  async function handleScoreChange(
    score: AnnotationScoreSchemaType,
    index: number,
    value: number,
    stringValue: string | null,
  ) {
    // Check if this score is currently being deleted
    if (score.scoreId && pendingDeletes.current.has(score.scoreId)) {
      // Skip updates for scores that are being deleted
      return;
    }

    // Check if there was a recent deletion request for this score
    if (score.scoreId && deletionTimestamps.current.has(score.scoreId)) {
      const deleteTime = deletionTimestamps.current.get(score.scoreId) || 0;
      const now = Date.now();
      // If deletion was requested in the last 5 seconds, ignore updates
      if (now - deleteTime < 5000) {
        return;
      }
      // Otherwise clear the old timestamp
      deletionTimestamps.current.delete(score.scoreId);
    }

    // Optimistically update the UI
    setOptimisticScore({
      index,
      value,
      stringValue,
    });

    try {
      // If we have an ID, straightforward update
      if (!!score.scoreId) {
        const validatedScore = UpdateAnnotationScoreData.parse({
          id: score.scoreId,
          projectId: scoreMetadata.projectId,
          scoreTarget,
          name: score.name,
          dataType: score.dataType,
          configId: score.configId,
          stringValue: stringValue ?? score.stringValue,
          comment: score.comment,
          value,
          queueId: scoreMetadata.queueId,
          environment: scoreMetadata.environment,
        });

        await updateMutation.mutateAsync({
          ...validatedScore,
        });

        capture("score:update", {
          ...analyticsData,
          dataType: score.dataType,
        });
      } else {
        const pendingCreate = pendingCreates.current.get(index);

        if (pendingCreate) {
          // Wait for the pending create to complete to get the ID
          const createdScore = await pendingCreate;
          const validatedScore = UpdateAnnotationScoreData.parse({
            id: createdScore.id,
            projectId: scoreMetadata.projectId,
            scoreTarget,
            name: score.name,
            dataType: score.dataType,
            configId: score.configId,
            stringValue: stringValue ?? score.stringValue,
            comment: score.comment,
            value,
            queueId: scoreMetadata.queueId,
            environment: scoreMetadata.environment,
          });

          await updateMutation.mutateAsync({
            ...validatedScore,
          });

          capture("score:update", {
            ...analyticsData,
            dataType: score.dataType,
          });
        } else {
          // If no pending create, straightforward create
          const validatedScore = CreateAnnotationScoreData.parse({
            projectId: scoreMetadata.projectId,
            scoreTarget,
            name: score.name,
            dataType: score.dataType,
            configId: score.configId,
            stringValue: stringValue ?? score.stringValue,
            comment: score.comment,
            value,
            queueId: scoreMetadata.queueId,
            environment: scoreMetadata.environment,
          });

          const clientId = v4();
          const createPromise = createMutation.mutateAsync({
            id: clientId,
            ...validatedScore,
          });

          // Set pending create immediately to prevent race condition
          pendingCreates.current.set(index, createPromise);

          capture("score:create", {
            ...analyticsData,
            dataType: score.dataType,
          });

          // Wait for creation and cleanup
          const createdScore = await createPromise;
          pendingCreates.current.delete(index);

          // Update the form with the new ID
          update(index, {
            ...score,
            scoreId: createdScore.id,
            value: createdScore.value,
            stringValue: createdScore.stringValue ?? undefined,
          });
        }
      }
    } catch (error) {
      // Handle error and revert optimistic update
      console.error(error);
      setOptimisticScore({
        index,
        value: score.value ?? null,
        stringValue: score.stringValue ?? null,
      });
    }
  }

  function handleOnBlur({
    config,
    field,
    index,
    score,
  }: {
    config: ScoreConfigDomain;
    field: ControllerRenderProps<
      AnnotateFormSchemaType,
      `scoreData.${number}.value`
    >;
    index: number;
    score: AnnotationScoreSchemaType;
  }): React.FocusEventHandler<HTMLInputElement> | undefined {
    return async () => {
      const { maxValue, minValue, dataType } = config;

      if (isNumericDataType(dataType)) {
        const formError = getAnnotationFormError({
          value: field.value,
          maxValue,
          minValue,
        });
        if (!!formError) {
          form.setError(`scoreData.${index}.value`, formError);
          return;
        }
      }

      form.clearErrors(`scoreData.${index}.value`);

      if (isPresent(field.value)) {
        await handleScoreChange(score, index, Number(field.value), null);
      }
    };
  }

  function handleOnValueChange(
    score: AnnotationScoreSchemaType,
    index: number,
    configCategories: ScoreConfigCategoryDomain[],
  ): ((value: string) => void) | undefined {
    return async (stringValue) => {
      const selectedCategory = configCategories.find(
        ({ label }) => label === stringValue,
      );
      if (selectedCategory) {
        const newValue = Number(selectedCategory.value);

        await handleScoreChange(score, index, newValue, stringValue);
        form.setValue(`scoreData.${index}.value`, newValue, {
          shouldValidate: true,
        });
      }
    };
  }

  function handleCommentUpdate({
    field,
    score,
    comment,
  }: {
    field: ControllerRenderProps<
      AnnotateFormSchemaType,
      `scoreData.${number}.comment`
    >;
    score: AnnotationScoreSchemaType;
    comment?: string | null;
  }): React.MouseEventHandler<HTMLButtonElement> | undefined {
    return async () => {
      const { value, scoreId } = score;
      if (!!field.value && !!scoreId && isPresent(value)) {
        const validatedScore = UpdateAnnotationScoreData.parse({
          id: scoreId,
          projectId: scoreMetadata.projectId,
          scoreTarget,
          name: score.name,
          dataType: score.dataType,
          configId: score.configId,
          stringValue: score.stringValue,
          value,
          comment,
          queueId: scoreMetadata.queueId,
          environment: scoreMetadata.environment,
        });

        await updateMutation.mutateAsync({
          ...validatedScore,
        });

        capture(
          comment ? "score:update_comment" : "score:delete_comment",
          analyticsData,
        );
      }
    };
  }

  async function handleDeleteScore(
    score: AnnotationScoreSchemaType,
    index: number,
  ): Promise<void> {
    if (score.scoreId) {
      // Record deletion timestamp
      deletionTimestamps.current.set(score.scoreId, Date.now());

      setOptimisticScore({
        index,
        value: null,
        stringValue: null,
        scoreId: null,
      });

      // Track pending delete
      pendingDeletes.current.add(score.scoreId);

      try {
        await deleteMutation.mutateAsync({
          id: score.scoreId,
          projectId: scoreMetadata.projectId,
        });
        capture("score:delete", analyticsData);
        form.clearErrors(`scoreData.${index}.value`);

        // Update the form with the new ID
        update(index, {
          ...score,
          scoreId: undefined,
          value: null,
          stringValue: undefined,
          comment: undefined,
        });
      } finally {
        // Clean up pending delete tracking
        pendingDeletes.current.delete(score.scoreId);
      }
    }
  }

  return {
    handleOnBlur,
    handleOnValueChange,
    handleCommentUpdate,
    handleDeleteScore,
    isScoreDeletePending: deleteMutation.isPending,
    isScoreUpdatePending: updateMutation.isPending,
    isScoreCreatePending: createMutation.isPending,
    isScoreWritePending:
      updateMutation.isPending ||
      createMutation.isPending ||
      deleteMutation.isPending,
  };
}
