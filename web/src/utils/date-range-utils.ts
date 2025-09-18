import { type DateRange } from "react-day-picker";
import { z } from "zod/v4";
import { addMinutes } from "date-fns";
import { type DateTrunc } from "@langfuse/shared/src/server";

interface TimeRangeDefinition {
  label: string;
  abbreviation: string;
  minutes: number | null;
  dateTrunc: DateTrunc | null;
}

export const TIME_RANGES = {
  last5Minutes: {
    label: "Past 5 min",
    abbreviation: "5m",
    minutes: 5,
    dateTrunc: "minute",
  },
  last30Minutes: {
    label: "Past 30 min",
    abbreviation: "30m",
    minutes: 30,
    dateTrunc: "minute",
  },
  last1Hour: {
    label: "Past 1 hour",
    abbreviation: "1h",
    minutes: 60,
    dateTrunc: "minute",
  },
  last3Hours: {
    label: "Past 3 hours",
    abbreviation: "3h",
    minutes: 3 * 60,
    dateTrunc: "minute",
  },
  last6Hours: {
    label: "Past 6 hours",
    abbreviation: "6h",
    minutes: 6 * 60,
    dateTrunc: "minute",
  },
  last1Day: {
    label: "Past 1 day",
    abbreviation: "1d",
    minutes: 24 * 60,
    dateTrunc: "hour",
  },
  last3Days: {
    label: "Past 3 days",
    abbreviation: "3d",
    minutes: 3 * 24 * 60,
    dateTrunc: "hour",
  },
  last7Days: {
    label: "Past 7 days",
    abbreviation: "7d",
    minutes: 7 * 24 * 60,
    dateTrunc: "hour",
  },
  last14Days: {
    label: "Past 14 days",
    abbreviation: "14d",
    minutes: 14 * 24 * 60,
    dateTrunc: "day",
  },
  last30Days: {
    label: "Past 30 days",
    abbreviation: "30d",
    minutes: 30 * 24 * 60,
    dateTrunc: "day",
  },
  last90Days: {
    label: "Past 90 days",
    abbreviation: "90d",
    minutes: 90 * 24 * 60,
    dateTrunc: "week",
  },
  last1Year: {
    label: "Past 1 year",
    abbreviation: "1y",
    minutes: 365 * 24 * 60,
    dateTrunc: "month",
  },
  allTime: {
    label: "All time",
    abbreviation: "All",
    minutes: null,
    dateTrunc: null,
  },
  custom: {
    label: "Custom",
    abbreviation: "Custom",
    minutes: null,
    dateTrunc: null,
  },
} satisfies Record<string, TimeRangeDefinition>;

const ABBREVIATION_TO_KEY = new Map(
  Object.entries(TIME_RANGES).map(([key, def]) => [def.abbreviation, key]),
);

export const DEFAULT_DASHBOARD_AGGREGATION_SELECTION = "last1Day" as const;
export const DASHBOARD_AGGREGATION_PLACEHOLDER = "custom" as const;

export const DASHBOARD_AGGREGATION_OPTIONS = [
  "last5Minutes",
  "last30Minutes",
  "last1Hour",
  "last3Hours",
  "last1Day",
  "last7Days",
  "last30Days",
  "last90Days",
  "last1Year",
] as const;

export const TABLE_AGGREGATION_OPTIONS = [
  "last30Minutes",
  "last1Hour",
  "last6Hours",
  "last1Day",
  "last3Days",
  "last7Days",
  "last14Days",
  "last30Days",
  "last90Days",
  "allTime",
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
  TimeRangeDefinition
>;

export const dateTimeAggregationOptions = [
  ...TABLE_AGGREGATION_OPTIONS,
  ...DASHBOARD_AGGREGATION_OPTIONS,
] as const;

export const dashboardDateRangeAggregationSettings: DashboardDateRangeAggregationSettings =
  Object.fromEntries(
    DASHBOARD_AGGREGATION_OPTIONS.map((option) => [
      option,
      TIME_RANGES[option as keyof typeof TIME_RANGES],
    ]),
  ) as DashboardDateRangeAggregationSettings;

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

export const isDashboardDateRangeOptionAvailable = ({
  option,
  limitDays,
}: {
  option: DashboardDateRangeAggregationOption;
  limitDays: number | false;
}) => {
  if (limitDays === false) return true;

  const { minutes } = dashboardDateRangeAggregationSettings[option];
  return limitDays >= minutes / (24 * 60);
};

type SelectedTimeOption = z.infer<typeof SelectedTimeOptionSchema>;

const TABLE_DATE_RANGE_AGGREGATION_SETTINGS = new Map<
  TableDateRangeAggregationOption,
  number | null
>(
  TABLE_AGGREGATION_OPTIONS.map((option) => [
    option,
    TIME_RANGES[option].minutes,
  ]),
);

export const isTableDataRangeOptionAvailable = ({
  option,
  limitDays,
}: {
  option: TableDateRangeAggregationOption;
  limitDays: number | false;
}) => {
  if (limitDays === false) return true;

  const durationMinutes = TABLE_DATE_RANGE_AGGREGATION_SETTINGS.get(option);
  if (!durationMinutes) return false;

  return limitDays >= durationMinutes / (24 * 60);
};

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

export function getAbbreviatedTimeRange(option: string): string {
  return (
    TIME_RANGES[option as keyof typeof TIME_RANGES]?.abbreviation || option
  );
}

export function getFullTimeRangeFromAbbreviated(
  abbreviated: string,
): DateRangeAggregationOption | null {
  return (
    (ABBREVIATION_TO_KEY.get(abbreviated) as DateRangeAggregationOption) || null
  );
}

export function getTimeRangeLabel(option: string): string {
  return TIME_RANGES[option as keyof typeof TIME_RANGES]?.label || option;
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
      diff: Math.abs(duration - minutes! * 60 * 1000),
    };
  });

  diffs.sort((a, b) => a.diff - b.diff);

  return diffs[0]?.interval;
};
