// table.ts
import { useState, useEffect } from "react";
import { addMinutes } from "date-fns";

import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  type AllDateRangeAggregationOption,
  DEFAULT_AGGREGATION_SELECTION,
  findClosestTableIntervalToDate,
  tableDateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";

export function useDateRange(defaultDate?: Date) {
  const closestInterval = defaultDate
    ? findClosestTableIntervalToDate(defaultDate)
    : undefined;
  const defaultDateRange = closestInterval ?? DEFAULT_AGGREGATION_SELECTION;
  const [selectedOption, setSelectedOption] =
    useState<AllDateRangeAggregationOption>(defaultDateRange);
  const [dateRange, setDateRange] = useState<DashboardDateRange | null>(null);

  const setDateRangeAndOption = (
    option: AllDateRangeAggregationOption,
    date?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(date ?? null);
  };

  useEffect(() => {
    if (
      selectedOption &&
      typeof selectedOption === "string" &&
      selectedOption in tableDateRangeAggregationSettings &&
      selectedOption !== "All time"
    ) {
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
  }, [selectedOption]);

  return { selectedOption, dateRange, setDateRangeAndOption };
}
