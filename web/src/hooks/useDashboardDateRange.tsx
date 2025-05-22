import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
  isValidDashboardDateRangeAggregationOption,
  type DashboardDateRangeOptions,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRange,
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

function isDashboardDateRangeAggregationOption(
  dateRange?: string | null,
): dateRange is DashboardDateRangeAggregationOption {
  return !!dateRange && dateRange in dashboardDateRangeAggregationSettings;
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

  const fallbackAggregation = options.defaultRelativeAggregation ?? "24 hours";
  const initialRangeOption: DashboardDateRangeAggregationOption =
    isDashboardDateRangeAggregationOption(queryParams.dateRange)
      ? queryParams.dateRange
      : fallbackAggregation;

  const initialRange: DashboardDateRange | undefined =
    queryParams.dateRange !== "Select a date range" &&
    queryParams.from &&
    queryParams.to
      ? {
          from: new Date(queryParams.from),
          to: new Date(queryParams.to),
        }
      : {
          from: addMinutes(
            new Date(),
            -dashboardDateRangeAggregationSettings[initialRangeOption].minutes,
          ),
          to: new Date(),
        };

  const validatedInitialRangeOption =
    isValidDashboardDateRangeAggregationOption(queryParams.dateRange) ||
    queryParams.dateRange === DASHBOARD_AGGREGATION_PLACEHOLDER
      ? (queryParams.dateRange as DashboardDateRangeAggregationOption)
      : initialRangeOption;

  const [selectedOption, setSelectedOption] =
    useState<DashboardDateRangeOptions>(validatedInitialRangeOption);
  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>(
    initialRange,
  );

  const setDateRangeAndOption = (
    option: DashboardDateRangeOptions,
    range?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(range);

    const newParams: typeof queryParams = {
      dateRange: option,
      from: undefined,
      to: undefined,
    };
    if (option === DASHBOARD_AGGREGATION_PLACEHOLDER && range) {
      newParams.from = range.from.toISOString();
      newParams.to = range.to.toISOString();
    }
    setQueryParams(newParams);
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
