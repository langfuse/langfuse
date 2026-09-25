import { format } from "date-fns";
import {
  getChartAxisFormat,
  getChartTooltipFormat,
  type IntervalConfig,
  type TimeRange,
} from "@/src/utils/date-range-utils";

/**
 * Format a timestamp for chart X-axis labels using dynamic formatting
 * based on the interval unit and time range duration.
 *
 * Examples:
 * - "10:30:45" for second intervals
 * - "10:30" for minute/hour intervals (< 1 day)
 * - "Jan 15, 10:30" for hour intervals (> 1 day)
 * - "Jan 15" for day intervals
 * - "Jan 2025" for month intervals
 *
 * @param date - The timestamp to format
 * @param interval - The interval configuration (unit and count)
 * @param timeRange - The time range (relative or absolute)
 * @returns Formatted timestamp string for axis label
 */
export function formatChartTimestamp(
  date: Date,
  interval: IntervalConfig,
  timeRange: TimeRange,
): string {
  const formatString = getChartAxisFormat(interval, timeRange);
  return format(date, formatString);
}

export function formatChartTooltipTimestamp(
  date: Date,
  interval: IntervalConfig,
  timeRange: TimeRange,
) {
  return format(date, getChartTooltipFormat(interval, timeRange));
}
