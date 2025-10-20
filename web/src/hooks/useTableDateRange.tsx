import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  type TableDateRangeAggregationOption,
  TABLE_AGGREGATION_OPTIONS,
  rangeToString,
  rangeFromString,
  getAbbreviatedTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { useMemo } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";

export interface UseTableDateRangeOutput {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
}

export function useTableDateRange(
  projectId: string,
  options: {
    defaultRelativeAggregation?: TableDateRangeAggregationOption;
  } = {},
): UseTableDateRangeOutput {
  const fallbackAggregation = options.defaultRelativeAggregation ?? "last1Day";

  // Get stored preference from local storage
  const [storedDateRange, setStoredDateRange] = useSessionStorage(
    `tableDateRangeState-${projectId}`,
    getAbbreviatedTimeRange(fallbackAggregation),
  );

  // Use stored preference as default if no URL param is set
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: withDefault(StringParam, storedDateRange),
  });

  return useMemo(() => {
    const timeRange = rangeFromString(
      queryParams.dateRange,
      TABLE_AGGREGATION_OPTIONS,
      fallbackAggregation,
    );

    const setTimeRange = (timeRange: TimeRange) => {
      const newParam = rangeToString(timeRange);
      setQueryParams({ dateRange: newParam });
      // Also update local storage for future sessions
      setStoredDateRange(newParam);
    };

    return {
      timeRange,
      setTimeRange,
    };
  }, [
    queryParams.dateRange,
    fallbackAggregation,
    setQueryParams,
    setStoredDateRange,
  ]);
}
