// dateRangeAggregationUtils.ts
export const dashboardDateRangeAggregationOptions = [
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

export const tableDateRangeAggregationOptions = [
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
  (typeof dashboardDateRangeAggregationOptions)[number];

export type TableDateRangeAggregationOption =
  (typeof tableDateRangeAggregationOptions)[number];

export type DateRangeAggregationOption =
  | DashboardDateRangeAggregationOption
  | TableDateRangeAggregationOption;

export type AllDateRangeAggregationOption =
  | DashboardDateRangeAggregationOption
  | TableDateRangeAggregationOption
  | typeof DEFAULT_DATE_RANGE_SELECTION;

export type DateRangeAggregationSettings<T extends DateRangeAggregationOption> =
  Record<
    T,
    {
      date_trunc: "year" | "month" | "week" | "day" | "hour" | "minute";
      date_formatter: (date: Date) => string;
      minutes: number;
    }
  >;

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

export const DEFAULT_DATE_RANGE_SELECTION = "All time" as const;

export type DateTimeAggregationOption =
  | DashboardDateRangeAggregationOption
  | TableDateRangeAggregationOption
  | typeof DEFAULT_DATE_RANGE_SELECTION;

export const dateTimeAggregationOptions = [
  ...dashboardDateRangeAggregationOptions,
  ...tableDateRangeAggregationOptions,
  DEFAULT_DATE_RANGE_SELECTION,
] as const;

export function isValidOption(
  value: unknown,
): value is DateTimeAggregationOption {
  return (
    typeof value === "string" &&
    dateTimeAggregationOptions.includes(value as DateTimeAggregationOption)
  );
}
