/**
 * ClickHouse time bucketing utilities for score analytics
 *
 * This module provides helper functions for constructing ClickHouse time-based queries
 * with proper interval normalization and SQL function generation.
 */

import { type IntervalConfig } from "@/src/utils/date-range-utils";

/**
 * Normalize multi-unit intervals to single-unit intervals for ClickHouse
 *
 * ClickHouse time bucketing functions work best with single-unit intervals.
 * This function normalizes multi-unit intervals to single-unit equivalents,
 * with special handling for 7-day intervals (ISO 8601 weeks).
 *
 * Special cases:
 * - 7-day intervals remain as {count: 7, unit: "day"} to use toStartOfWeek
 * - All other intervals normalize to {count: 1, unit: originalUnit}
 *
 * This approach ensures consistent, calendar-aligned behavior across all time ranges.
 *
 * @param interval - The requested interval (may be multi-unit like {count: 2, unit: "day"})
 * @returns Normalized single-unit interval for ClickHouse (e.g., {count: 1, unit: "day"})
 *
 * @example
 * ```typescript
 * normalizeIntervalForClickHouse({ count: 7, unit: "day" })
 * // Returns: { count: 7, unit: "day" } (special case for weeks)
 *
 * normalizeIntervalForClickHouse({ count: 2, unit: "day" })
 * // Returns: { count: 1, unit: "day" }
 *
 * normalizeIntervalForClickHouse({ count: 1, unit: "hour" })
 * // Returns: { count: 1, unit: "hour" }
 * ```
 */
export const normalizeIntervalForClickHouse = (
  interval: IntervalConfig,
): IntervalConfig => {
  // Special case: 7-day intervals become ISO 8601 weeks (Monday-aligned)
  if (interval.count === 7 && interval.unit === "day") {
    return { count: 7, unit: "day" }; // Will use toStartOfWeek
  }

  // All other intervals: normalize to single-unit
  return { count: 1, unit: interval.unit };
};

/**
 * Generate ClickHouse SQL function for time bucketing
 *
 * Returns the appropriate ClickHouse time bucketing function for SINGLE-UNIT intervals.
 * Uses calendar-aligned functions to ensure "today's" data appears in today's bucket.
 *
 * Special cases:
 * - 7-day intervals use toStartOfWeek (Monday start, ISO 8601)
 * - Day intervals include 'UTC' timezone parameter
 * - All other intervals use toStartOfXXX functions
 *
 * @param timestampField - The timestamp field name to bucket (e.g., "timestamp", "timestamp1")
 * @param normalizedInterval - Single-unit interval (or 7-day for weeks)
 * @returns ClickHouse SQL function call as string
 *
 * @example
 * ```typescript
 * getClickHouseTimeBucketFunction("timestamp", { count: 1, unit: "day" })
 * // Returns: "toStartOfDay(timestamp, 'UTC')"
 *
 * getClickHouseTimeBucketFunction("timestamp", { count: 7, unit: "day" })
 * // Returns: "toStartOfWeek(timestamp, 1)"
 *
 * getClickHouseTimeBucketFunction("created_at", { count: 1, unit: "hour" })
 * // Returns: "toStartOfHour(created_at)"
 * ```
 */
export const getClickHouseTimeBucketFunction = (
  timestampField: string,
  normalizedInterval: IntervalConfig,
): string => {
  const { count, unit } = normalizedInterval;

  // Special case: 7-day intervals align to ISO 8601 week (Monday start)
  if (count === 7 && unit === "day") {
    return `toStartOfWeek(${timestampField}, 1)`; // mode 1 = Monday
  }

  // All other cases are single-unit intervals with calendar alignment
  switch (unit) {
    case "second":
      return `toStartOfSecond(${timestampField})`;
    case "minute":
      return `toStartOfMinute(${timestampField})`;
    case "hour":
      return `toStartOfHour(${timestampField})`;
    case "day":
      return `toStartOfDay(${timestampField}, 'UTC')`;
    case "month":
      return `toStartOfMonth(${timestampField})`;
    case "year":
      return `toStartOfYear(${timestampField})`;
  }
};
