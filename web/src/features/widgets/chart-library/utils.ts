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
 * Maps chart types to their human-readable display names.
 */
export function getChartTypeDisplayName(
  chartType: DashboardWidgetChartType,
  t: (key: string) => string,
): string {
  switch (chartType) {
    case "LINE_TIME_SERIES":
      return t("widget.chartTypes.lineTimeSeries");
    case "BAR_TIME_SERIES":
      return t("widget.chartTypes.barTimeSeries");
    case "HORIZONTAL_BAR":
      return t("widget.chartTypes.horizontalBar");
    case "VERTICAL_BAR":
      return t("widget.chartTypes.verticalBar");
    case "PIE":
      return t("widget.chartTypes.pie");
    case "NUMBER":
      return t("widget.chartTypes.number");
    case "HISTOGRAM":
      return t("widget.chartTypes.histogram");
    case "PIVOT_TABLE":
      return t("widget.chartTypes.pivotTable");
    default:
      return t("widget.chartTypes.unknown");
  }
}
