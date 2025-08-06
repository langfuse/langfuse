import { type DataPoint } from "./chart-props";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

/**
 * Transforms a raw field value into a string suitable for dimension display
 * Handles various data types and edge cases consistently
 * @param val - Raw field value from query results
 * @returns Formatted string value
 */
export const formatDimensionValue = (val: any): string => {
  if (typeof val === "string") return val;
  if (val === null || val === undefined || val === "") return "n/a";
  if (Array.isArray(val)) return val.join(", ");
  // Objects / numbers / booleans are stringified to avoid React key issues
  return String(val);
};

/**
 * Transforms raw query results into DataPoint format for chart rendering
 * Centralized logic for consistent data transformation across widgets
 * @param queryData - Raw query results from API
 * @param config - Chart configuration
 * @returns Array of DataPoint objects ready for chart rendering
 */
export const transformQueryDataToChartData = (
  queryData: any[],
  config: {
    chartType: DashboardWidgetChartType;
    dimensions: string[] | { field: string }[];
    metrics?: { measure: string; agg: string }[];
    selectedAggregation?: string;
    selectedMeasure?: string;
  },
): DataPoint[] => {
  return queryData.map((item: any) => {
    // Extract dimension field names (handle both string[] and {field: string}[] formats)
    const dimensionFields = config.dimensions.map((dim) =>
      typeof dim === "string" ? dim : dim.field,
    );

    if (config.chartType === "PIVOT_TABLE") {
      // For pivot tables, preserve all raw data fields
      // The PivotTable component will extract the appropriate metric fields
      return {
        dimensions: dimensionFields.map((dim) =>
          formatDimensionValue(item[dim]),
        ),
        metric: 0, // Placeholder - not used for pivot tables
        time_dimension: item["time_dimension"],
        // Include all original query fields for pivot table processing
        ...item,
      };
    } else {
      // Regular chart processing for multi-dimensional support
      const metric = config.metrics?.slice().shift() ?? {
        measure: config.selectedMeasure || "count",
        agg: config.selectedAggregation || "count",
      };
      const metricField = `${metric.agg}_${metric.measure}`;
      const metricValue = item[metricField];

      // Transform all selected dimensions into the dimensions array
      const transformedDimensions = dimensionFields.map((dimensionField) => {
        if (item[dimensionField] !== undefined && dimensionField !== "none") {
          return formatDimensionValue(item[dimensionField]);
        }
        return "n/a";
      });

      return {
        dimensions:
          transformedDimensions.length > 0 ? transformedDimensions : ["n/a"],
        metric: Array.isArray(metricValue)
          ? metricValue
          : Number(metricValue || 0),
        time_dimension: item["time_dimension"],
      };
    }
  });
};

/**
 * Groups data by dimension to prepare it for time series breakdowns
 * Uses unified multi-dimensional approach for all data
 * @param data - Array of DataPoint objects
 * @returns Grouped data ready for time series chart rendering
 */
export const groupDataByTimeDimension = (data: DataPoint[]) => {
  // Always use multi-dimensional grouping (handles single dimensions too)
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
      return groupDataByTimeDimension(data);
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

/**
 * Creates a combined dimension key by joining multiple dimension values with pipe separator
 * Filters out empty/null values and provides "Unknown" fallback for completely empty keys
 *
 * @param dimensions - Array of dimension values (can include null/undefined)
 * @returns Combined dimension key string (e.g., "production|gpt-4" or "Unknown")
 *
 * @example
 * ```typescript
 * createCombinedDimensionKey(["production", "gpt-4"]) // "production|gpt-4"
 * createCombinedDimensionKey(["staging", null]) // "staging"
 * createCombinedDimensionKey([null, null]) // "Unknown"
 * createCombinedDimensionKey([]) // "Unknown"
 * ```
 */
export const createCombinedDimensionKey = (
  dimensions: (string | null | undefined)[],
): string => {
  const filteredDimensions = dimensions
    .filter((d): d is string => d != null && d.trim() !== "")
    .map((d) => d.trim());

  return filteredDimensions.length > 0
    ? filteredDimensions.join("|")
    : "Unknown";
};

/**
 * Enriches data points with combined dimension keys for grouping and display
 * Adds combinedDimension property based on the dimensions array
 *
 * @param data - Array of DataPoint objects to enrich
 * @returns Enriched data with combinedDimension property added
 *
 * @example
 * ```typescript
 * const data = [
 *   { dimensions: ["production", "gpt-4"], metric: 100, time_dimension: undefined },
 *   { dimensions: ["staging"], metric: 50, time_dimension: undefined },
 *   { dimensions: [], metric: 25, time_dimension: undefined }
 * ];
 *
 * const enriched = enrichDataWithDimensions(data);
 * // Results: "production|gpt-4", "staging", "Unknown" respectively
 * ```
 */
export const enrichDataWithDimensions = (data: DataPoint[]): DataPoint[] => {
  return data.map((item) => ({
    ...item,
    combinedDimension: createCombinedDimensionKey(item.dimensions),
  }));
};

/**
 * Detects the number of dimensions in a dataset for auto-rendering logic
 * Uses the unified dimensions array approach
 *
 * @param data - Array of DataPoint objects to analyze
 * @returns Number of dimensions detected (0 for no dimensions, 1+ for dimensional data)
 *
 * @example
 * ```typescript
 * // Multi-dimensional data
 * getDimensionCount([{ dimensions: ["env", "model"], metric: 100 }]) // 2
 *
 * // Single-dimensional data
 * getDimensionCount([{ dimensions: ["production"], metric: 100 }]) // 1
 *
 * // No dimensional data
 * getDimensionCount([{ dimensions: [], metric: 100 }]) // 0
 *
 * // Empty dataset
 * getDimensionCount([]) // 0
 * ```
 */
export const getDimensionCount = (data: DataPoint[]): number => {
  if (!data || data.length === 0) return 0;

  const firstItem = data[0];
  return firstItem.dimensions.length;
};
