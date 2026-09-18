import type { UseFieldArrayUpdate, UseFormReturn } from "react-hook-form";
import { v4 as uuid } from "uuid";
import {
  isPresent,
  type CreateAnnotationScoreData,
  type UpdateAnnotationScoreData,
} from "@langfuse/shared";
import type { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreFormData,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";
import { shouldUseCombobox } from "@/src/features/scores/components/CategoricalScoreInput";
import {
  createAnnotationAnalytics,
  getAnnotationTargetType,
} from "@/src/features/scores/lib/annotationAnalytics";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";
import {
  enrichCategoryOptionsWithStaleScoreValue,
  resolveCategoricalNumericValue,
  validateNumericScore,
} from "@/src/features/scores/lib/annotationFormHelpers";
import {
  isNumericDataType,
  isTextDataType,
} from "@/src/features/scores/lib/helpers";
import {
  createAnnotationSaveStore,
  hasChangedAnnotationValue,
} from "@/src/features/scores/state/annotationSaveStore";

type Dependencies = {
  form: UseFormReturn<AnnotateFormSchemaType>;
  replaceField: UseFieldArrayUpdate<AnnotateFormSchemaType, "scoreData">;
  initialTargets: PreparedAnnotationTarget[];
  capture: ReturnType<typeof usePostHogClientCapture>;
  createScore: (data: CreateAnnotationScoreData) => Promise<unknown>;
  updateScore: (data: UpdateAnnotationScoreData) => Promise<unknown>;
  deleteScore: (data: { id: string; projectId: string }) => Promise<unknown>;
};

// One owner per mounted form. Actions read drafts at invocation and resolve rows
// by target + config again when asynchronous operations finish.
export function createAnnotationFormActions({
  form,
  replaceField,
  initialTargets,
  capture,
  createScore,
  updateScore,
  deleteScore,
}: Dependencies) {
  const fields = (): AnnotationScoreFormData[] =>
    form
      .getValues("scoreData")
      .map((field) => ({ ...field, id: field.id ?? null }));
  const indexOf = (key: string) =>
    fields().findIndex((field) => annotationFieldKey(field) === key);
  const find = (key: string) =>
    fields().find((field) => annotationFieldKey(field) === key);
  const saveStore = createAnnotationSaveStore(fields());
  const analytics = new Map(
    initialTargets.map((target) => [
      target.key,
      createAnnotationAnalytics(
        capture,
        {
          ...target.analyticsData,
          targetType: getAnnotationTargetType(target.scoreTarget),
        },
        target.initialFormData,
      ),
    ]),
  );
  let sequence = 0;
  const latestSaves = new Map<string, number>();

  const beginSave = (
    kind: Parameters<
      ReturnType<typeof createAnnotationAnalytics>["beginSave"]
    >[0],
    next: AnnotationScoreFormData,
    control?: Parameters<
      ReturnType<typeof createAnnotationAnalytics>["beginSave"]
    >[3],
  ) =>
    analytics.get(next.targetKey!)!.beginSave(
      kind,
      next,
      fields()
        .filter((field) => field.targetKey === next.targetKey)
        .map((field) =>
          annotationFieldKey(field) === annotationFieldKey(next) ? next : field,
        ),
      control,
    );

  const trackSave = (
    operation: Promise<unknown>,
    tracked: ReturnType<typeof beginSave>,
    field: AnnotationScoreFormData,
    onFailure: () => void,
  ) => {
    const operationSequence = ++sequence;
    const key = annotationFieldKey(field);
    const confirmed = saveStore.getState().confirmedFields.get(key)?.field;
    const changed =
      (field.id ?? null) !== (confirmed?.id ?? null) ||
      hasChangedAnnotationValue(field, confirmed);
    latestSaves.set(key, operationSequence);
    saveStore.setState((state) => ({
      pending: state.pending + 1,
      failed: state.pending ? state.failed : false,
    }));
    // Promise-owned completion survives overlapping mutation observers.
    operation.then(
      () => {
        saveStore.setState((state) => {
          const confirmedFields = new Map(state.confirmedFields);
          if ((confirmedFields.get(key)?.sequence ?? 0) <= operationSequence)
            confirmedFields.set(key, {
              field: { ...field },
              sequence: operationSequence,
            });
          return {
            confirmedFields,
            pending: state.pending - 1,
            saved: state.saved || changed,
          };
        });
        tracked?.success();
      },
      () => {
        if (latestSaves.get(key) === operationSequence) onFailure();
        tracked?.failure();
        saveStore.setState((state) => ({
          pending: state.pending - 1,
          failed: true,
        }));
      },
    );
  };

  const reportFailure = (field: AnnotationScoreFormData, message: string) => {
    const index = indexOf(annotationFieldKey(field));
    if (index < 0) return;
    form.setError(
      `scoreData.${index}.${isNumericDataType(field.dataType) ? "value" : "stringValue"}`,
      { type: "server", message },
    );
  };

  const clear = (key: string, target: PreparedAnnotationTarget) => {
    const field = find(key);
    if (!field) return;
    const cleared = {
      ...field,
      id: null,
      value: null,
      stringValue: null,
      comment: null,
      timestamp: null,
    };
    const tracked = field.id ? beginSave("delete", cleared) : undefined;
    const index = indexOf(key);
    form.clearErrors(`scoreData.${index}`);
    replaceField(index, cleared);
    if (field.id)
      trackSave(
        deleteScore({
          id: field.id,
          projectId: target.scoreMetadata.projectId,
        }),
        tracked,
        cleared,
        () => {
          const currentIndex = indexOf(key);
          if (currentIndex < 0) return;
          replaceField(currentIndex, field);
          reportFailure(field, "Failed to clear score");
        },
      );
  };

  const upsert = (
    key: string,
    target: PreparedAnnotationTarget,
    value: number | null,
    stringValue: string | null,
  ) => {
    const field = find(key);
    if (!field) return;
    const config = target.configControl.configs.find(
      (config) => config.id === field.configId,
    );
    const next = {
      ...field,
      value,
      stringValue,
      id: field.id ?? uuid(),
      timestamp: field.timestamp ?? new Date(),
    };
    const categories = enrichCategoryOptionsWithStaleScoreValue(
      config?.categories ?? [],
      field.stringValue,
    );
    let control: "text" | "number" | "select" | "segmented" = "segmented";
    if (isTextDataType(field.dataType)) control = "text";
    else if (isNumericDataType(field.dataType)) control = "number";
    else if (shouldUseCombobox(categories)) control = "select";
    const tracked = beginSave(field.id ? "update" : "create", next, {
      control,
      optionCount: config?.categories?.length ?? 0,
    });
    const index = indexOf(key);
    form.clearErrors([
      `scoreData.${index}.value`,
      `scoreData.${index}.stringValue`,
    ]);
    form.setValue(`scoreData.${index}.value`, value);
    form.setValue(`scoreData.${index}.stringValue`, stringValue);
    const { id, timestamp, targetKey: _targetKey, ...score } = field;
    const data = {
      ...score,
      ...target.scoreMetadata,
      value,
      stringValue,
      scoreTarget: target.scoreTarget,
    };
    if (!id) {
      form.setValue(`scoreData.${index}.id`, next.id);
      form.setValue(`scoreData.${index}.timestamp`, next.timestamp);
    }
    trackSave(
      id
        ? updateScore({
            ...data,
            id,
            timestamp: timestamp ?? undefined,
          } as UpdateAnnotationScoreData)
        : createScore({
            ...data,
            id: next.id,
            timestamp: next.timestamp,
          } as CreateAnnotationScoreData),
      tracked,
      next,
      () => {
        const currentIndex = indexOf(key);
        if (currentIndex < 0) return;
        form.setValue(`scoreData.${currentIndex}.value`, field.value);
        form.setValue(
          `scoreData.${currentIndex}.stringValue`,
          field.stringValue,
        );
        if (!id) {
          form.setValue(`scoreData.${currentIndex}.id`, field.id);
          form.setValue(`scoreData.${currentIndex}.timestamp`, field.timestamp);
        }
        reportFailure(
          field,
          id ? "Failed to update score" : "Failed to create score",
        );
      },
    );
  };

  const validateNumericInput = (
    key: string,
    target: PreparedAnnotationTarget,
    input: HTMLInputElement,
  ) => {
    const field = find(key);
    const config = target.configControl.configs.find(
      (config) => config.id === field?.configId,
    );
    if (!field || !config) return undefined;
    const value = input.value === "" ? null : input.valueAsNumber;
    const error = validateNumericScore({
      value,
      badInput: input.validity.badInput,
      minValue: config.minValue,
      maxValue: config.maxValue,
    });
    const index = indexOf(key);
    const name = `scoreData.${index}.value` as const;
    const currentError = form.getFieldState(name).error;
    if (error) {
      if (currentError?.message !== error)
        form.setError(name, { type: "validate", message: error });
      return undefined;
    }
    if (currentError) form.clearErrors(name);
    return value;
  };

  return {
    saveStore,
    indexOf,
    clear,
    validateNumericInput,
    open() {
      analytics.forEach((tracker) => tracker.open());
    },
    close() {
      analytics.forEach((tracker, key) =>
        tracker.close(fields().filter((field) => field.targetKey === key)),
      );
    },
    saveNumeric(
      key: string,
      target: PreparedAnnotationTarget,
      input: HTMLInputElement,
    ) {
      const value = validateNumericInput(key, target, input);
      if (value === undefined) return;
      if (value === null) {
        if (find(key)?.id) clear(key, target);
      } else upsert(key, target, value, null);
    },
    saveText(key: string, target: PreparedAnnotationTarget) {
      const field = find(key);
      if (!field) return;
      if (field.stringValue) upsert(key, target, 0, field.stringValue);
      else if (field.id) clear(key, target);
    },
    saveCategory(
      key: string,
      target: PreparedAnnotationTarget,
      stringValue: string,
      numericValue?: number,
    ) {
      const field = find(key);
      const config = target.configControl.configs.find(
        (config) => config.id === field?.configId,
      );
      if (!config) return;
      const value = resolveCategoricalNumericValue({
        categories: config.categories,
        stringValue,
        numericValue,
      });
      if (isPresent(value)) upsert(key, target, value, stringValue);
    },
    saveComment(
      key: string,
      target: PreparedAnnotationTarget,
      comment: string | null,
    ) {
      const field = find(key);
      if (!field?.id) return;
      const next = { ...field, comment };
      const tracked = beginSave(
        comment ? "update_comment" : "delete_comment",
        next,
      );
      replaceField(indexOf(key), next);
      const { targetKey: _targetKey, ...score } = field;
      trackSave(
        updateScore({
          ...score,
          ...target.scoreMetadata,
          scoreTarget: target.scoreTarget,
          comment,
        } as UpdateAnnotationScoreData),
        tracked,
        next,
        () => {
          const index = indexOf(key);
          if (index < 0) return;
          replaceField(index, field);
          form.setError(`scoreData.${index}.comment`, {
            type: "server",
            message: "Failed to update comment",
          });
        },
      );
    },
  };
}

export type AnnotationFormActions = ReturnType<
  typeof createAnnotationFormActions
>;
