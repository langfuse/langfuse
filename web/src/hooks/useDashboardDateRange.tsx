import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
  type DashboardDateRange,
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  DASHBOARD_AGGREGATION_OPTIONS,
  rangeToString,
  rangeFromString,
} from "@/src/utils/date-range-utils";
import { addMinutes } from "date-fns";

export interface UseDashboardDateRangeOutput {
  selectedOption: DashboardDateRangeAggregationOption | null;
  dateRange: DashboardDateRange | undefined;
  setDateRangeAndOption: (
    option: DashboardDateRangeAggregationOption | null,
    range?: DashboardDateRange,
  ) => void;
}

export function useDashboardDateRange(
  options: {
    defaultRelativeAggregation?: DashboardDateRangeAggregationOption;
  } = {},
): UseDashboardDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: withDefault(StringParam, "Select a date range"),
  });

  const fallbackAggregation =
    options.defaultRelativeAggregation ??
    DEFAULT_DASHBOARD_AGGREGATION_SELECTION;

  // Use the new utility function to parse the date range
  const parsedRange = queryParams.dateRange
    ? rangeFromString(
        queryParams.dateRange,
        DASHBOARD_AGGREGATION_OPTIONS,
        fallbackAggregation,
      )
    : { range: fallbackAggregation };

  const validatedInitialRangeOption: DashboardDateRangeAggregationOption | null =
    "range" in parsedRange ? parsedRange.range : null;

  const optionForRelative: DashboardDateRangeAggregationOption =
    validatedInitialRangeOption ?? fallbackAggregation;

  const initialRange: DashboardDateRange | undefined =
    "from" in parsedRange
      ? parsedRange
      : (() => {
          const setting =
            dashboardDateRangeAggregationSettings[optionForRelative];
          const minutes = setting?.minutes;
          if (!minutes) {
            // Fallback for settings without minutes (like "allTime") or missing settings
            return {
              from: addMinutes(new Date(), -7 * 24 * 60), // Default to 7 days
              to: new Date(),
            };
          }
          return {
            from: addMinutes(new Date(), -minutes),
            to: new Date(),
          };
        })();
  const [selectedOptionState, setSelectedOptionState] =
    useState<DashboardDateRangeAggregationOption | null>(
      validatedInitialRangeOption,
    );
  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>(
    initialRange,
  );

  const setDateRangeAndOption = (
    option: DashboardDateRangeAggregationOption | null,
    range?: DashboardDateRange,
  ) => {
    setSelectedOptionState(option);
    setDateRange(range);

    const rangeToSerialize =
      option === null && range
        ? { from: range.from, to: range.to }
        : option
          ? { range: option }
          : { range: "last1Day" as const }; // fallback

    setQueryParams({ dateRange: rangeToString(rangeToSerialize) });
  };

  return {
    selectedOption: selectedOptionState,
    dateRange,
    setDateRangeAndOption,
  };
}
