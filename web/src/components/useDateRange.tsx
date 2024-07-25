import { useState, useEffect } from "react";
import { addMinutes } from "date-fns";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  DEFAULT_AGGREGATION_SELECTION,
  type DateRangeOptions,
  findClosestTableIntervalToDate,
  tableDateRangeAggregationSettings,
  isValidDateRangeAggregationOption,
  type DateRangeAggregationOption,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  findClosestDashboardIntervalToDate,
} from "@/src/utils/date-range-utils";

export function useDateRange(type: "dashboard" | "table", initialDate?: Date) {
  const [queryParams, setQueryParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
    from: StringParam,
    to: StringParam,
  });

  const closestInterval = initialDate
    ? type === "table"
      ? findClosestTableIntervalToDate(initialDate)
      : findClosestDashboardIntervalToDate(initialDate)
    : undefined;

  const initialRangeOption =
    closestInterval ??
    (type === "table"
      ? DEFAULT_AGGREGATION_SELECTION
      : DASHBOARD_AGGREGATION_PLACEHOLDER);

  const initialRange: DashboardDateRange | undefined =
    queryParams.select !== "Select a date range" &&
    queryParams.from &&
    queryParams.to
      ? {
          from: new Date(queryParams.from),
          to: new Date(queryParams.to),
        }
      : undefined;

  const validatedInitialRangeOption =
    isValidDateRangeAggregationOption(queryParams.select) ||
    queryParams.select === "Date range"
      ? (queryParams.select as DateRangeAggregationOption)
      : initialRangeOption;

  const [selectedOption, setSelectedOption] = useState<DateRangeOptions>(
    validatedInitialRangeOption,
  );
  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>(
    initialRange,
  );

  const setDateRangeAndOption = (
    option: DateRangeOptions,
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

  useEffect(() => {
    if (selectedOption in tableDateRangeAggregationSettings) {
      const { minutes } =
        tableDateRangeAggregationSettings[
          selectedOption as keyof typeof tableDateRangeAggregationSettings
        ];
      const fromDate = addMinutes(new Date(), -minutes);
      setDateRange({ from: fromDate, to: new Date() });
    }
  }, [selectedOption]);

  return { selectedOption, dateRange, setDateRangeAndOption };
}
