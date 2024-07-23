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
  type TableDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";

export function useDateRange(defaultDate?: Date) {
  const [urlParams, setUrlParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
  });
  const closestInterval = defaultDate
    ? findClosestTableIntervalToDate(defaultDate)
    : undefined;
  let defaultDateRange = closestInterval ?? DEFAULT_AGGREGATION_SELECTION;
  if (urlParams.select !== "Select a date range") {
    defaultDateRange = isValidOption(urlParams.select)
      ? (urlParams.select as TableDateRangeAggregationOption)
      : defaultDateRange;
  }
  const [selectedOption, setSelectedOption] =
    useState<DateRangeOptions>(defaultDateRange);
  const [dateRange, setDateRange] = useState<DashboardDateRange | null>(null);
  const setDateRangeAndOption = (
    option: DateRangeOptions,
    date?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(date ?? null);
    setUrlParams({
      select: option,
    });
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
