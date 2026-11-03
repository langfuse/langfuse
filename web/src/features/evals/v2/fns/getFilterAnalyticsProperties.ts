import type { FilterState } from "@langfuse/shared";

const EXPERIMENT_FILTER_COLUMNS = new Set([
  "experimentId",
  "experimentName",
  "experimentDatasetId",
  "isExperimentItemRootSpan",
]);

export function getFilterAnalyticsProperties(filters: FilterState) {
  const filterColumns = [...new Set(filters.map(({ column }) => column))];

  return {
    filterCount: filters.length,
    filterColumns,
    usesExperimentFilter: filterColumns.some((column) =>
      EXPERIMENT_FILTER_COLUMNS.has(column),
    ),
  };
}
