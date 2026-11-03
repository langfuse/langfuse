import { resolveConfigValue } from "@/src/features/scores/lib/annotationFormHelpers";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreSchemaType,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";
import type { UseFieldArrayInsert, UseFieldArrayRemove } from "react-hook-form";
import { isPresent } from "@langfuse/shared";

export const annotationFieldKey = (field: {
  targetKey?: string;
  configId: string;
}) => JSON.stringify([field.targetKey, field.configId]);

export function preferredAnnotationTargets(
  targets: PreparedAnnotationTarget[],
) {
  return [...targets].sort(
    (left, right) =>
      Number(
        right.scoreTarget.type === "trace" && !!right.scoreTarget.observationId,
      ) -
      Number(
        left.scoreTarget.type === "trace" && !!left.scoreTarget.observationId,
      ),
  );
}

export function getScoreConfigSelection({
  targets,
  controlledFields,
  insert,
  remove,
}: {
  targets: PreparedAnnotationTarget[];
  controlledFields: AnnotationScoreSchemaType[];
  insert: UseFieldArrayInsert<AnnotateFormSchemaType, "scoreData">;
  remove: UseFieldArrayRemove;
}) {
  const seenConfigs = new Set<string>();
  const selectionOptions = preferredAnnotationTargets(targets)
    .flatMap((target) =>
      target.configControl.allowManualSelection
        ? target.configControl.configs.map((config) => ({
            value: config.id,
            label: resolveConfigValue(config),
            targetKey: target.key,
            targetLabel: target.label,
            disabled: config.isArchived,
            config,
          }))
        : [],
    )
    .filter((option) => {
      if (seenConfigs.has(option.value)) return false;
      seenConfigs.add(option.value);
      return true;
    })
    .sort((a, b) => a.config.name.localeCompare(b.config.name));

  const addScore = (configId: string) => {
    const option = selectionOptions.find((option) => option.value === configId);
    if (
      !option ||
      option.disabled ||
      controlledFields.some((field) => field.configId === configId)
    )
      return;
    const field = {
      targetKey: option.targetKey,
      id: null,
      configId: option.config.id,
      name: option.config.name,
      dataType: option.config.dataType,
      value: null,
      stringValue: null,
      comment: null,
    };
    const nextIndex = controlledFields.findIndex(
      (current) => current.name.localeCompare(field.name) > 0,
    );
    insert(nextIndex < 0 ? controlledFields.length : nextIndex, field);
    const target = targets.find((target) => target.key === option.targetKey)!;
    if (!target.configControl.selectedConfigIds.includes(configId))
      target.configControl.setSelectedConfigIds([
        ...target.configControl.selectedConfigIds,
        configId,
      ]);
  };

  const removeEmptyField = (key: string) => {
    const index = controlledFields.findIndex(
      (field) => annotationFieldKey(field) === key,
    );
    const field = controlledFields[index];
    if (
      !field ||
      field.id ||
      isPresent(field.value) ||
      field.stringValue ||
      field.comment
    )
      return;
    const owner = targets.find((target) => target.key === field.targetKey);
    const config = owner?.configControl.configs.find(
      (config) => config.id === field.configId,
    );
    if (
      !owner?.configControl.allowManualSelection ||
      !config ||
      config.isArchived
    )
      return;
    remove(index);
    const remainingFields = controlledFields.filter(
      (_, fieldIndex) => fieldIndex !== index,
    );
    for (const target of targets) {
      if (!target.configControl.allowManualSelection) continue;
      if (
        remainingFields.some(
          (remaining) =>
            remaining.configId === field.configId &&
            remaining.targetKey === target.key,
        )
      )
        continue;
      if (target.configControl.selectedConfigIds.includes(field.configId))
        target.configControl.setSelectedConfigIds(
          target.configControl.selectedConfigIds.filter(
            (id) => id !== field.configId,
          ),
        );
    }
  };

  return { selectionOptions, addScore, removeEmptyField };
}
