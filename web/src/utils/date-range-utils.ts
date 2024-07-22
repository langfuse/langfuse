import { type DateRange } from "react-day-picker";

export const DEFAULT_DASHBOARD_AGGREGATION_SELECTION = "24 hours" as const;
export const DASHBOARD_AGGREGATION_PLACEHOLDER = "Date range" as const;
export const DEFAULT_AGGREGATION_SELECTION = "All time" as const;

export const DASHBOARD_AGGREGATION_OPTIONS = [
  "1 year",
  "3 months",
  "1 month",
  "7 days",
  "24 hours",
  "3 hours",
  "1 hour",
  "30 minutes",
  "5 minutes",
] as const;

export const TABLE_AGGREGATION_OPTIONS = [
  "3 months",
  "1 month",
  "14 days",
  "7 days",
  "3 days",
  "24 hours",
  "6 hours",
  "1 hour",
  "30 minutes",
] as const;

export type DashboardDateRangeAggregationOption =
  (typeof DASHBOARD_AGGREGATION_OPTIONS)[number];

export type TableDateRangeAggregationOption =
  (typeof TABLE_AGGREGATION_OPTIONS)[number];

export type DateRangeAggregationOption =
  | DashboardDateRangeAggregationOption
  | TableDateRangeAggregationOption;

export type DateRangeOptions =
  | DashboardDateRangeAggregationOption
  | TableDateRangeAggregationOption
  | typeof DEFAULT_AGGREGATION_SELECTION
  | typeof DASHBOARD_AGGREGATION_PLACEHOLDER;

export type DateRangeAggregationSettings<T extends DateRangeAggregationOption> =
  Record<
    T,
    {
      date_trunc: "year" | "month" | "week" | "day" | "hour" | "minute";
      date_formatter: (date: Date) => string;
      minutes: number;
    }
  >;

export const dateTimeAggregationOptions = [
  ...TABLE_AGGREGATION_OPTIONS,
  ...DASHBOARD_AGGREGATION_OPTIONS,
  DEFAULT_AGGREGATION_SELECTION,
] as const;

export const dashboardDateRangeAggregationSettings: DateRangeAggregationSettings<DashboardDateRangeAggregationOption> =
  {
    "1 year": {
      date_trunc: "month",
      date_formatter: (date) =>
        date.toLocaleDateString("en-US", { year: "2-digit", month: "short" }),
      minutes: 365 * 24 * 60,
    },
    "3 months": {
      date_trunc: "month",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 3 * 28 * 24 * 60,
    },
    "1 month": {
      date_trunc: "month",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 28 * 24 * 60,
    },
    "7 days": {
      date_trunc: "day",
      date_formatter: (date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 7 * 24 * 60,
    },
    "24 hours": {
      date_trunc: "hour",
      date_formatter: (date: Date) =>
        date.toLocaleTimeString("en-US", { hour: "numeric" }),
      minutes: 24 * 60,
    },
    "3 hours": {
      date_trunc: "hour",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 3 * 60,
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
    "5 minutes": {
      date_trunc: "minute",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 5,
    },
  };

export const tableDateRangeAggregationSettings: DateRangeAggregationSettings<TableDateRangeAggregationOption> =
  {
    "3 months": {
      date_trunc: "month",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 3 * 28 * 24 * 60,
    },
    "1 month": {
      date_trunc: "month",
      date_formatter: (date: Date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 28 * 24 * 60,
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

export function isValidOption(
  value: unknown,
): value is DateRangeAggregationOption {
  return (
    typeof value === "string" &&
    dateTimeAggregationOptions.includes(value as DateRangeAggregationOption)
  );
}

export function findClosestInterval<T extends DateRangeAggregationOption>(
  options: readonly T[],
  settings: DateRangeAggregationSettings<T>,
  duration: number,
): T | undefined {
  const diffs = options.map((interval) => {
    const { minutes } = settings[interval];
    return {
      interval,
      diff: Math.abs(duration - minutes * 60 * 1000),
    };
  });

  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
}

export const findClosestTableIntervalToDate = (
  targetDate: Date,
): TableDateRangeAggregationOption | undefined => {
  const currentDate = new Date();
  const duration = Math.abs(currentDate.getTime() - targetDate.getTime());
  return findClosestInterval(
    TABLE_AGGREGATION_OPTIONS,
    tableDateRangeAggregationSettings,
    duration,
  );
};

export const findClosestDashboardInterval = (
  dateRange: DateRange,
): DashboardDateRangeAggregationOption | undefined => {
  if (!dateRange.from || !dateRange.to) return undefined;
  const duration = dateRange.to.getTime() - dateRange.from.getTime();
  return findClosestInterval(
    DASHBOARD_AGGREGATION_OPTIONS,
    dashboardDateRangeAggregationSettings,
    duration,
  );
};
