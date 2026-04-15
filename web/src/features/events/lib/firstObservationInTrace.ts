import {
  FIRST_OBSERVATION_IN_TRACE_UNSUPPORTED_COLUMNS,
  type FilterState,
  isFirstObservationInTraceEnabled,
  removeFirstObservationInTraceFilter,
  type OrderByState,
  type TracingSearchType,
} from "@langfuse/shared";

export const FIRST_OBSERVATION_IN_TRACE_DISABLED_FILTER_REASON =
  "Disabled while 1st observation in trace is active to keep the query fast.";

export const FIRST_OBSERVATION_IN_TRACE_REQUIRES_TIME_RANGE_REASON =
  "1st observation in trace requires a selected time range.";

export function hasFirstObservationInTraceTimeFilter(
  filters: FilterState,
): boolean {
  return filters.some(
    (filter) =>
      (filter.column === "startTime" || filter.column === "Start Time") &&
      filter.type === "datetime" &&
      (filter.operator === ">=" || filter.operator === ">"),
  );
}

export function sanitizeFirstObservationInTraceFilters(
  filters: FilterState,
  {
    hasTimeRange,
  }: {
    hasTimeRange: boolean;
  },
): FilterState {
  if (!isFirstObservationInTraceEnabled(filters)) {
    return filters;
  }

  if (!hasTimeRange) {
    return removeFirstObservationInTraceFilter(filters);
  }

  return filters.filter(
    (filter) =>
      !FIRST_OBSERVATION_IN_TRACE_UNSUPPORTED_COLUMNS.has(filter.column),
  );
}

export function sanitizeFirstObservationInTraceSearchType(
  searchType: TracingSearchType[],
  enabled: boolean,
): TracingSearchType[] {
  if (!enabled || !searchType.includes("content")) {
    return searchType;
  }

  const filtered = searchType.filter((type) => type !== "content");
  return filtered.length > 0 ? filtered : ["id"];
}

export function sanitizeFirstObservationInTraceOrderBy(
  orderBy: OrderByState | null,
  enabled: boolean,
): OrderByState | null {
  if (
    !enabled ||
    !orderBy ||
    !FIRST_OBSERVATION_IN_TRACE_UNSUPPORTED_COLUMNS.has(orderBy.column)
  ) {
    return orderBy;
  }

  return {
    column: "startTime",
    order: "DESC",
  };
}
