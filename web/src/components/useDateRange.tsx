// table.ts
import { useState, useEffect } from "react";
import { addMinutes } from "date-fns";

import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  type DateRangeAggregationSettings,
  type TableDateRangeAggregationOption,
  type AllDateRangeAggregationOption,
  findClosestInterval,
  DEFAULT_DATE_RANGE_SELECTION,
  tableDateRangeAggregationOptions,
} from "@/src/utils/date-range-utils";

export const tableDateRangeAggregationSettings: DateRangeAggregationSettings<TableDateRangeAggregationOption> =
  {
    "3 months": {
      date_trunc: "month",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 3 * 30 * 24 * 60,
    },
    "1 month": {
      date_trunc: "month",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 30 * 24 * 60,
    },
    "14 days": {
      date_trunc: "day",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 14 * 24 * 60,
    },
    "7 days": {
      date_trunc: "day",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 7 * 24 * 60,
    },
    "3 days": {
      date_trunc: "day",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 3 * 24 * 60,
    },
    "24 hours": {
      date_trunc: "hour",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", { hour: "numeric" }),
      minutes: 24 * 60,
    },
    "6 hours": {
      date_trunc: "hour",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", { hour: "numeric" }),
      minutes: 6 * 60,
    },
    "1 hour": {
      date_trunc: "hour",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 60,
    },
    "30 minutes": {
      date_trunc: "minute",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 30,
    },
  };

export const findClosestTableIntervalToDate = (
  targetDate: Date,
): TableDateRangeAggregationOption | undefined => {
  const currentDate = new Date();
  const duration = Math.abs(currentDate.getTime() - targetDate.getTime());
  return findClosestInterval(
    tableDateRangeAggregationOptions,
    tableDateRangeAggregationSettings,
    duration,
  );
};

export function useDateRange(defaultDate?: Date) {
  const closestInterval = defaultDate
    ? findClosestTableIntervalToDate(defaultDate)
    : undefined;
  const defaultDateRange = closestInterval ?? DEFAULT_DATE_RANGE_SELECTION;
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
      selectedOption !== "Date range"
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
