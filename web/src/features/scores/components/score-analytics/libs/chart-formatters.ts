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

/**
 * Format a timestamp for chart tooltips with more context than axis labels.
 * Tooltip timestamps typically include additional details like the date when
 * the axis shows only time, or the year when the axis shows only date.
 *
 * Examples:
 * - "Jan 15, 10:30:45" for second intervals (axis shows "10:30:45")
 * - "Jan 15, 10:30" for minute/hour intervals (axis shows "10:30")
 * - "Jan 15, 2025" for day intervals (axis shows "Jan 15")
 * - "Jan 2025" for month intervals (axis shows "Jan 2025")
 *
 * @param date - The timestamp to format
 * @param interval - The interval configuration (unit and count)
 * @param timeRange - The time range (relative or absolute)
 * @returns Formatted timestamp string for tooltip
 */
export function formatChartTooltipTimestamp(
  date: Date,
  interval: IntervalConfig,
  timeRange: TimeRange,
): string {
  const formatString = getChartTooltipFormat(interval, timeRange);
  return format(date, formatString);
}
