import { useMemo } from "react";
import { EXPERIMENT_ITEMS_FIELD_REGISTRY } from "@/src/features/experiments/constants/experimentItemsSearchRegistry";
import { experimentItemsFilterTargeting } from "@/src/features/experiments/lib/experimentItemsFilterTargeting";
import type { FieldRegistry } from "@/src/features/search-bar/lib/fields";
import { type ExperimentItemScoreFilterOptions } from "../types/charts";
import {
  scoreTypeContextFromObserved,
  toObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";

export function useExperimentItemsSearchRegistry({
  baselineId,
  selectedExperiments,
  colorExperimentIds,
  optionsByTarget,
}: {
  baselineId?: string;
  selectedExperiments: readonly {
    experimentId: string;
    experimentName: string;
    datasetName?: string | null;
  }[];
  colorExperimentIds: string[];
  optionsByTarget: Readonly<
    Record<string, ExperimentItemScoreFilterOptions | undefined>
  >;
}): FieldRegistry {
  const observedByTarget = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(optionsByTarget).map(([target, options]) => [
          target,
          toObservedOptions(options, options === undefined),
        ]),
      ),
    [optionsByTarget],
  );
  return useMemo(
    () => ({
      ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
      targeting: experimentItemsFilterTargeting({
        baselineId,
        experiments: selectedExperiments,
        colorExperimentIds,
        observedForTarget: (targetId) => observedByTarget[targetId],
        scoreTypesForTarget: (targetId) => {
          const observed = observedByTarget[targetId];
          return observed ? scoreTypeContextFromObserved(observed) : undefined;
        },
      }),
    }),
    [baselineId, selectedExperiments, colorExperimentIds, observedByTarget],
  );
}
