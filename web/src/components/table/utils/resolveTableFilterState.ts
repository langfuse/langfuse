import { type FilterState } from "@langfuse/shared";

/**
 * Resolves the effective filter state for tables that can be controlled
 * externally (e.g. the eval preview tables pass `externalFilterState` plus
 * `externalDateRange`). External filters replace the user-managed table
 * filters, but the active date-range filter must still apply: dropping it
 * makes the backend query unbounded over the project's full history, which
 * can exhaust ClickHouse memory (MEMORY_LIMIT_EXCEEDED in
 * MergingSortedTransform) on large projects.
 */
export function resolveTableFilterState({
  externalFilterState,
  dateRangeFilter,
  combinedFilterState,
}: {
  externalFilterState?: FilterState;
  dateRangeFilter: FilterState;
  combinedFilterState: FilterState;
}): FilterState {
  return externalFilterState
    ? externalFilterState.concat(dateRangeFilter)
    : combinedFilterState;
}
