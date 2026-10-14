import {
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addMonths,
  addYears,
  addWeeks,
  startOfSecond,
  startOfMinute,
  startOfHour,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { type IntervalConfig } from "./date-range-utils";

/**
 * Fills gaps in time series data and aggregates single-unit data into multi-unit buckets.
 *
 * IMPORTANT: Due to ClickHouse's epoch-aligned toStartOfInterval behavior for multi-unit intervals,
 * the backend ALWAYS queries with SINGLE-UNIT intervals (1 second, 1 minute, 1 hour, 1 day, 1 month, 1 year).
 * This function receives single-unit data from ClickHouse and aggregates it into the requested
 * multi-unit buckets, working backwards from toTimestamp to ensure "today's" data appears in the
 * rightmost bucket.
 *
 * For single-unit intervals (count=1), this function just fills gaps in the data.
 * For multi-unit intervals (count>1), it groups single-unit data points into buckets.
 *
 * @param data - Array of SINGLE-UNIT time series data points from ClickHouse
 * @param fromDate - Start of the time range
 * @param toDate - End of the time range
 * @param interval - The REQUESTED interval (may be multi-unit like {count: 2, unit: "day"})
 * @returns Array with data aggregated into requested intervals
 */
export function fillTimeSeriesGaps<
  T extends { timestamp: Date; [key: string]: unknown },
>(data: T[], fromDate: Date, toDate: Date, interval: IntervalConfig): T[] {
  const { count, unit } = interval;

  // If single-unit interval (or 7-day weeks), ClickHouse already returned the correct buckets
  // Just fill gaps in the data
  if (count === 1 || (count === 7 && unit === "day")) {
    return fillGapsInSingleUnitData(data, fromDate, toDate, interval);
  }

  // For multi-unit intervals, aggregate single-unit data into multi-unit buckets
  return aggregateIntoMultiUnitBuckets(data, fromDate, toDate, interval);
}

/**
 * Fill gaps in single-unit data (ClickHouse already returned correct bucket timestamps)
 */
function fillGapsInSingleUnitData<
  T extends { timestamp: Date; [key: string]: unknown },
>(data: T[], fromDate: Date, toDate: Date, interval: IntervalConfig): T[] {
  const { count, unit } = interval;

  // Helper: Align timestamp to calendar boundary for single-unit intervals
  const toStartOfSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return startOfSecond(date);
      case "minute":
        return startOfMinute(date);
      case "hour":
        return startOfHour(date);
      case "day":
        return startOfDay(date);
      case "month":
        return startOfMonth(date);
      case "year":
        return startOfYear(date);
    }
  };

  // Special case for 7-day weeks: use Monday alignment
  const toStartOfInterval =
    count === 7 && unit === "day"
      ? (date: Date) => startOfWeek(date, { weekStartsOn: 1 })
      : toStartOfSingleUnit;

  // Helper: Increment by single unit
  const addSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return addSeconds(date, 1);
      case "minute":
        return addMinutes(date, 1);
      case "hour":
        return addHours(date, 1);
      case "day":
        return addDays(date, 1);
      case "month":
        return addMonths(date, 1);
      case "year":
        return addYears(date, 1);
    }
  };

  // Special case for 7-day weeks
  const addInterval =
    count === 7 && unit === "day"
      ? (date: Date) => addWeeks(date, 1)
      : addSingleUnit;

  // Normalize the from date to interval boundary
  const normalizedFrom = toStartOfInterval(fromDate);

  // Create a map of existing data points keyed by normalized timestamp
  const dataMap = new Map<number, T>();
  for (const item of data) {
    const normalizedTimestamp = toStartOfInterval(item.timestamp).getTime();
    dataMap.set(normalizedTimestamp, item);
  }

  // Generate all time points in the range
  const filledData: T[] = [];

  // If we have no data, return empty array
  if (data.length === 0) {
    return filledData;
  }

  // Find the last timestamp in the actual data
  const lastDataTimestamp = Math.max(
    ...data.map((d) => toStartOfInterval(d.timestamp).getTime()),
  );

  let currentTime = normalizedFrom;

  while (currentTime.getTime() <= lastDataTimestamp) {
    const timestamp = currentTime.getTime();
    const existingData = dataMap.get(timestamp);

    if (existingData) {
      filledData.push(existingData);
    } else {
      // Create a placeholder with null values
      const placeholder = { timestamp: new Date(timestamp) } as T;

      // Safety check: only iterate if data array is not empty
      if (data.length > 0) {
        const sampleItem = data[0];
        if (sampleItem) {
          for (const key in sampleItem) {
            if (key !== "timestamp" && typeof sampleItem[key] === "number") {
              (placeholder as any)[key] = null;
            } else if (key !== "timestamp") {
              (placeholder as any)[key] = sampleItem[key];
            }
          }
        }
      }

      filledData.push(placeholder);
    }

    currentTime = addInterval(currentTime);
  }

  return filledData;
}

/**
 * Aggregate single-unit data from ClickHouse into multi-unit buckets.
 * Works backwards from toTimestamp to ensure "today's" data appears in the rightmost bucket.
 */
function aggregateIntoMultiUnitBuckets<
  T extends { timestamp: Date; [key: string]: unknown },
>(data: T[], fromDate: Date, toDate: Date, interval: IntervalConfig): T[] {
  const { count, unit } = interval;

  if (data.length === 0) {
    return [];
  }

  // Helper: Get single-unit timestamp normalizer
  const toStartOfSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return startOfSecond(date);
      case "minute":
        return startOfMinute(date);
      case "hour":
        return startOfHour(date);
      case "day":
        return startOfDay(date);
      case "month":
        return startOfMonth(date);
      case "year":
        return startOfYear(date);
    }
  };

  // Helper: Subtract single units
  const subtractSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return addSeconds(date, -1);
      case "minute":
        return addMinutes(date, -1);
      case "hour":
        return addHours(date, -1);
      case "day":
        return addDays(date, -1);
      case "month":
        return addMonths(date, -1);
      case "year":
        return addYears(date, -1);
    }
  };

  // Work backwards from toDate to create bucket boundaries
  // This ensures the data aligns with the requested time range
  // Don't normalize toDate - use it as-is to ensure rightmost bucket includes "today"
  const normalizedTo = toDate;
  const buckets: Array<{ start: Date; end: Date; dataPoints: T[] }> = [];

  let bucketEnd = normalizedTo;
  let iterations = 0;
  const maxIterations = 10000; // Safety limit to prevent infinite loops

  // Create buckets going backwards until we cover fromDate
  while (bucketEnd >= fromDate && iterations < maxIterations) {
    iterations++;
    let bucketStart = bucketEnd;

    // Go back `count` units
    for (let i = 0; i < count - 1; i++) {
      bucketStart = subtractSingleUnit(bucketStart);
    }

    // Only include buckets that overlap with our date range
    if (bucketStart < normalizedTo) {
      buckets.unshift({
        start: bucketStart,
        end: bucketEnd,
        dataPoints: [],
      });
    }

    // Move to previous bucket - subtract by the full interval count
    for (let i = 0; i < count; i++) {
      bucketEnd = subtractSingleUnit(bucketEnd);
    }
  }

  // Assign data points to buckets
  for (const dataPoint of data) {
    const ts = toStartOfSingleUnit(dataPoint.timestamp);

    for (const bucket of buckets) {
      if (ts >= bucket.start && ts <= bucket.end) {
        bucket.dataPoints.push(dataPoint);
        break;
      }
    }
  }

  // Aggregate each bucket
  const aggregatedData: T[] = [];

  for (const bucket of buckets) {
    if (bucket.dataPoints.length === 0) {
      // Empty bucket - create placeholder
      const placeholder = { timestamp: bucket.end } as T;

      // Safety check: only iterate if data array is not empty
      if (data.length > 0) {
        const sampleItem = data[0];
        if (sampleItem) {
          for (const key in sampleItem) {
            if (key !== "timestamp" && typeof sampleItem[key] === "number") {
              (placeholder as any)[key] = null;
            } else if (key !== "timestamp") {
              (placeholder as any)[key] = sampleItem[key];
            }
          }
        }
      }

      aggregatedData.push(placeholder);
    } else {
      // Aggregate values - average numeric fields, use bucket end as timestamp
      const aggregated = { timestamp: bucket.end } as T;

      const sampleItem = bucket.dataPoints[0];
      for (const key in sampleItem) {
        if (key === "timestamp") continue;

        if (typeof sampleItem[key] === "number") {
          // Average numeric values (excluding nulls)
          const values = bucket.dataPoints
            .map((dp) => dp[key] as number | null)
            .filter((v): v is number => v !== null);

          if (values.length > 0) {
            const sum = values.reduce((acc, val) => acc + val, 0);
            (aggregated as any)[key] = sum / values.length;
          } else {
            (aggregated as any)[key] = null;
          }
        } else {
          // Non-numeric fields: use first value
          (aggregated as any)[key] = sampleItem[key];
        }
      }

      aggregatedData.push(aggregated);
    }
  }

  return aggregatedData;
}

/**
 * Fills gaps in categorical/boolean time series data and aggregates single-unit data into multi-unit buckets.
 *
 * Handles "long format" categorical data where each row is { timestamp, category, count }.
 * Unlike numeric data which has one row per timestamp, categorical data has multiple rows per timestamp
 * (one for each category).
 *
 * This function:
 * 1. Extracts unique categories from the data
 * 2. For single-unit intervals: Fills missing timestamps by adding entries with count=0 for all categories
 * 3. For multi-unit intervals: Aggregates single-unit buckets by SUMMING counts (not averaging)
 * 4. Ensures all categories appear at all timestamps (even if count=0)
 *
 * @param data - Array of categorical data points { timestamp, category, count }
 * @param fromDate - Start of the time range
 * @param toDate - End of the time range
 * @param interval - The requested interval (may be multi-unit)
 * @returns Array with all timestamps filled and counts aggregated
 */
export function fillCategoricalTimeSeriesGaps<
  T extends { timestamp: Date; category: string; count: number },
>(data: T[], fromDate: Date, toDate: Date, interval: IntervalConfig): T[] {
  const { count, unit } = interval;

  // Extract unique categories
  const categories = Array.from(new Set(data.map((d) => d.category)));

  if (categories.length === 0) {
    return [];
  }

  // If single-unit interval (or 7-day weeks), just fill gaps
  if (count === 1 || (count === 7 && unit === "day")) {
    return fillGapsInCategoricalData(
      data,
      fromDate,
      toDate,
      interval,
      categories,
    );
  }

  // For multi-unit intervals, aggregate by summing counts
  return aggregateCategoricalIntoMultiUnitBuckets(
    data,
    fromDate,
    toDate,
    interval,
    categories,
  );
}

/**
 * Fill gaps in single-unit categorical data
 */
function fillGapsInCategoricalData<
  T extends { timestamp: Date; category: string; count: number },
>(
  data: T[],
  fromDate: Date,
  toDate: Date,
  interval: IntervalConfig,
  categories: string[],
): T[] {
  const { count, unit } = interval;

  // Helper: Align timestamp to calendar boundary
  const toStartOfSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return startOfSecond(date);
      case "minute":
        return startOfMinute(date);
      case "hour":
        return startOfHour(date);
      case "day":
        return startOfDay(date);
      case "month":
        return startOfMonth(date);
      case "year":
        return startOfYear(date);
    }
  };

  // Special case for 7-day weeks
  const toStartOfInterval =
    count === 7 && unit === "day"
      ? (date: Date) => startOfWeek(date, { weekStartsOn: 1 })
      : toStartOfSingleUnit;

  // Helper: Increment by single unit
  const addSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return addSeconds(date, 1);
      case "minute":
        return addMinutes(date, 1);
      case "hour":
        return addHours(date, 1);
      case "day":
        return addDays(date, 1);
      case "month":
        return addMonths(date, 1);
      case "year":
        return addYears(date, 1);
    }
  };

  const addInterval =
    count === 7 && unit === "day"
      ? (date: Date) => addWeeks(date, 1)
      : addSingleUnit;

  const normalizedFrom = toStartOfInterval(fromDate);
  const normalizedTo = toStartOfInterval(toDate);

  // Create a map: timestamp -> category -> count
  const dataMap = new Map<number, Map<string, number>>();
  for (const item of data) {
    const normalizedTs = toStartOfInterval(item.timestamp).getTime();
    if (!dataMap.has(normalizedTs)) {
      dataMap.set(normalizedTs, new Map());
    }
    dataMap.get(normalizedTs)!.set(item.category, item.count);
  }

  // Generate all time points from fromDate to toDate with all categories
  const filledData: T[] = [];
  let currentTime = normalizedFrom;

  while (currentTime.getTime() <= normalizedTo.getTime()) {
    const timestamp = currentTime.getTime();
    const categoryMap = dataMap.get(timestamp);

    // For each category, add an entry
    for (const category of categories) {
      const count = categoryMap?.get(category) ?? 0;
      filledData.push({
        timestamp: new Date(timestamp),
        category,
        count,
      } as T);
    }

    currentTime = addInterval(currentTime);
  }

  return filledData;
}

/**
 * Aggregate categorical single-unit data into multi-unit buckets by SUMMING counts
 */
function aggregateCategoricalIntoMultiUnitBuckets<
  T extends { timestamp: Date; category: string; count: number },
>(
  data: T[],
  fromDate: Date,
  toDate: Date,
  interval: IntervalConfig,
  categories: string[],
): T[] {
  const { count, unit } = interval;

  if (data.length === 0) {
    return [];
  }

  const toStartOfSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return startOfSecond(date);
      case "minute":
        return startOfMinute(date);
      case "hour":
        return startOfHour(date);
      case "day":
        return startOfDay(date);
      case "month":
        return startOfMonth(date);
      case "year":
        return startOfYear(date);
    }
  };

  const subtractSingleUnit = (date: Date): Date => {
    switch (unit) {
      case "second":
        return addSeconds(date, -1);
      case "minute":
        return addMinutes(date, -1);
      case "hour":
        return addHours(date, -1);
      case "day":
        return addDays(date, -1);
      case "month":
        return addMonths(date, -1);
      case "year":
        return addYears(date, -1);
    }
  };

  // Work backwards from toDate to create bucket boundaries
  // Don't normalize toDate - use it as-is to ensure rightmost bucket includes "today"
  const normalizedTo = toDate;
  const buckets: Array<{
    start: Date;
    end: Date;
    dataPoints: T[];
  }> = [];

  let bucketEnd = normalizedTo;
  let iterations = 0;
  const maxIterations = 10000;

  // Create buckets going backwards
  while (bucketEnd >= fromDate && iterations < maxIterations) {
    iterations++;
    let bucketStart = bucketEnd;

    // Go back `count` units
    for (let i = 0; i < count - 1; i++) {
      bucketStart = subtractSingleUnit(bucketStart);
    }

    // Only include buckets that overlap with our date range
    if (bucketStart < normalizedTo) {
      buckets.unshift({
        start: bucketStart,
        end: bucketEnd,
        dataPoints: [],
      });
    }

    // Move to previous bucket
    for (let i = 0; i < count; i++) {
      bucketEnd = subtractSingleUnit(bucketEnd);
    }
  }

  // Assign data points to buckets
  for (const dataPoint of data) {
    const ts = toStartOfSingleUnit(dataPoint.timestamp);

    for (const bucket of buckets) {
      if (ts >= bucket.start && ts <= bucket.end) {
        bucket.dataPoints.push(dataPoint);
        break;
      }
    }
  }

  // Aggregate each bucket by SUMMING counts per category
  const aggregatedData: T[] = [];

  for (const bucket of buckets) {
    // Create a map: category -> total count
    const categoryCounts = new Map<string, number>();

    // Initialize all categories with 0
    for (const category of categories) {
      categoryCounts.set(category, 0);
    }

    // Sum up counts for each category in this bucket
    for (const dataPoint of bucket.dataPoints) {
      const currentCount = categoryCounts.get(dataPoint.category) ?? 0;
      categoryCounts.set(dataPoint.category, currentCount + dataPoint.count);
    }

    // Create output entries (one per category)
    for (const category of categories) {
      aggregatedData.push({
        timestamp: bucket.end,
        category,
        count: categoryCounts.get(category) ?? 0,
      } as T);
    }
  }

  return aggregatedData;
}
