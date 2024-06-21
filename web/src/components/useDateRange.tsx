import { useState, useEffect } from "react";
import { addMinutes } from "date-fns";
import { DEFAULT_DATE_RANGE_SELECTION } from "@/src/components/date-picker";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";

export const tableDateRangeSelectionOptions = [
  "3 months",
  "1 month",
  "14 days",
  "7 days",
  "3 days",
  "1 day",
  "6 hours",
  "1 hour",
  "30 min",
] as const;

export type TableDateRangeSelectionOption =
  (typeof tableDateRangeSelectionOptions)[number];

export type TableDateTimeAggregationSettings = Record<
  TableDateRangeSelectionOption,
  {
    date_trunc: "year" | "month" | "week" | "day" | "hour" | "minute";
    date_formatter: (date: Date) => string;
    minutes: number;
  }
>;

export const tableDateTimeAggregationSettings: TableDateTimeAggregationSettings =
  {
    "3 months": {
      date_trunc: "day",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 3 * 30 * 24 * 60,
    },
    "1 month": {
      date_trunc: "day",
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
    "1 day": {
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
      date_trunc: "minute",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 60,
    },
    "30 min": {
      date_trunc: "minute",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 30,
    },
  };

export const findClosestIntervalToDate = (
  targetDate: Date,
): TableDateRangeSelectionOption | undefined => {
  // Get the current date
  const currentDate = new Date();

  // Calculate the duration from the current date to the target date
  const duration = Math.abs(currentDate.getTime() - targetDate.getTime());

  // Map intervals to their difference from the given duration
  const diffs = tableDateRangeSelectionOptions.map((interval) => {
    const { minutes } = tableDateTimeAggregationSettings[interval];
    return {
      interval: interval,
      diff: Math.abs(duration - minutes * 60 * 1000),
    };
  });

  // Sort by difference and pick the first one
  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
};

export type AvailableTableDateRangeSelections =
  | typeof DEFAULT_DATE_RANGE_SELECTION
  | typeof tableDateRangeSelectionOptions;

export function useDateRange(defaultDate?: Date) {
  const closestInterval = defaultDate
    ? findClosestIntervalToDate(defaultDate)
    : undefined;
  const defaultDateRange = closestInterval ?? DEFAULT_DATE_RANGE_SELECTION;
  const [selectedOption, setSelectedOption] =
    useState<AvailableTableDateRangeSelections>(defaultDateRange);
  const [dateRange, setDateRange] = useState<DashboardDateRange | null>(null);

  const setDateRangeAndOption = (
    option: AvailableTableDateRangeSelections,
    date?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(date ?? null);
  };

  useEffect(() => {
    if (
      selectedOption &&
      typeof selectedOption === "string" &&
      selectedOption in tableDateTimeAggregationSettings &&
      selectedOption !== "Date range"
    ) {
      const { minutes } =
        tableDateTimeAggregationSettings[
          selectedOption as keyof typeof tableDateTimeAggregationSettings
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
