import { useEmptyScoreConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
import { resolveConfigValue } from "@/src/features/scores/lib/annotationFormHelpers";
import {
  type AnnotateFormSchemaType,
  type AnnotationScoreSchemaType,
} from "@/src/features/scores/types";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { useCallback, useMemo } from "react";
import {
  type UseFieldArrayAppend,
  type UseFieldArrayRemove,
} from "react-hook-form";
import { toast } from "sonner";

export function useScoreConfigSelection({
  configs,
  controlledFields,
  isInputDisabled,
  append,
  remove,
}: {
  configs: ScoreConfigDomain[];
  controlledFields: AnnotationScoreSchemaType[];
  isInputDisabled: (config: ScoreConfigDomain) => boolean;
  append: UseFieldArrayAppend<AnnotateFormSchemaType, "scoreData">;
  remove: UseFieldArrayRemove;
}): {
  selectionOptions: {
    key: string;
    value: string;
    disabled: boolean;
  }[];
  handleSelectionChange: (
    values: Record<string, string>[],
    changedValueId?: string,
  ) => void;
} {
  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyScoreConfigs();

  const selectionOptions = useMemo(() => {
    return configs.map((config) => {
      return {
        key: config.id,
        value: resolveConfigValue({
          dataType: config.dataType,
          name: config.name,
        }),
        disabled: isInputDisabled(config),
      };
    });
  }, [configs, isInputDisabled]);

  const handleSelectionChange = useCallback(
    (values: Record<string, string>[], changedValueId?: string) => {
      if (!changedValueId) return;

      const fieldIndex = controlledFields.findIndex(
        (f) => f.configId === changedValueId,
      );
      const isCurrentlyInForm = fieldIndex !== -1;

      if (!isCurrentlyInForm) {
        // Config was just selected -> add empty row to form
        const config = configs.find((c) => c.id === changedValueId);
        if (config) {
          append({
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
        // Config was deselected
        const field = controlledFields[fieldIndex];
        if (field?.id) {
          toast.error("Cannot deselect a populated score");
          return;
        } else {
          // No score -> remove row from form and empty selected config ids
          remove(fieldIndex);
          setEmptySelectedConfigIds?.(
            emptySelectedConfigIds.filter((id) => id !== changedValueId),
          );
        }
      }
    },
    [
      controlledFields,
      configs,
      append,
      remove,
      emptySelectedConfigIds,
      setEmptySelectedConfigIds,
    ],
  );

  return {
    selectionOptions,
    handleSelectionChange,
  };
}
