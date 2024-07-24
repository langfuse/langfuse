import { useState, useEffect } from "react";
import { addMinutes } from "date-fns";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  DEFAULT_AGGREGATION_SELECTION,
  type DateRangeOptions,
  findClosestTableIntervalToDate,
  tableDateRangeAggregationSettings,
  isValidOption,
  type DateRangeAggregationOption,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  findClosestDashboardIntervalToDate,
} from "@/src/utils/date-range-utils";

export function useDateRange(type: "dashboard" | "table", initialDate?: Date) {
  const [urlParams, setUrlParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
    from: StringParam,
    to: StringParam,
  });

  const closestInterval =
    type === "table"
      ? initialDate
        ? findClosestTableIntervalToDate(initialDate)
        : undefined
      : initialDate
        ? findClosestDashboardIntervalToDate(initialDate)
        : undefined;

  const initialDateRange =
    closestInterval ??
    (type === "table"
      ? DEFAULT_AGGREGATION_SELECTION
      : DASHBOARD_AGGREGATION_PLACEHOLDER);

  const initial: DashboardDateRange | undefined =
    urlParams.select !== "Select a date range" && urlParams.to && urlParams.from
      ? {
          from: new Date(urlParams.from),
          to: new Date(urlParams.to),
        }
      : undefined;

  const selectedDateRangeOption = isValidOption(urlParams.select)
    ? (urlParams.select as DateRangeAggregationOption)
    : initialDateRange;

  const [selectedOption, setSelectedOption] = useState<DateRangeOptions>(
    selectedDateRangeOption,
  );
  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>(
    initial,
  );

  const setDateRangeAndOption = (
    option: DateRangeOptions,
    date?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(date);

    const newParams: any = { select: option };
    if (option === "Date range" && date) {
      newParams.from = date.from;
      newParams.to = date.to;
    }
    setUrlParams(newParams);
  };

  useEffect(() => {
    if (selectedOption && selectedOption in tableDateRangeAggregationSettings) {
      const { minutes } =
        tableDateRangeAggregationSettings[
          selectedOption as keyof typeof tableDateRangeAggregationSettings
        ];
      const fromDate = addMinutes(new Date(), -minutes);
      setDateRange({
        from: fromDate,
        to: new Date(),
      });
    }
  }, [selectedOption, setUrlParams, urlParams]);

  return { selectedOption, dateRange, setDateRangeAndOption };
}
