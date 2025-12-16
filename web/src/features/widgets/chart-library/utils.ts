import { type DataPoint } from "./chart-props";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

/**
 * Groups data by dimension to prepare it for time series breakdowns
 * @param data
 */
export const groupDataByTimeDimension = (data: DataPoint[]) => {
  // First, group by time_dimension
  const timeGroups = data.reduce(
    (acc: Record<string, Record<string, number>>, item: DataPoint) => {
      const time = item.time_dimension || "Unknown";
      if (!acc[time]) {
        acc[time] = {};
      }

      const dimension = item.dimension || "Unknown";
      acc[time][dimension] = item.metric as number;

      return acc;
    },
    {},
  );

  // Convert to array format for Recharts
  return Object.entries(timeGroups).map(([time, dimensions]) => ({
    time_dimension: time,
    ...dimensions,
  }));
};

export const getUniqueDimensions = (data: DataPoint[]) => {
  const uniqueDimensions = new Set<string>();
  data.forEach((item: DataPoint) => {
    if (item.dimension) {
      uniqueDimensions.add(item.dimension);
    }
  });
  return Array.from(uniqueDimensions);
};

export const isTimeSeriesChart = (
  chartType: DashboardWidgetChartType,
): boolean => {
  switch (chartType) {
    case "LINE_TIME_SERIES":
    case "BAR_TIME_SERIES":
      return true;
    case "HORIZONTAL_BAR":
    case "VERTICAL_BAR":
    case "PIE":
    case "HISTOGRAM":
    case "NUMBER":
    case "PIVOT_TABLE":
      return false;
    default:
      return false;
  }
};

// Used for a combination of YAxis styling workarounds as discussed in https://github.com/recharts/recharts/issues/2027#issuecomment-769674096.
export const formatAxisLabel = (label: string): string =>
  label.length > 13 ? label.slice(0, 13).concat("…") : label;

/**
 * Sorts data points by dimension, detecting if the dimension values are date-like
 * and sorting chronologically if so, otherwise falling back to localeCompare.
 */
export const sortDataByDimension = (data: DataPoint[]): DataPoint[] => {
  if (data.length === 0) return data;

  // Patterns for common date formats
  const monthPattern = /^\d{4}-\d{2}$/; // YYYY-MM
  const datePattern = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
  const isoPattern = /^\d{4}-\d{2}-\d{2}T/; // ISO datetime

  // Check if dimension values look like dates
  const sampleDimensions = data
    .slice(0, 5)
    .map((d) => d.dimension)
    .filter((d): d is string => typeof d === "string");

  const isDateLike = sampleDimensions.some(
    (d) => monthPattern.test(d) || datePattern.test(d) || isoPattern.test(d),
  );

  return [...data].sort((a, b) => {
    const dimA = a.dimension ?? "";
    const dimB = b.dimension ?? "";

    if (isDateLike) {
      // Parse as dates for chronological sorting
      let dateA: Date;
      let dateB: Date;

      if (monthPattern.test(dimA)) {
        dateA = new Date(`${dimA}-01T00:00:00.000Z`);
      } else {
        dateA = new Date(dimA);
      }

      if (monthPattern.test(dimB)) {
        dateB = new Date(`${dimB}-01T00:00:00.000Z`);
      } else {
        dateB = new Date(dimB);
      }

      // If parsing fails, fall back to string comparison
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        return dimA.localeCompare(dimB);
      }

      return dateA.getTime() - dateB.getTime();
    }

    // Default: alphabetical sort
    return dimA.localeCompare(dimB);
  });
};

/**
 * Maps chart types to their human-readable display names.
 */
export function getChartTypeDisplayName(
  chartType: DashboardWidgetChartType,
): string {
  switch (chartType) {
    case "LINE_TIME_SERIES":
      return "Line Chart (Time Series)";
    case "BAR_TIME_SERIES":
      return "Bar Chart (Time Series)";
    case "HORIZONTAL_BAR":
      return "Horizontal Bar Chart (Total Value)";
    case "VERTICAL_BAR":
      return "Vertical Bar Chart (Total Value)";
    case "PIE":
      return "Pie Chart (Total Value)";
    case "NUMBER":
      return "Big Number (Total Value)";
    case "HISTOGRAM":
      return "Histogram (Total Value)";
    case "PIVOT_TABLE":
      return "Pivot Table (Total Value)";
    default:
      return "Unknown Chart Type";
  }
}
