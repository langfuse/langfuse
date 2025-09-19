import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  type DashboardDateRangeAggregationOption,
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  DASHBOARD_AGGREGATION_OPTIONS,
  rangeToString,
  rangeFromString,
  getAbbreviatedTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { useMemo } from "react";

export interface UseDashboardDateRangeOutput {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
}

export function useDashboardDateRange(
  options: {
    defaultRelativeAggregation?: DashboardDateRangeAggregationOption;
  } = {},
): UseDashboardDateRangeOutput {
  const fallbackAggregation =
    options.defaultRelativeAggregation ??
    DEFAULT_DASHBOARD_AGGREGATION_SELECTION;

  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: withDefault(
      StringParam,
      getAbbreviatedTimeRange(fallbackAggregation),
    ),
  });

  return useMemo(() => {
    const timeRange = rangeFromString(
      queryParams.dateRange,
      DASHBOARD_AGGREGATION_OPTIONS,
      fallbackAggregation,
    );

    const setTimeRange = (timeRange: TimeRange) => {
      setQueryParams({ dateRange: rangeToString(timeRange) });
    };

    return {
      timeRange,
      setTimeRange,
    };
  }, [queryParams.dateRange, fallbackAggregation, setQueryParams]);
}
