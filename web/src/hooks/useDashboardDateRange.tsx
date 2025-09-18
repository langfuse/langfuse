import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
  isValidDashboardDateRangeAggregationOption,
  type DashboardDateRangeOptions,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRange,
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  getAbbreviatedTimeRange,
  getFullTimeRangeFromAbbreviated,
} from "@/src/utils/date-range-utils";
import { addMinutes } from "date-fns";

export interface UseDashboardDateRangeOutput {
  selectedOption: DashboardDateRangeOptions;
  dateRange: DashboardDateRange | undefined;
  setDateRangeAndOption: (
    option: DashboardDateRangeOptions,
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
    from: StringParam,
    to: StringParam,
  });

  const fallbackAggregation =
    options.defaultRelativeAggregation ??
    DEFAULT_DASHBOARD_AGGREGATION_SELECTION;

  // Validate the fallback aggregation in case it's using old format
  const validatedFallback = isValidDashboardDateRangeAggregationOption(
    fallbackAggregation,
  )
    ? fallbackAggregation
    : DEFAULT_DASHBOARD_AGGREGATION_SELECTION;

  // Try multiple formats for backward compatibility:
  // 1) Abbreviated URL value: "1d" -> "last1Day"
  // 2) Full option string
  const rangeFromAbbreviated = queryParams.dateRange
    ? getFullTimeRangeFromAbbreviated(queryParams.dateRange)
    : null;

  const validatedInitialRangeOption: DashboardDateRangeOptions =
    rangeFromAbbreviated &&
    isValidDashboardDateRangeAggregationOption(rangeFromAbbreviated)
      ? (rangeFromAbbreviated as DashboardDateRangeAggregationOption)
      : isValidDashboardDateRangeAggregationOption(queryParams.dateRange)
        ? (queryParams.dateRange as DashboardDateRangeAggregationOption)
        : queryParams.dateRange === DASHBOARD_AGGREGATION_PLACEHOLDER
          ? DASHBOARD_AGGREGATION_PLACEHOLDER
          : validatedFallback;

  const optionForRelative: DashboardDateRangeAggregationOption =
    isValidDashboardDateRangeAggregationOption(validatedInitialRangeOption)
      ? (validatedInitialRangeOption as DashboardDateRangeAggregationOption)
      : validatedFallback;

  const initialRange: DashboardDateRange | undefined =
    queryParams.dateRange === DASHBOARD_AGGREGATION_PLACEHOLDER &&
    queryParams.from &&
    queryParams.to
      ? {
          from: new Date(queryParams.from),
          to: new Date(queryParams.to),
        }
      : {
          from: addMinutes(
            new Date(),
            -dashboardDateRangeAggregationSettings[optionForRelative].minutes!,
          ),
          to: new Date(),
        };
  const [selectedOptionState, setSelectedOptionState] =
    useState<DashboardDateRangeOptions>(validatedInitialRangeOption);
  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>(
    initialRange,
  );

  const setDateRangeAndOption = (
    option: DashboardDateRangeOptions,
    range?: DashboardDateRange,
  ) => {
    setSelectedOptionState(option);
    setDateRange(range);

    const isCustom = option === DASHBOARD_AGGREGATION_PLACEHOLDER;
    const newParams: typeof queryParams = {
      dateRange: isCustom
        ? DASHBOARD_AGGREGATION_PLACEHOLDER
        : getAbbreviatedTimeRange(option as string),
      from: undefined,
      to: undefined,
    };
    if (isCustom && range) {
      newParams.from = range.from.toISOString();
      newParams.to = range.to.toISOString();
    }
    setQueryParams(newParams);
  };

  return {
    selectedOption: selectedOptionState,
    dateRange,
    setDateRangeAndOption,
  };
}
