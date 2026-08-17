import { type FilterState } from "@langfuse/shared";
import { partitionStoredUiTableFiltersToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

/**
 * Both small filter-compatibility guards the outlier strip uses before
 * running its two aggregate queries — grouped in one module since they're
 * only ever called together, right before the strip decides which queries
 * to run (`ScoresOutlierStrip`).
 */

/**
 * Whether every active scores-table filter can be forwarded to the
 * numeric and string-score views the outlier strip queries. Mirrors the observations
 * strip's `canApplyOutlierStripFilters`, but reuses the existing
 * `partitionStoredUiTableFiltersToView` mapping (the same one
 * `mapLegacyUiTableFilterToView` — used by `ScoresChartView` — is built on)
 * instead of a bespoke exclusion list: a filter with no `scores-numeric`
 * dimension (e.g. the numeric "Value" range, which is a measure, not a
 * dimension) makes the strip's aggregate query unable to represent the
 * table's full filtered state, so the strip is disabled rather than showing
 * a partial distribution.
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

const STRING_SCORE_TYPES = new Set(["CATEGORICAL", "TEXT"]);

/**
 * Avoid the second aggregate query when positive Data Type filters prove that
 * categorical and text scores cannot contribute to the strip.
 */
export const shouldQueryStringScores = (filterState: FilterState): boolean =>
  !filterState.some((filter) => {
    if (filter.column !== "dataType") return false;

    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const selectedTypes = values.filter(
      (value): value is string => typeof value === "string",
    );

    return (
      (filter.operator === "=" || filter.operator === "any of") &&
      selectedTypes.length > 0 &&
      selectedTypes.every((type) => !STRING_SCORE_TYPES.has(type))
    );
  });
