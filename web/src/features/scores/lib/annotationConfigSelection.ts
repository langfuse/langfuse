import { resolveConfigValue } from "@/src/features/scores/lib/annotationFormHelpers";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreSchemaType,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";
import type { UseFieldArrayInsert, UseFieldArrayRemove } from "react-hook-form";
import { toast } from "sonner";

export const annotationFieldKey = (field: {
  targetKey?: string;
  configId: string;
}) => JSON.stringify([field.targetKey, field.configId]);

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
  const selectionOptions = targets
    .flatMap((target) =>
      target.configControl.allowManualSelection
        ? target.configControl.configs.map((config) => ({
            value: annotationFieldKey({
              targetKey: target.key,
              configId: config.id,
            }),
            label: resolveConfigValue(config),
            targetKey: target.key,
            targetLabel: target.label,
            disabled: config.isArchived,
            config,
          }))
        : [],
    )
    .sort((a, b) => a.config.name.localeCompare(b.config.name));

  const handleSelectionChange = (values: string[]) => {
    const currentKeys = new Set(controlledFields.map(annotationFieldKey));
    const newOptions = selectionOptions.filter(
      (option) =>
        values.includes(option.value) &&
        !currentKeys.has(option.value) &&
        !option.disabled,
    );
    const deselectedFields = controlledFields.flatMap((field, index) =>
      !values.includes(annotationFieldKey(field)) ? [{ field, index }] : [],
    );
    if (deselectedFields.some(({ field }) => field.id)) {
      toast.error("Cannot deselect a populated score");
    }
    const removableFields = deselectedFields.filter(({ field }) => {
      const target = targets.find((target) => target.key === field.targetKey);
      const config = target?.configControl.configs.find(
        (config) => config.id === field.configId,
      );
      return (
        target?.configControl.allowManualSelection &&
        !field.id &&
        config &&
        !config.isArchived
      );
    });
    if (removableFields.length)
      remove(removableFields.map(({ index }) => index));

    const removedKeys = new Set(
      removableFields.map(({ field }) => annotationFieldKey(field)),
    );
    const remainingFields = controlledFields.filter(
      (field) => !removedKeys.has(annotationFieldKey(field)),
    );
    for (const option of newOptions) {
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
      const nextIndex = remainingFields.findIndex(
        (current) => current.name.localeCompare(field.name) > 0,
      );
      const position = nextIndex < 0 ? remainingFields.length : nextIndex;
      insert(position, field);
      remainingFields.splice(position, 0, field);
    }
    for (const target of targets) {
      if (!target.configControl.allowManualSelection) continue;
      const added = newOptions.filter(
        (option) => option.targetKey === target.key,
      );
      const removed = removableFields.filter(
        ({ field }) => field.targetKey === target.key,
      );
      if (!added.length && !removed.length) continue;
      const selected = new Set(target.configControl.selectedConfigIds);
      added.forEach((option) => selected.add(option.config.id));
      removed.forEach(({ field }) => selected.delete(field.configId));
      target.configControl.setSelectedConfigIds([...selected]);
    }
  };

  return { selectionOptions, handleSelectionChange };
}
