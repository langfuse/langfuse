import { type FilterState } from "@langfuse/shared";
import { partitionStoredUiTableFiltersToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

/**
 * Whether every active scores-table filter can be forwarded to the strip's
 * queries. Checked against `scores-numeric` and `scores-categorical`'s
 * mapping tables (not the internal `scores-listable-count` view, which isn't
 * registered there, but shares their common dimension set). A filter with no
 * dimension on either (e.g. the numeric "Value" range) disables the strip
 * instead of showing a partial distribution.
 */
export const canApplyScoreOutlierStripFilters = (
  filterState: FilterState,
): boolean => {
  if (filterState.some((filter) => filter.type === "null")) return false;
  return (["scores-numeric", "scores-categorical"] as const).every(
    (view) =>
      partitionStoredUiTableFiltersToView(view, filterState).unsupportedFilters
        .length === 0,
  );
};
