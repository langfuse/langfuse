import { type DataPoint } from "./chart-props";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  enrichDataWithDimensions,
  getDimensionCount,
  createCombinedDimensionKey,
  getUniqueDimensionValues,
  createDimensionLabelMap,
} from "@/src/features/widgets/utils/dimension-utils";

/**
 * Groups data by dimension to prepare it for time series breakdowns
 * Uses unified multi-dimensional approach for all data
 * @param data - Array of DataPoint objects
 * @returns Grouped data ready for time series chart rendering
 */
export const groupDataByTimeDimension = (data: DataPoint[]) => {
  // Always use multi-dimensional grouping (handles single dimensions too)
  return groupTimeSeriesDataByMultiDimension(data);
};

/**
 * Gets unique dimensions for legend generation and chart configuration
 * Uses unified approach with combined dimension keys
 * @param data - Array of DataPoint objects
 * @returns Array of unique combined dimension keys
 */
export const getUniqueDimensions = (data: DataPoint[]) => {
  const uniqueCombined = new Set<string>();
  const enrichedData = enrichDataWithDimensions(data);

  enrichedData.forEach((item: DataPoint) => {
    if (item.combinedDimension) {
      uniqueCombined.add(item.combinedDimension);
    }
  });

  return Array.from(uniqueCombined);
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
 * Multi-dimensional time series data grouping for enhanced time series charts
 * Handles any number of dimensions by creating combined dimension keys
 * @param data - Array of enriched DataPoint objects with combined dimension keys
 * @returns Grouped data ready for multi-dimensional time series rendering
 */
export const groupTimeSeriesDataByMultiDimension = (data: DataPoint[]) => {
  // Enrich data with combined dimension keys if not already done
  const enrichedData = data[0]?.combinedDimension
    ? data
    : enrichDataWithDimensions(data);

  // Group by time and combined dimensions
  const timeGroups = enrichedData.reduce(
    (acc: Record<string, Record<string, number>>, item: DataPoint) => {
      const time = item.time_dimension || "Unknown";
      const dimKey = item.combinedDimension || "Unknown";

      if (!acc[time]) {
        acc[time] = {};
      }

      acc[time][dimKey] = (acc[time][dimKey] || 0) + (item.metric as number);

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

/**
 * Groups data for grouped bar chart rendering (multi-dimensional)
 * Creates nested structure where first dimension groups bars, subsequent dimensions create sub-bars
 * @param data - Array of enriched DataPoint objects
 * @returns Data structure ready for grouped bar chart rendering
 */
export const groupDataForGroupedBars = (data: DataPoint[]) => {
  const enrichedData = data[0]?.combinedDimension
    ? data
    : enrichDataWithDimensions(data);

  // Group by first dimension to create main bar groups
  const firstDimGroups = enrichedData.reduce(
    (acc: Record<string, DataPoint[]>, item: DataPoint) => {
      if (!item.dimensions || item.dimensions.length === 0) return acc;

      const firstDimKey = item.dimensions[0] || "Unknown";
      if (!acc[firstDimKey]) {
        acc[firstDimKey] = [];
      }
      acc[firstDimKey].push(item);
      return acc;
    },
    {},
  );

  // Transform to Recharts grouped bar format
  return Object.entries(firstDimGroups).map(([firstDim, items]) => {
    const barData: any = { category: firstDim };

    items.forEach((item) => {
      // Create sub-group key from remaining dimensions
      const subGroupKey =
        item.dimensions && item.dimensions.length > 1
          ? item.dimensions.slice(1).join("-") || "default"
          : "default";

      barData[subGroupKey] =
        (barData[subGroupKey] || 0) + (item.metric as number);
    });

    return barData;
  });
};

/**
 * Processes data for nested donut chart rendering (multi-dimensional pie charts)
 * Creates inner ring (first dimension) and outer ring (dimension combinations)
 * @param data - Array of enriched DataPoint objects
 * @returns Object with innerRingData and outerRingData for nested donut rendering
 */
export const processNestedDonutData = (data: DataPoint[]) => {
  const enrichedData = data[0]?.combinedDimension
    ? data
    : enrichDataWithDimensions(data);

  // Inner ring: Aggregate by first dimension
  const innerRingMap = enrichedData.reduce(
    (acc: Record<string, number>, item: DataPoint) => {
      const firstDim = item.dimensions?.[0] || "Unknown";
      acc[firstDim] = (acc[firstDim] || 0) + (item.metric as number);
      return acc;
    },
    {},
  );

  const innerRingData = Object.entries(innerRingMap).map(
    ([name, value], index) => ({
      name,
      value,
      fill: `hsl(var(--chart-${(index % 4) + 1}))`,
    }),
  );

  // Outer ring: Use combined dimension keys
  const outerRingData = enrichedData.map((item, index) => {
    // Create display label for the combination
    const displayLabel = item.dimensions
      ? item.dimensions.filter((d) => d).join(" - ")
      : item.combinedDimension || "Unknown";

    return {
      name: displayLabel,
      value: item.metric as number,
      fill: `hsl(var(--chart-${(index % 4) + 1}))`,
    };
  });

  return { innerRingData, outerRingData };
};

/**
 * Generic data processing function that routes to appropriate chart-specific processing
 * Auto-detects dimension count and applies correct transformation
 * @param data - Array of DataPoint objects
 * @param chartType - Type of chart for specialized processing
 * @returns Processed data ready for chart rendering
 */
export const processDataForChartType = (
  data: DataPoint[],
  chartType: DashboardWidgetChartType,
) => {
  const dimensionCount = getDimensionCount(data);

  // No dimensional processing needed for these chart types
  if (chartType === "NUMBER" || chartType === "HISTOGRAM") {
    return data;
  }

  // Route to appropriate processing based on chart type and dimension count
  if (dimensionCount === 0) {
    // No dimensions - return data as-is
    return data;
  }

  // Dimensional processing based on chart type
  switch (chartType) {
    case "HORIZONTAL_BAR":
    case "VERTICAL_BAR":
      return dimensionCount > 1
        ? groupDataForGroupedBars(data)
        : enrichDataWithDimensions(data);
    case "PIE":
      return dimensionCount > 1
        ? processNestedDonutData(data)
        : enrichDataWithDimensions(data);
    case "LINE_TIME_SERIES":
    case "BAR_TIME_SERIES":
      return groupTimeSeriesDataByMultiDimension(data);
    case "PIVOT_TABLE":
      // Pivot tables handle multi-dimensional data internally
      return data;
    default:
      return enrichDataWithDimensions(data);
  }
};

/**
 * Gets sub-group keys for grouped bar charts (used for legend generation)
 * @param processedData - Data processed by groupDataForGroupedBars
 * @returns Array of unique sub-group keys for bar chart series
 */
export const getSubGroupKeys = (processedData: any[]): string[] => {
  const keys = new Set<string>();

  processedData.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (key !== "category") {
        // Exclude the category key
        keys.add(key);
      }
    });
  });

  return Array.from(keys).sort();
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
