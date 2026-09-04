import { type DateTrunc } from "../server/repositories/dashboards";

export interface TimeRangeDefinition {
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

export type TimeRangePresets = Exclude<keyof typeof TIME_RANGES, "custom">;

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
] as const;

export type TableDateRangeAggregationOption =
  (typeof TABLE_AGGREGATION_OPTIONS)[number];

export type RelativeTimeRange = {
  range: string;
};

export type AbsoluteTimeRange = {
  from: Date;
  to: Date;
};

export type TimeRange = RelativeTimeRange | AbsoluteTimeRange;

export function getAbbreviatedTimeRange(option: string): string {
  return (
    TIME_RANGES[option as keyof typeof TIME_RANGES]?.abbreviation || option
  );
}

/**
 * Converts a range object to a string for URL serialization
 * - Named ranges: "last7Days" -> "7d" (abbreviated)
 * - Custom ranges: {from, to} -> "1693872000000-1694131199999"
 */
export function rangeToString(range: TimeRange): string {
  if ("range" in range) {
    return getAbbreviatedTimeRange(range.range);
  }
  return `${range.from.getTime()}-${range.to.getTime()}`;
}
