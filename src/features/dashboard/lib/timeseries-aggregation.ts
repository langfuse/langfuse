import { type DateRange } from "react-day-picker";

export const dateTimeAggregationOptions = [
  "1 year",
  "3 months",
  "1 month",
  "7 days",
  "24 hours",
  "1 hour",
  "30 minutes",
] as const;

export type DateTimeAggregationOption =
  (typeof dateTimeAggregationOptions)[number];

export const dateTimeAggregationSettings: Record<
  DateTimeAggregationOption,
  {
    date_trunc: "year" | "month" | "week" | "day" | "hour" | "minute";
    date_formatter: (date: Date) => string;
    minutes: number;
  }
> = {
  "1 year": {
    date_trunc: "month",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { year: "2-digit", month: "short" }),
    minutes: 365 * 24 * 60,
  },
  "3 months": {
    date_trunc: "day",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    minutes: 3 * 30 * 24 * 60,
  },
  "1 month": {
    date_trunc: "day",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    minutes: 30 * 24 * 60,
  },
  "7 days": {
    date_trunc: "day",
    date_formatter: (date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    minutes: 7 * 24 * 60,
  },
  "24 hours": {
    date_trunc: "hour",
    date_formatter: (date) =>
      date.toLocaleTimeString("en-US", { hour: "numeric" }),
    minutes: 24 * 60,
  },
  "1 hour": {
    date_trunc: "minute",
    date_formatter: (date) =>
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" }),
    minutes: 60,
  },
  "30 minutes": {
    date_trunc: "minute",
    date_formatter: (date) =>
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" }),
    minutes: 30,
  },
};

export const findClosestInterval = (
  dateRange: DateRange,
): DateTimeAggregationOption | undefined => {
  // Check for valid date range
  if (!dateRange.from || !dateRange.to) return undefined;

  const duration = dateRange.to.getTime() - dateRange.from.getTime();

  // Map intervals to their difference from the given duration
  const diffs = dateTimeAggregationOptions.map((interval) => {
    const { minutes } = dateTimeAggregationSettings[interval];
    return {
      interval: interval,
      diff: Math.abs(duration - minutes * 60 * 1000),
    };
  });

  // Sort by difference and pick the first one
  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
};
