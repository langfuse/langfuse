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
    /**
     * Set false on authoring/preview surfaces (e.g. the widget editor) whose
     * picker is transient editor state — see {@link useGlobalDateRange}.
     */
    persistAsDefault?: boolean;
  } = {},
): UseDashboardDateRangeOutput {
  return useGlobalDateRange({
    allowedRanges: DASHBOARD_AGGREGATION_OPTIONS,
    fallback:
      options.defaultRelativeAggregation ??
      DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
    persistAsDefault: options.persistAsDefault,
  });
}
