import type { FilterState } from "@langfuse/shared";

const DATASET_NAME_COLUMN = "experimentDatasetName";
const DATASET_ID_COLUMN = "experimentDatasetId";

/**
 * Swaps `experimentDatasetName` filters for the equivalent
 * `experimentDatasetId` filters on the way to the query.
 *
 * The dataset name is not a ClickHouse column — it lives in Postgres and
 * reaches the client with the filter options. Keeping the NAME as the filter
 * value is what makes a URL or saved view readable and lets the sidebar and the
 * search bar show the same string; this is the one boundary where it becomes an
 * id again. Names are unique per project, so the mapping is lossless.
 *
 * A name with no known id maps to no id rather than being dropped: an unknown
 * dataset must return nothing, not everything.
 */
export function withDatasetNamesResolved(
  filters: FilterState,
  datasetIdByName: ReadonlyMap<string, string>,
): FilterState {
  if (!filters.some((filter) => filter.column === DATASET_NAME_COLUMN)) {
    return filters;
  }
  return filters.map((filter) => {
    if (filter.column !== DATASET_NAME_COLUMN) return filter;
    if (filter.type !== "stringOptions") return filter;
    return {
      ...filter,
      column: DATASET_ID_COLUMN,
      value: filter.value.map((name) => datasetIdByName.get(name) ?? name),
    };
  });
}
