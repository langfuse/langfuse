import { type DateRange } from "react-day-picker";
import { z } from "zod";
import { addMinutes } from "date-fns";

export const DEFAULT_DASHBOARD_AGGREGATION_SELECTION = "24 hours" as const;
export const DASHBOARD_AGGREGATION_PLACEHOLDER = "Custom" as const;

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
  "All time",
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

export type TableDateRangeOptions = TableDateRangeAggregationOption;
export type DashboardDateRangeAggregationSettings = Record<
  DashboardDateRangeAggregationOption,
  {
    date_trunc: "year" | "month" | "week" | "day" | "hour" | "minute";
    minutes: number;
  }
>;

export const dateTimeAggregationOptions = [
  ...TABLE_AGGREGATION_OPTIONS,
  ...DASHBOARD_AGGREGATION_OPTIONS,
] as const;

export const dashboardDateRangeAggregationSettings: DashboardDateRangeAggregationSettings =
  {
    "1 year": {
      date_trunc: "month",
      minutes: 365 * 24 * 60,
    },
    "3 months": {
      date_trunc: "week",
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

export const SelectedTimeOptionSchema = z
  .discriminatedUnion("filterSource", [
    z.object({
      filterSource: z.literal("TABLE"),
      option: z.enum(TABLE_AGGREGATION_OPTIONS),
    }),
    z.object({
      filterSource: z.literal("DASHBOARD"),
      option: z.enum(DASHBOARD_AGGREGATION_OPTIONS),
    }),
  ])
  .optional();

type SelectedTimeOption = z.infer<typeof SelectedTimeOptionSchema>;

const TABLE_DATE_RANGE_AGGREGATION_SETTINGS = new Map<
  TableDateRangeAggregationOption,
  number | null
>([
  ["3 months", 3 * 28 * 24 * 60],
  ["1 month", 28 * 24 * 60],
  ["14 days", 14 * 24 * 60],
  ["7 days", 7 * 24 * 60],
  ["3 days", 3 * 24 * 60],
  ["24 hours", 24 * 60],
  ["6 hours", 6 * 60],
  ["1 hour", 60],
  ["30 min", 30],
  ["All time", null],
]);

export const getDateFromOption = (
  selectedTimeOption: SelectedTimeOption,
): Date | undefined => {
  if (!selectedTimeOption) return undefined;

  const { filterSource, option } = selectedTimeOption;
  if (filterSource === "TABLE") {
    const setting = TABLE_DATE_RANGE_AGGREGATION_SETTINGS.get(option);
    if (!setting) return undefined;

    return addMinutes(new Date(), -setting);
  } else if (filterSource === "DASHBOARD") {
    const setting =
      dashboardDateRangeAggregationSettings[
        option as keyof typeof dashboardDateRangeAggregationSettings
      ];

    return addMinutes(new Date(), -setting.minutes);
  }
  return undefined;
};

export function isValidDashboardDateRangeAggregationOption(
  value?: string,
): value is DashboardDateRangeAggregationOption {
  if (!value) return false;
  return (DASHBOARD_AGGREGATION_OPTIONS as readonly string[]).includes(value);
}

export function isValidTableDateRangeAggregationOption(
  value?: string,
): value is TableDateRangeAggregationOption {
  if (!value) return false;
  return (TABLE_AGGREGATION_OPTIONS as readonly string[]).includes(value);
}

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
