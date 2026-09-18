import { useEmptyScoreConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
import { resolveConfigValue } from "@/src/features/scores/lib/annotationFormHelpers";
import {
  type AnnotateFormSchemaType,
  type AnnotationScoreSchemaType,
} from "@/src/features/scores/types";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { useCallback, useMemo } from "react";
import {
  type UseFieldArrayRemove,
  type UseFieldArrayInsert,
} from "react-hook-form";
import { toast } from "sonner";

const resolveAlphabeticalPosition = (
  name: string,
  controlledFields: AnnotationScoreSchemaType[],
) => {
  const alphabeticalIndex = controlledFields.findIndex(
    (f) => f.name.localeCompare(name) > 0,
  );
  // If no field comes after this one alphabetically (-1), insert at the end
  if (alphabeticalIndex === -1) return controlledFields.length;

  return alphabeticalIndex;
};

export function useScoreConfigSelection({
  configs,
  controlledFields,
  isInputDisabled,
  insert,
  remove,
  emptySelectedConfigIdsStorageKey,
}: {
  configs: ScoreConfigDomain[];
  controlledFields: AnnotationScoreSchemaType[];
  isInputDisabled: (config: ScoreConfigDomain) => boolean;
  insert: UseFieldArrayInsert<AnnotateFormSchemaType, "scoreData">;
  remove: UseFieldArrayRemove;
  emptySelectedConfigIdsStorageKey?: string;
}): {
  selectionOptions: {
    value: string;
    label: string;
    disabled: boolean;
  }[];
  handleSelectionChange: (values: string[]) => void;
} {
  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyScoreConfigs(emptySelectedConfigIdsStorageKey);

  const selectionOptions = useMemo(() => {
    return [...configs]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((config) => {
        return {
          value: config.id,
          label: resolveConfigValue({
            dataType: config.dataType,
            name: config.name,
          }),
          disabled: isInputDisabled(config),
        };
      });
  }, [configs, isInputDisabled]);

  const handleSelectionChange = useCallback(
    (values: string[]) => {
      const currentIds = controlledFields.flatMap((field) =>
        field.configId ? [field.configId] : [],
      );
      const changedValueId =
        values.find((id) => !currentIds.includes(id)) ??
        currentIds.find((id) => !values.includes(id));
      if (!changedValueId) return;

      const fieldIndex = controlledFields.findIndex(
        (f) => f.configId === changedValueId,
      );
      const isCurrentlyInForm = fieldIndex !== -1;

      if (!isCurrentlyInForm) {
        // Config was just selected -> add empty row to form
        const config = configs.find((c) => c.id === changedValueId);
        if (config) {
          // find correct alphabetical position to insert new field at
          const position = resolveAlphabeticalPosition(
            config.name,
            controlledFields,
          );

          insert(position, {
            id: null,
            configId: config.id,
            name: config.name,
            dataType: config.dataType,
            value: null,
            stringValue: null,
            comment: null,
          });
        }
        setEmptySelectedConfigIds?.([
          ...emptySelectedConfigIds,
          changedValueId,
        ]);
      } else {
        const deselectedFields = controlledFields.flatMap((field, index) =>
          !values.includes(field.configId) ? [{ field, index }] : [],
        );
        if (deselectedFields.some(({ field }) => field.id)) {
          toast.error("Cannot deselect a populated score");
        }
        const removableFields = deselectedFields.filter(({ field }) => {
          const config = configs.find((config) => config.id === field.configId);
          return !field.id && config && !isInputDisabled(config);
        });
        if (!removableFields.length) return;

        remove(removableFields.map(({ index }) => index));
        const removedConfigIds = new Set(
          removableFields.map(({ field }) => field.configId),
        );
        setEmptySelectedConfigIds?.(
          emptySelectedConfigIds.filter((id) => !removedConfigIds.has(id)),
        );
      }
    },
    [
      controlledFields,
      configs,
      insert,
      remove,
      emptySelectedConfigIds,
      setEmptySelectedConfigIds,
      isInputDisabled,
    ],
  );

  return {
    selectionOptions,
    handleSelectionChange,
  };
}
