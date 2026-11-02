import { type FilterState } from "@langfuse/shared";
import { chartConditionExclusionReason } from "@/src/features/chart-view/lib/chartFilterCompatibility";

export const canApplyOutlierStripFilters = (
  filterState: FilterState,
  hasSearchQuery: boolean,
) => {
  if (hasSearchQuery) return false;

  return filterState.every((filter) => {
    if (filter.type === "datetime" && filter.column === "startTime") {
      return true;
    }
    return chartConditionExclusionReason(filter) === null;
  });
};
