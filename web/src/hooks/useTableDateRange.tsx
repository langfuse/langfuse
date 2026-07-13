import {
  type TableDateRangeAggregationOption,
  TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";
import {
  useGlobalDateRange,
  type UseGlobalDateRangeOutput,
} from "@/src/features/global-time-range/useGlobalDateRange";

export type UseTableDateRangeOutput = UseGlobalDateRangeOutput;

export function useTableDateRange(
  // Kept for call-site compatibility; the storage key is derived from the
  // active project route inside useGlobalDateRange so dashboard and table views
  // share a single per-project key.
  _projectId: string,
  options: {
    defaultRelativeAggregation?: TableDateRangeAggregationOption;
    persistAsDefault?: boolean;
  } = {},
): UseTableDateRangeOutput {
  return useGlobalDateRange({
    allowedRanges: TABLE_AGGREGATION_OPTIONS,
    fallback: options.defaultRelativeAggregation ?? "last1Day",
    persistAsDefault: options.persistAsDefault,
  });
}
