import type { FilterState } from "@langfuse/shared";

import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import {
  INTERNAL_EVALUATION_ENVIRONMENTS,
  INTERNAL_EVALUATION_ENVIRONMENT_FILTERS,
} from "@/src/features/evals/v2/constants/experimentAndEvalFilters";

export function buildSampleQueryFilters(
  visibleFilters: FilterState,
  additionalFilters: FilterState = [],
): FilterState {
  return [
    ...visibleFilters,
    ...INTERNAL_EVALUATION_ENVIRONMENT_FILTERS,
    ...additionalFilters,
  ];
}

export function removeInternalEvaluationEnvironmentOptions(
  observed: ObservedOptions | undefined,
): ObservedOptions | undefined {
  if (observed?.environment === undefined) return observed;

  const internalEnvironments = new Set<string>(
    INTERNAL_EVALUATION_ENVIRONMENTS,
  );
  return {
    ...observed,
    environment: observed.environment.filter(
      ({ value }) => !internalEnvironments.has(value),
    ),
  };
}
