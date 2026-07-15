import { useMemo } from "react";

import { api } from "@/src/utils/api";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { type FilterState } from "@langfuse/shared";

/**
 * startTime bounds for the view's absolute time range, as filter conditions.
 * Needed because EventsTable ignores its date-range prop for the rows query
 * when an external filter state is set — the bound must live in the filter.
 */
export function scopeTimeRangeFilter(
  range: AbsoluteTimeRange | null | undefined,
): FilterState {
  if (!range) return [];
  return [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: range.from,
    },
    {
      column: "startTime",
      type: "datetime",
      operator: "<=",
      value: range.to,
    },
  ];
}

/**
 * Rough count of observations matching the scope filter within the view's
 * time range. Queried standalone (not derived from the scope preview table)
 * so the count keeps working if that table goes away.
 */
export function useScopeMatchCount({
  projectId,
  filterState,
  timeRange,
  enabled = true,
}: {
  projectId: string;
  filterState: FilterState;
  /** Absolute range from the global time filter; null = unbounded. */
  timeRange: AbsoluteTimeRange | null;
  enabled?: boolean;
}) {
  const filter = useMemo<FilterState>(
    () => [...filterState, ...scopeTimeRangeFilter(timeRange)],
    [filterState, timeRange],
  );

  const countQuery = api.events.countAll.useQuery(
    {
      projectId,
      filter,
      searchQuery: null,
      searchType: [],
      orderBy: null,
    },
    { enabled, refetchOnWindowFocus: false },
  );

  return {
    count: countQuery.data?.totalCount ?? null,
    isLoading: countQuery.isLoading,
  };
}
