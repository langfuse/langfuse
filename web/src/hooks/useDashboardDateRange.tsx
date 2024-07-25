import { useEffect, useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  findClosestDashboardIntervalToDate,
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
  isValidDashboardDateRangeAggregationOption,
  type DashboardDateRangeOptions,
} from "@/src/utils/date-range-utils";
import { addMinutes } from "date-fns";

export function useDashboardDateRange(initialDate?: Date) {
  const [queryParams, setQueryParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
    from: StringParam,
    to: StringParam,
  });

  const closestInterval = initialDate
    ? findClosestDashboardIntervalToDate(initialDate)
    : "24 hours";

  const initialRangeOption =
    closestInterval ?? DASHBOARD_AGGREGATION_PLACEHOLDER;

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
  useEffect(() => {
    if (selectedOption in dashboardDateRangeAggregationSettings) {
      const { minutes } =
        dashboardDateRangeAggregationSettings[
          selectedOption as keyof typeof dashboardDateRangeAggregationSettings
        ];
      const fromDate = addMinutes(new Date(), -minutes);
      setDateRange({ from: fromDate, to: new Date() });
    }
  }, [selectedOption]);

  return { selectedOption, dateRange, setDateRangeAndOption };
}
