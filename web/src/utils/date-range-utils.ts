import { z } from "zod/v4";
import { addMinutes, format } from "date-fns";
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

export type TimeRangePresets = Exclude<keyof typeof TIME_RANGES, "custom">;

const ABBREVIATION_TO_KEY = new Map(
  Object.entries(TIME_RANGES).map(([key, def]) => [def.abbreviation, key]),
);

export const DEFAULT_DASHBOARD_AGGREGATION_SELECTION = "last1Day" as const;
export const DASHBOARD_AGGREGATION_PLACEHOLDER = "custom" as const;
export const TABLE_AGGREGATION_PLACEHOLDER = "custom" as const;

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
] as const;

export type DashboardDateRangeAggregationOption =
  (typeof DASHBOARD_AGGREGATION_OPTIONS)[number];

export type TableDateRange = {
  from: Date;
  to?: Date;
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
  | typeof TABLE_AGGREGATION_PLACEHOLDER;

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
  if (!minutes) return true; // Handle null minutes (like allTime)
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

    if (!setting.minutes) return undefined; // Handle null minutes (like allTime)
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
  dateRange: AbsoluteTimeRange,
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

// Helper function to check if time represents full day
export const isFullDay = (date: Date) => {
  return (
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0
  );
};

// Helper function to check if date range represents full days
export const isFullDayRange = (from: Date, to: Date) => {
  return (
    isFullDay(from) &&
    to.getHours() === 23 &&
    to.getMinutes() === 59 &&
    to.getSeconds() === 59
  );
};

// Format date range with smart year display and time inclusion
export const formatDateRange = (from: Date, to: Date) => {
  const currentYear = new Date().getFullYear();
  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();

  const showFromYear = fromYear !== currentYear;
  const showToYear = toYear !== currentYear;

  if (isFullDayRange(from, to)) {
    // Show just dates for full day ranges
    const fromPattern = showFromYear ? "LLL dd, yyyy" : "LLL dd";
    const toPattern = showToYear ? "LLL dd, yyyy" : "LLL dd";
    return `${format(from, fromPattern)} - ${format(to, toPattern)}`;
  } else {
    // Show dates with times for partial day ranges
    const fromPattern = showFromYear ? "LLL dd yyyy, HH:mm" : "LLL dd, HH:mm";
    const toPattern = showToYear ? "LLL dd yyyy, HH:mm" : "LLL dd, HH:mm";
    return `${format(from, fromPattern)} - ${format(to, toPattern)}`;
  }
};

export type RelativeTimeRange = {
  range: string;
};

export type AbsoluteTimeRange = {
  from: Date;
  to: Date;
};

export type TimeRange = RelativeTimeRange | AbsoluteTimeRange;

/**
 * =======================
 * Interval Configuration
 * =======================
 */

/**
 * Supported interval units for time series aggregation
 */
export type IntervalUnit =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "month"
  | "year";

/**
 * Interval configuration with count and unit
 * Used for ClickHouse INTERVAL N UNIT queries
 */
export type IntervalConfig = {
  count: number;
  unit: IntervalUnit;
};

/**
 * Allowed intervals - only "clean" values to avoid crooked numbers
 * These are the only intervals that can be selected by the algorithm
 */
export const ALLOWED_INTERVALS: readonly IntervalConfig[] = [
  // Seconds
  { count: 1, unit: "second" },
  { count: 5, unit: "second" },
  { count: 10, unit: "second" },
  { count: 30, unit: "second" },
  // Minutes
  { count: 1, unit: "minute" },
  { count: 5, unit: "minute" },
  { count: 10, unit: "minute" },
  { count: 30, unit: "minute" },
  // Hours
  { count: 1, unit: "hour" },
  { count: 3, unit: "hour" },
  { count: 6, unit: "hour" },
  { count: 12, unit: "hour" },
  // Days
  { count: 1, unit: "day" },
  { count: 2, unit: "day" },
  { count: 5, unit: "day" },
  { count: 7, unit: "day" },
  { count: 14, unit: "day" },
  // Months
  { count: 1, unit: "month" },
  { count: 3, unit: "month" },
  { count: 6, unit: "month" },
  // Years
  { count: 1, unit: "year" },
] as const;

export const toAbsoluteTimeRange = (
  timeRange: TimeRange,
): AbsoluteTimeRange | null => {
  if ("from" in timeRange) {
    return timeRange;
  }

  const preset = TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES];

  if (!preset?.minutes) {
    return null;
  }

  return {
    from: addMinutes(new Date(), -preset.minutes),
    to: new Date(),
  };
};

/**
 * =======================
 * Optimal Interval Selection
 * =======================
 */

/**
 * Convert interval configuration to approximate milliseconds
 * Note: Month and year use average durations for calculation purposes
 *
 * @param interval - The interval configuration
 * @returns Approximate duration in milliseconds
 */
function getIntervalDuration(interval: IntervalConfig): number {
  const { count, unit } = interval;

  const MS_PER_UNIT = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    month: 30.44 * 24 * 60 * 60 * 1000, // Average month length
    year: 365.25 * 24 * 60 * 60 * 1000, // Account for leap years
  };

  return count * MS_PER_UNIT[unit];
}

/**
 * Select the optimal interval from ALLOWED_INTERVALS to achieve target data points
 *
 * Algorithm:
 * 1. Calculate duration between fromDate and toDate
 * 2. For each allowed interval, calculate how many data points it would produce
 * 3. Score each interval based on proximity to target range (10-16 points, prefer 13)
 * 4. Return the interval with the highest score
 *
 * @param fromDate - Start of the time range
 * @param toDate - End of the time range
 * @param targetPoints - Ideal number of data points (default: 13, middle of 10-16 range)
 * @param minPoints - Minimum acceptable data points (default: 10)
 * @param maxPoints - Maximum acceptable data points (default: 16)
 * @returns The optimal interval configuration
 */
export function getOptimalInterval(
  fromDate: Date,
  toDate: Date,
  targetPoints: number = 13,
  minPoints: number = 10,
  maxPoints: number = 16,
): IntervalConfig {
  const durationMs = toDate.getTime() - fromDate.getTime();

  // Edge case: invalid or zero duration
  if (durationMs <= 0) {
    return { count: 1, unit: "day" };
  }

  let bestInterval: IntervalConfig = { count: 1, unit: "day" };
  let bestScore = -Infinity;

  for (const interval of ALLOWED_INTERVALS) {
    const intervalMs = getIntervalDuration(interval);
    const dataPoints = Math.floor(durationMs / intervalMs) + 1;

    // Calculate score based on proximity to target range
    let score: number;

    if (dataPoints >= minPoints && dataPoints <= maxPoints) {
      // Within target range - prefer closer to targetPoints
      // Score from 0 to maxPoints (higher is better)
      score = maxPoints - Math.abs(dataPoints - targetPoints);
    } else if (dataPoints < minPoints) {
      // Below minimum - penalize heavily
      // The fewer points, the worse the score
      const deficit = minPoints - dataPoints;
      score = dataPoints - deficit * 2; // Double penalty for being below min
    } else {
      // Above maximum - penalize, but less severely than below minimum
      // Too many points is better than too few
      const excess = dataPoints - maxPoints;
      score = maxPoints - excess * 0.5; // Half penalty for being above max
    }

    // Update best interval if this one scores higher
    if (score > bestScore) {
      bestScore = score;
      bestInterval = interval;
    }
  }

  return bestInterval;
}

/**
 * Determines the optimal interval for score analytics based on time range.
 * Maps time ranges to appropriate intervals for ClickHouse aggregation.
 *
 * Target: 20-50 data points for optimal visualization
 *
 * @param timeRange - The time range (relative or absolute)
 * @returns Interval suitable for score analytics API ("hour" | "day" | "week" | "month")
 */
export function getScoreAnalyticsInterval(
  timeRange: TimeRange,
): "hour" | "day" | "week" | "month" {
  // Handle preset ranges
  if ("range" in timeRange) {
    const preset = TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES];

    if (!preset) {
      return "day"; // Fallback
    }

    // Map dateTrunc to interval (note: API doesn't support "minute")
    switch (preset.dateTrunc) {
      case "minute":
      case "hour":
        return "hour";
      case "day":
        return "day";
      case "week":
        return "week";
      case "month":
        return "month";
      default:
        return "day"; // Fallback
    }
  }

  // Handle custom ranges
  const absoluteRange = toAbsoluteTimeRange(timeRange);
  if (!absoluteRange) {
    return "day"; // Fallback
  }

  const durationMs = absoluteRange.to.getTime() - absoluteRange.from.getTime();
  const durationMinutes = durationMs / (1000 * 60);

  // Calculate based on duration to get ~20-50 data points
  // < 7 days → hour (yields 1-168 points)
  if (durationMinutes < 7 * 24 * 60) {
    return "hour";
  }
  // 7-90 days → day (yields 7-90 points)
  else if (durationMinutes < 90 * 24 * 60) {
    return "day";
  }
  // 90 days - 1 year → week (yields 13-52 points)
  else if (durationMinutes < 365 * 24 * 60) {
    return "week";
  }
  // > 1 year → month (yields 12+ points)
  else {
    return "month";
  }
}

/**
 * Converts a range object to a string for URL serialization
 * - Named ranges: "last7Days" -> "7d" (abbreviated)
 * - Custom ranges: {from, to} -> "1693872000000-1694131199999"
 */
export function rangeToString(range: TimeRange): string {
  if ("range" in range) {
    return getAbbreviatedTimeRange(range.range);
  } else {
    return `${range.from.getTime()}-${range.to.getTime()}`;
  }
}

/**
 * Parses a string back to a range object with validation
 * - Handles both abbreviated ("7d") and full ("last7Days") named ranges
 * - Handles custom timestamp ranges ("1693872000000-1694131199999")
 * - Returns fallback if parsing fails or range is not in allowedRanges
 */
export function rangeFromString<T extends string>(
  abbreviatedRange: string,
  allowedRanges: readonly T[],
  fallback: T,
): TimeRange {
  // Named range
  const fullRange = getFullTimeRangeFromAbbreviated(abbreviatedRange);
  if (allowedRanges.includes(fullRange as T)) {
    return { range: fullRange as T };
  }

  // Try parsing as custom range
  try {
    const parts = abbreviatedRange.split("-");
    if (parts.length === 2) {
      const fromTimestamp = parseInt(parts[0], 10);
      const toTimestamp = parseInt(parts[1], 10);

      if (!isNaN(fromTimestamp) && !isNaN(toTimestamp)) {
        const from = new Date(fromTimestamp);
        const to = new Date(toTimestamp);

        // Validate dates
        if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
          return { from, to };
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  return { range: fallback };
}

/**
 * =======================
 * Chart Formatting
 * =======================
 */

/**
 * Get the appropriate date-fns format string for chart X-axis labels
 * based on the interval unit and time range duration.
 *
 * This function returns format strings optimized for axis labels (concise).
 *
 * @param interval - The interval configuration (unit and count)
 * @param timeRange - The time range (relative or absolute)
 * @returns date-fns format string for axis labels
 */
export function getChartAxisFormat(
  interval: IntervalConfig,
  timeRange: TimeRange,
): string {
  const { unit } = interval;

  // Calculate duration for context-aware formatting
  const absoluteRange = toAbsoluteTimeRange(timeRange);
  let durationHours: number | null = null;

  if (absoluteRange) {
    const durationMs =
      absoluteRange.to.getTime() - absoluteRange.from.getTime();
    durationHours = durationMs / (1000 * 60 * 60);
  }

  switch (unit) {
    case "second":
      // < 5 minutes: show time with seconds only
      return "HH:mm:ss";

    case "minute":
      // 5 min - 3 hours: show time only (no date)
      return "HH:mm";

    case "hour":
      // 3 hours - 7 days
      if (durationHours !== null && durationHours <= 24) {
        // Within 1 day: time only
        return "HH:mm";
      } else {
        // Multiple days: date + time
        return "MMM dd, HH:mm";
      }

    case "day":
      // 7 days - 90 days: date without time
      return "MMM dd";

    case "month":
      // > 90 days: month and year
      return "MMM yyyy";

    case "year":
      // Multi-year ranges: year only
      return "yyyy";

    default:
      // Fallback to day format
      return "MMM dd";
  }
}

/**
 * Get the appropriate date-fns format string for chart tooltip timestamps.
 * Tooltip formats provide more context than axis labels (e.g., include date when axis shows time).
 *
 * @param interval - The interval configuration (unit and count)
 * @param timeRange - The time range (relative or absolute)
 * @returns date-fns format string for tooltip timestamps
 */
export function getChartTooltipFormat(
  interval: IntervalConfig,
  timeRange: TimeRange,
): string {
  const { unit } = interval;

  switch (unit) {
    case "second":
      // Show date + time with seconds for context
      return "MMM dd, HH:mm:ss";

    case "minute":
      // Show date + time
      return "MMM dd, HH:mm";

    case "hour":
      // Show date + time
      return "MMM dd, HH:mm";

    case "day":
      // Show date with year for extra context
      return "MMM dd, yyyy";

    case "month":
      // Show month and year
      return "MMM yyyy";

    case "year":
      // Show year
      return "yyyy";

    default:
      // Fallback - use axis format
      return getChartAxisFormat(interval, timeRange);
  }
}

// Re-export fillTimeSeriesGaps from its own module
export { fillTimeSeriesGaps } from "./fill-time-series-gaps";
