import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
  isValidDashboardDateRangeAggregationOption,
  type DashboardDateRangeOptions,
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

export function useDashboardDateRange(): UseDashboardDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
    from: StringParam,
    to: StringParam,
  });

  const initialRangeOption = "24 hours";

  const initialRange: DashboardDateRange | undefined =
    queryParams.select !== "Select a date range" &&
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
    isValidDashboardDateRangeAggregationOption(queryParams.select) ||
    queryParams.select === "Date range"
      ? (queryParams.select as DashboardDateRangeAggregationOption)
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
      select: option,
      from: undefined,
      to: undefined,
    };
    if (option === "Date range" && range) {
      newParams.from = range.from.toISOString();
      newParams.to = range.to.toISOString();
    }
    setQueryParams(newParams);
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
