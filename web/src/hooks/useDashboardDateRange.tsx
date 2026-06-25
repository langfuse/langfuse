import {
  type DashboardDateRangeAggregationOption,
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  DASHBOARD_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";
import {
  useGlobalDateRange,
  type UseGlobalDateRangeOutput,
} from "@/src/features/global-time-range/useGlobalDateRange";

export type UseDashboardDateRangeOutput = UseGlobalDateRangeOutput;

export function useDashboardDateRange(
  options: {
    defaultRelativeAggregation?: DashboardDateRangeAggregationOption;
  } = {},
): UseDashboardDateRangeOutput {
  return useGlobalDateRange({
    allowedRanges: DASHBOARD_AGGREGATION_OPTIONS,
    fallback:
      options.defaultRelativeAggregation ??
      DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  });
}
