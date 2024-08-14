import { type DateRange } from "react-day-picker";

export const DEFAULT_DASHBOARD_AGGREGATION_SELECTION = "24 hours" as const;
export const DASHBOARD_AGGREGATION_PLACEHOLDER = "Custom" as const;
export const DEFAULT_AGGREGATION_SELECTION = "All time" as const;

export const DASHBOARD_AGGREGATION_OPTIONS = [
  "5 min",
  "30 min",
  "1 hour",
  "3 hours",
  "24 hours",
  "7 days",
  "1 month",
  "3 months",
  "1 year",
] as const;

export const TABLE_AGGREGATION_OPTIONS = [
  "30 min",
  "1 hour",
  "6 hours",
  "24 hours",
  "3 days",
  "7 days",
  "14 days",
  "1 month",
  "3 months",
] as const;

export type DashboardDateRangeAggregationOption =
  (typeof DASHBOARD_AGGREGATION_OPTIONS)[number];

export type TableDateRange = {
  from: Date;
};

export type TableDateRangeAggregationOption =
  (typeof TABLE_AGGREGATION_OPTIONS)[number];

export type DashboardDateRange = {
  from: Date;
  to: Date;
};

export type DateRangeAggregationOption =
  | DashboardDateRangeAggregationOption
  | TableDateRangeAggregationOption;

export type DashboardDateRangeOptions =
  | DashboardDateRangeAggregationOption
  | typeof DASHBOARD_AGGREGATION_PLACEHOLDER;

export type TableDateRangeOptions =
  | TableDateRangeAggregationOption
  | typeof DEFAULT_AGGREGATION_SELECTION;
export type DashboardDateRangeAggregationSettings = Record<
  DashboardDateRangeAggregationOption,
  {
    date_trunc: "year" | "month" | "week" | "day" | "hour" | "minute";
    minutes: number;
  }
>;

export type TableDateRangeAggregationSettings = Record<
  TableDateRangeAggregationOption,
  number
>;

export const dateTimeAggregationOptions = [
  ...TABLE_AGGREGATION_OPTIONS,
  ...DASHBOARD_AGGREGATION_OPTIONS,
  DEFAULT_AGGREGATION_SELECTION,
] as const;

export const dashboardDateRangeAggregationSettings: DashboardDateRangeAggregationSettings =
  {
    "1 year": {
      date_trunc: "month",
      minutes: 365 * 24 * 60,
    },
    "3 months": {
      date_trunc: "month",
      minutes: 3 * 28 * 24 * 60,
    },
    "1 month": {
      date_trunc: "day",
      minutes: 28 * 24 * 60,
    },
    "7 days": {
      date_trunc: "day",
      minutes: 7 * 24 * 60,
    },
    "24 hours": {
      date_trunc: "hour",
      minutes: 24 * 60,
    },
    "3 hours": {
      date_trunc: "hour",
      minutes: 3 * 60,
    },
    "1 hour": {
      date_trunc: "minute",
      minutes: 60,
    },
    "30 min": {
      date_trunc: "minute",
      minutes: 30,
    },
    "5 min": {
      date_trunc: "minute",
      minutes: 5,
    },
  };

export const tableDateRangeAggregationSettings: TableDateRangeAggregationSettings =
  {
    "3 months": 3 * 28 * 24 * 60,
    "1 month": 28 * 24 * 60,
    "14 days": 14 * 24 * 60,
    "7 days": 7 * 24 * 60,
    "3 days": 3 * 24 * 60,
    "24 hours": 24 * 60,
    "6 hours": 6 * 60,
    "1 hour": 60,
    "30 min": 30,
  };

export function isValidDashboardDateRangeAggregationOption(
  value: unknown,
): value is DashboardDateRangeAggregationOption {
  return (
    typeof value === "string" &&
    DASHBOARD_AGGREGATION_OPTIONS.includes(
      value as DashboardDateRangeAggregationOption,
    )
  );
}

export function isValidTableDateRangeAggregationOption(
  value: unknown,
): value is TableDateRangeAggregationOption {
  return (
    typeof value === "string" &&
    TABLE_AGGREGATION_OPTIONS.includes(value as TableDateRangeAggregationOption)
  );
}

export const findClosestTableIntervalToDate = (
  targetDate: Date,
): TableDateRangeAggregationOption | undefined => {
  const currentDate = new Date();
  const duration = Math.abs(currentDate.getTime() - targetDate.getTime());

  const diffs = TABLE_AGGREGATION_OPTIONS.map((interval) => {
    const minutes = tableDateRangeAggregationSettings[interval];
    return {
      interval,
      diff: Math.abs(duration - minutes * 60 * 1000),
    };
  });

  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
};

export const findClosestDashboardIntervalToDate = (
  targetDate: Date,
): DashboardDateRangeAggregationOption | undefined => {
  const currentDate = new Date();
  const duration = Math.abs(currentDate.getTime() - targetDate.getTime());

  const diffs = DASHBOARD_AGGREGATION_OPTIONS.map((interval) => {
    const { minutes } = dashboardDateRangeAggregationSettings[interval];
    return {
      interval,
      diff: Math.abs(duration - minutes * 60 * 1000),
    };
  });

  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
};

export const findClosestDashboardInterval = (
  dateRange: DateRange,
): DashboardDateRangeAggregationOption | undefined => {
  if (!dateRange.from || !dateRange.to) return undefined;
  const duration = dateRange.to.getTime() - dateRange.from.getTime();

  const diffs = DASHBOARD_AGGREGATION_OPTIONS.map((interval) => {
    const { minutes } = dashboardDateRangeAggregationSettings[interval];
    return {
      interval,
      diff: Math.abs(duration - minutes * 60 * 1000),
    };
  });

  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
};
