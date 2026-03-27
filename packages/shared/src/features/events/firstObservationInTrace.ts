import type { FilterCondition } from "../../types";

export const FIRST_OBSERVATION_IN_TRACE_FILTER_COLUMN =
  "firstObservationInTrace";

export const FIRST_OBSERVATION_IN_TRACE_UNSUPPORTED_COLUMNS = new Set([
  "input",
  "output",
  "metadata",
  "scores",
  "scores_avg",
  "score_categories",
  "trace_scores_avg",
  "trace_score_categories",
  "commentCount",
  "commentContent",
]);

export const isFirstObservationInTraceFilter = (
  filter: FilterCondition | undefined | null,
): filter is Extract<FilterCondition, { type: "boolean" }> =>
  Boolean(
    filter &&
    filter.type === "boolean" &&
    filter.column === FIRST_OBSERVATION_IN_TRACE_FILTER_COLUMN,
  );

export const isFirstObservationInTraceEnabled = (
  filters: FilterCondition[] | undefined | null,
): boolean =>
  Boolean(
    filters?.some(
      (filter) =>
        isFirstObservationInTraceFilter(filter) &&
        ((filter.operator === "=" && filter.value === true) ||
          (filter.operator === "<>" && filter.value === false)),
    ),
  );

export const removeFirstObservationInTraceFilter = (
  filters: FilterCondition[],
): FilterCondition[] =>
  filters.filter((filter) => !isFirstObservationInTraceFilter(filter));

export const getIncompatibleFirstObservationInTraceFilters = (
  filters: FilterCondition[],
): FilterCondition[] =>
  filters.filter((filter) => {
    if (isFirstObservationInTraceFilter(filter)) {
      return false;
    }

    return FIRST_OBSERVATION_IN_TRACE_UNSUPPORTED_COLUMNS.has(filter.column);
  });
