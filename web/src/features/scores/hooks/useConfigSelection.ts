import { useCallback, useMemo } from "react";
import {
  type FieldArrayWithId,
  type UseFieldArrayRemove,
} from "react-hook-form";
import { type ScoreConfigDomain } from "@langfuse/shared";
import {
  type OptimisticScore,
  type AnnotateFormSchemaType,
} from "@/src/features/scores/types";
import { resolveConfigValue } from "@/src/features/scores/lib/annotationFormHelpers";

type UseConfigSelectionProps = {
  fields: FieldArrayWithId<AnnotateFormSchemaType, "scoreData", "id">[];
  remove: UseFieldArrayRemove;
  replace: (data: any[]) => void;
  configs: ScoreConfigDomain[];
  setOptimisticScore: (optimisticScore: OptimisticScore) => void;
  emptySelectedConfigIds: string[];
  isConfigDisabled: (config: ScoreConfigDomain) => boolean;
  setEmptySelectedConfigIds?: (ids: string[]) => void;
};

export function useConfigSelection({
  fields,
  remove,
  replace,
  configs,
  emptySelectedConfigIds,
  setEmptySelectedConfigIds,
  isConfigDisabled,
  setOptimisticScore,
}: UseConfigSelectionProps) {
  const handleConfigSelectionChange = useCallback(
    (values: Record<string, string>[], changedValueId?: string) => {
      if (values.length === 0) {
        const populatedScoreFields = fields.filter(({ scoreId }) => !!scoreId);
        replace(populatedScoreFields);
        setEmptySelectedConfigIds?.(
          populatedScoreFields
            .filter(({ configId }) => !!configId)
            .map(({ configId }) => configId as string),
        );
        return;
      }
      if (!changedValueId) return;

      const configToChange = configs.find(({ id }) => id === changedValueId);
      if (!configToChange) return;
      const { id, name, dataType } = configToChange;

      const index = fields.findIndex(({ configId }) => configId === id);

      if (index === -1) {
        setOptimisticScore({
          index: fields.length,
          value: null,
          stringValue: null,
          scoreId: null,
          name,
          dataType,
          configId: id,
        });
        replace([
          ...fields,
          {
            name,
            dataType,
            configId: id,
          },
        ]);
        setEmptySelectedConfigIds?.([
          ...emptySelectedConfigIds,
          changedValueId,
        ]);
      } else {
        remove(index);
        setEmptySelectedConfigIds?.(
          emptySelectedConfigIds.filter((id) => id !== changedValueId),
        );
      }
    },
    [
      fields,
      remove,
      replace,
      configs,
      emptySelectedConfigIds,
      setEmptySelectedConfigIds,
      setOptimisticScore,
    ],
  );

  const selectionOptions = useMemo(
    () =>
      configs
        .filter(
          (config) =>
            !config.isArchived ||
            fields.find((field) => field.configId === config.id),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((config) => ({
          key: config.id,
          value: resolveConfigValue({
            dataType: config.dataType,
            name: config.name,
          }),
          disabled: isConfigDisabled(config),
          isArchived: config.isArchived,
        })),
    [configs, fields, isConfigDisabled],
  );

  return {
    selectionOptions,
    handleConfigSelectionChange,
  };
}
