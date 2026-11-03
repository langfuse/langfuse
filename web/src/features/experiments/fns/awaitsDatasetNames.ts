import type { FilterState } from "@langfuse/shared";

const DATASET_NAME_COLUMN = "experimentDatasetName";

/**
 * Whether a dataset-NAME filter still cannot be translated to an id, so the
 * query has to wait. Keyed on the names query having SETTLED, never on the
 * name -> id map being non-empty: a project with no datasets and a failed fetch
 * both settle with an empty map, and gating on the DATA would hold the table in
 * its loading skeleton forever. Once settled, an untranslatable name
 * legitimately matches no rows.
 */
export function awaitsDatasetNames(
  filters: FilterState,
  datasetNames: { isSuccess: boolean; isError: boolean },
): boolean {
  if (datasetNames.isSuccess || datasetNames.isError) return false;
  return filters.some((filter) => filter.column === DATASET_NAME_COLUMN);
}
