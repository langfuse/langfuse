import { useMemo } from "react";
import { EXPERIMENT_ITEMS_FIELD_REGISTRY } from "@/src/features/experiments/constants/experimentItemsSearchRegistry";
import { experimentItemsFilterTargeting } from "@/src/features/experiments/lib/experimentItemsFilterTargeting";
import type { FieldRegistry } from "@/src/features/search-bar/lib/fields";

export function useExperimentItemsSearchRegistry({
  baselineId,
  selectedExperiments,
  colorExperimentIds,
}: {
  baselineId?: string;
  selectedExperiments: readonly {
    experimentId: string;
    experimentName: string;
  }[];
  colorExperimentIds: string[];
}): FieldRegistry {
  return useMemo(
    () => ({
      ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
      targeting: experimentItemsFilterTargeting({
        baselineId,
        experiments: selectedExperiments,
        colorExperimentIds,
      }),
    }),
    [baselineId, selectedExperiments, colorExperimentIds],
  );
}
