/**
 * @fileoverview Utility functions and type definitions for Pivot Table widget functionality
 *
 * This module provides core utilities for transforming flat query results into nested
 * pivot table structures with configurable dimensions, subtotals, and grand totals.
 *
 * Key Features:
 * - Configurable maximum dimensions (currently limited to 2)
 * - Support for 0-N dimensions with proper nesting and indentation
 * - Automatic subtotal generation for first dimension level
 * - Grand total calculation across all metrics
 * - Row limiting to prevent performance issues
 *
 * Usage:
 * - Used by PivotTable React component for data transformation
 * - Integrated with QueryBuilder for SQL generation
 * - Supports future expansion beyond current 2-dimension limit
 */
import { isNotNullOrUndefined } from "@/src/utils/types";

/**
 * Default dimension limit for pivot table data rows
 * This prevents performance issues and maintains readability
 */
export const MAX_PIVOT_TABLE_DIMENSIONS = 2;

/**
 * Default row limit for pivot table data rows (excluding total rows)
 * This prevents performance issues with large datasets while maintaining
 * useful data visibility.
 */
export const DEFAULT_ROW_LIMIT = 20;

/**
 * Maximum number of metrics allowed in a pivot table
 * This prevents performance issues and maintains readability
 */
export const MAX_PIVOT_TABLE_METRICS = 10;

/**
 * Represents a single row in the processed pivot table structure
 * Supports different row types for data, subtotals, and grand totals
 * with appropriate styling and indentation levels.
 */
export interface PivotTableRow {
  /** Unique identifier for this row */
  id: string;

  /** Type of row determines styling and behavior */
  type: "data" | "subtotal" | "total";

  /** Indentation level for nested dimensions (0-based) */
  level: number;

  /** Display label for the row (dimension value or "Total"/"Subtotal") */
  label: string;

  /** Metric values for this row, keyed by metric name */
  values: Record<string, number | string>;

  /** Whether this row represents a subtotal */
  isSubtotal?: boolean;

  /** Whether this row represents the grand total */
  isTotal?: boolean;

  /** Original dimension values for this row (for data rows only) */
  dimensionValues?: Record<string, string>;
}

/**
 * Configuration for pivot table data transformation
 * Defines the structure and limits for the resulting table
 */
export interface PivotTableConfig {
  /** Array of dimension field names (max length = MAX_PIVOT_TABLE_DIMENSIONS) */
  dimensions: string[];

  /** Array of metric field names to display as columns */
  metrics: string[];

  /** Maximum number of data rows to display (before totals) */
  rowLimit?: number;
}

/**
 * Raw database row structure from query results
 * Contains dimension values and metric calculations
 */
export interface DatabaseRow {
  /** Dimension field values */
  [dimensionField: string]: string | number | null;
}

/**
 * Validates that the provided configuration is valid for pivot table generation
 *
 * @param config - Pivot table configuration to validate
 * @throws Error if configuration is invalid
 */
export function validatePivotTableConfig(config: PivotTableConfig): void {
  if (config.dimensions.length > MAX_PIVOT_TABLE_DIMENSIONS) {
    throw new Error(
      `Cannot create pivot table with ${config.dimensions.length} dimensions. ` +
        `Maximum supported dimensions: ${MAX_PIVOT_TABLE_DIMENSIONS}`,
    );
  }

  if (config.metrics.length === 0) {
    throw new Error("At least one metric is required for pivot table");
  }

  if (config.metrics.length > MAX_PIVOT_TABLE_METRICS) {
    throw new Error(
      `Cannot create pivot table with ${config.metrics.length} metrics. ` +
        `Maximum supported metrics: ${MAX_PIVOT_TABLE_METRICS}`,
    );
  }

  if (config.rowLimit !== undefined && config.rowLimit <= 0) {
    throw new Error("Row limit must be a positive number");
  }
}

/**
 * Generates a unique row ID for pivot table rows
 * Uses dimension values and row type to create stable identifiers
 *
 * @param dimensionValues - Values for each dimension field
 * @param type - Type of row (data, subtotal, total)
 * @param level - Indentation level for the row
 * @returns Unique string identifier for the row
 */
export function generateRowId(
  dimensionValues: Record<string, string>,
  type: PivotTableRow["type"],
  level: number,
): string {
  const valueKey = Object.entries(dimensionValues)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");

  return `${type}-${level}-${valueKey}`;
}

/**
 * Creates an empty metric values object with all metrics set to 0
 * Used as a fallback for rows with missing data
 *
 * @param metrics - Array of metric field names
 * @returns Object with all metrics initialized to 0
 */
export function createEmptyMetricValues(
  metrics: string[],
): Record<string, number> {
  return metrics.reduce(
    (acc, metric) => {
      acc[metric] = 0;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * Recursively processes dimensions to create nested pivot table structure
 * This function handles N dimensions dynamically instead of hardcoded cases
 *
 * @param data - Array of database rows to process at this level
 * @param remainingDimensions - Array of dimension names still to be processed
 * @param metrics - Array of metric field names
 * @param currentLevel - Current indentation level (0-based)
 * @param dimensionPath - Array of dimension values from parent levels for labeling
 * @returns Array of pivot table rows for this level and all nested levels
 */
function processLevelRecursively(
  data: DatabaseRow[],
  remainingDimensions: string[],
  metrics: string[],
  totalDimensions: number,
  dimensionPath: string[],
): PivotTableRow[] {
  const rows: PivotTableRow[] = [];
  const currentDimensionIndex = totalDimensions - remainingDimensions.length;

  // Base case: no more dimensions to process, create data rows
  if (remainingDimensions.length === 0) {
    // Data rows should be at level (totalDimensions - 1) for proper indentation
    const dataLevel = Math.max(0, totalDimensions - 1);

    // Create data rows for the final level
    const dataRows = data.map((row, index) => {
      const dimensionValues = extractDimensionValues(row, []);
      const metricValues = extractMetricValues(row, metrics);

      // Create label from dimension path (all parent dimension values)
      const label =
        dimensionPath.length > 0 ? dimensionPath.join(" - ") : "Data";

      return {
        id: `data-${dataLevel}-${dimensionPath.join("-")}-${index}`,
        type: "data" as const,
        level: dataLevel,
        label,
        values: metricValues,
        dimensionValues,
      };
    });

    return dataRows;
  }

  // Recursive case: process current dimension and recurse on remaining dimensions
  const [currentDimension, ...nextDimensions] = remainingDimensions;
  const groups = groupDataByDimension(data, currentDimension!);
  const sortedGroups = Object.entries(groups).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [dimensionValue, groupData] of sortedGroups) {
    const newDimensionPath = [...dimensionPath, dimensionValue];

    // Add subtotal row for this dimension group BEFORE processing child rows
    // Only if there are more dimensions to process (not the deepest level)
    if (nextDimensions.length > 0 && groupData.length > 0) {
      const subtotalValues = calculateSubtotals(groupData, metrics);
      const subtotalRow = createSubtotalRow(
        dimensionValue,
        subtotalValues,
        currentDimensionIndex, // Subtotals at current dimension level
      );
      rows.push(subtotalRow);
    }

    // Recursively process remaining dimensions for this group
    const childRows = processLevelRecursively(
      groupData,
      nextDimensions,
      metrics,
      totalDimensions,
      newDimensionPath,
    );

    rows.push(...childRows);
  }

  return rows;
}

/**
 * Transforms flat query results into nested pivot table structure with totals and subtotals
 * Uses a recursive algorithm to handle N dimensions dynamically instead of hardcoded cases
 *
 * Features:
 * - Supports any number of dimensions up to MAX_PIVOT_TABLE_DIMENSIONS
 * - Creates subtotals at each dimension level except the deepest
 * - Proper indentation and nesting for hierarchical data
 * - Grand total calculation across all data
 * - Row limiting applied before processing for performance
 *
 * Algorithm:
 * 1. Recursively groups data by each dimension in order
 * 2. At each level, processes remaining dimensions for nested structure
 * 3. Adds subtotals for non-leaf dimension groups
 * 4. Creates data rows at the deepest level with full dimension path
 * 5. Appends grand total row at the end
 *
 * @param data - Array of raw database rows from query
 * @param config - Configuration for pivot table generation
 * @returns Array of processed rows ready for table rendering
 *
 * @example
 * ```typescript
 * const data = [
 *   { userId: "user1", country: "US", count: 10, avg_score: 85 },
 *   { userId: "user2", country: "US", count: 5, avg_score: 90 },
 *   { userId: "user3", country: "CA", count: 8, avg_score: 78 }
 * ];
 *
 * const config = {
 *   dimensions: ["country", "userId"],
 *   metrics: ["count", "avg_score"],
 *   rowLimit: 20
 * };
 *
 * const result = transformToPivotTable(data, config);
 * // Returns:
 * // 1. Data rows for each user grouped by country
 * // 2. Subtotal rows for each country
 * // 3. Grand total row for all data
 * ```
 */
export function transformToPivotTable(
  data: DatabaseRow[],
  config: PivotTableConfig,
): PivotTableRow[] {
  // Validate configuration
  validatePivotTableConfig(config);

  const { dimensions, metrics, rowLimit = DEFAULT_ROW_LIMIT } = config;

  // Handle empty data
  if (data.length === 0) {
    return [createGrandTotalRow(metrics, createEmptyMetricValues(metrics))];
  }

  // Handle zero dimensions - just return grand total
  if (dimensions.length === 0) {
    const grandTotalValues = calculateGrandTotals(data, metrics);
    return [createGrandTotalRow(metrics, grandTotalValues)];
  }

  // Apply row limit to data before processing
  const limitedData = data.slice(0, rowLimit);

  // Add grand total row at the beginning
  const grandTotalValues = calculateGrandTotals(limitedData, metrics);
  const grandTotalRow = createGrandTotalRow(metrics, grandTotalValues);

  // Process dimensions recursively
  const pivotRows = processLevelRecursively(
    limitedData,
    dimensions,
    metrics,
    dimensions.length, // total number of dimensions
    [], // dimension path for labeling
  );

  return [grandTotalRow, ...pivotRows];
}

/**
 * Utility function to get dimension values from a database row
 * Extracts only the specified dimension fields from the row data
 *
 * @param row - Database row containing all field values
 * @param dimensions - Array of dimension field names to extract
 * @returns Object containing only dimension field values
 */
export function extractDimensionValues(
  row: DatabaseRow,
  dimensions: string[],
): Record<string, string> {
  return dimensions.reduce(
    (acc, dimension) => {
      const value = row[dimension];
      acc[dimension] = value?.toString() ?? "";
      return acc;
    },
    {} as Record<string, string>,
  );
}

/**
 * Utility function to get metric values from a database row
 * Extracts only the specified metric fields from the row data
 *
 * @param row - Database row containing all field values
 * @param metrics - Array of metric field names to extract
 * @returns Object containing only metric field values
 */
export function extractMetricValues(
  row: DatabaseRow,
  metrics: string[],
): Record<string, number> {
  return metrics.reduce(
    (acc, metric) => {
      const value = row[metric];
      if (typeof value === "number") {
        acc[metric] = value;
      } else if (typeof value === "string") {
        const parsedValue = parseFloat(value);
        acc[metric] = isNaN(parsedValue) ? 0 : parsedValue;
      } else {
        acc[metric] = 0;
      }
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * Type guard to check if a row is a data row (not subtotal or total)
 *
 * @param row - Pivot table row to check
 * @returns True if the row contains actual data, false for summary rows
 */
export function isDataRow(row: PivotTableRow): boolean {
  return row.type === "data";
}

/**
 * Type guard to check if a row is a subtotal row
 *
 * @param row - Pivot table row to check
 * @returns True if the row is a subtotal, false otherwise
 */
export function isSubtotalRow(row: PivotTableRow): boolean {
  return row.type === "subtotal" || row.isSubtotal === true;
}

/**
 * Type guard to check if a row is the grand total row
 *
 * @param row - Pivot table row to check
 * @returns True if the row is the grand total, false otherwise
 */
export function isTotalRow(row: PivotTableRow): boolean {
  return row.type === "total" || row.isTotal === true;
}

/**
 * Groups data by a single dimension field
 * Used for creating single-level groupings in pivot table
 *
 * @param data - Array of database rows to group
 * @param dimensionField - Field name to group by
 * @returns Object with dimension values as keys and arrays of rows as values
 */
export function groupDataByDimension(
  data: DatabaseRow[],
  dimensionField: string,
): Record<string, DatabaseRow[]> {
  return data.reduce(
    (acc, row) => {
      const dimensionValue =
        (row[dimensionField]?.toString() ?? "").trim() || "n/a";
      if (!acc[dimensionValue]) {
        acc[dimensionValue] = [];
      }
      acc[dimensionValue]!.push(row);
      return acc;
    },
    {} as Record<string, DatabaseRow[]>,
  );
}

/**
 * Detects the aggregation type from a metric field name
 * Parses field names like "count_count", "avg_latency", "sum_tokens", "p95_duration"
 *
 * @param metricName - The metric field name to analyze
 * @returns The aggregation type (count, sum, avg, min, max, p95, etc.)
 */
function detectAggregationType(metricName: string): string {
  // Extract the aggregation prefix from field names like "count_count", "avg_latency"
  const parts = metricName.split("_");
  if (parts.length >= 2) {
    const prefix = parts[0]?.toLowerCase();
    // Map common aggregation prefixes
    switch (prefix) {
      case "count":
        return "count";
      case "sum":
        return "sum";
      case "avg":
      case "average":
        return "avg";
      case "min":
        return "min";
      case "max":
        return "max";
      case "p95":
      case "p99":
      case "p50":
        return "percentile";
      default:
        // Default to sum for unknown aggregations
        return "sum";
    }
  }

  // Default to sum if we can't determine the type
  return "sum";
}

/**
 * Applies the correct aggregation function based on the aggregation type
 *
 * @param values - Array of numeric values to aggregate
 * @param aggregationType - The type of aggregation to perform
 * @returns The aggregated result
 */
function applyAggregation(values: number[], aggregationType: string): number {
  if (values.length === 0) return 0;

  switch (aggregationType) {
    case "count":
    case "sum":
      return values.reduce((sum, val) => sum + val, 0);

    case "avg":
      return values.reduce((sum, val) => sum + val, 0) / values.length;

    case "min":
      return Math.min(...values);

    case "max":
      return Math.max(...values);

    case "percentile":
      // For percentiles in subtotals/totals, we'll use the average of the percentile values
      // This is a reasonable approximation since we can't recalculate the true percentile
      return values.reduce((sum, val) => sum + val, 0) / values.length;

    default:
      // Default to sum
      return values.reduce((sum, val) => sum + val, 0);
  }
}

/**
 * Calculates subtotals for a group of data rows
 * Aggregates metric values across all rows in the group using the correct aggregation function
 *
 * @param data - Array of database rows to calculate subtotals for
 * @param metrics - Array of metric field names to aggregate
 * @returns Object with metric names as keys and calculated totals as values
 */
export function calculateSubtotals(
  data: DatabaseRow[],
  metrics: string[],
): Record<string, number> {
  const subtotals: Record<string, number> = {};

  for (const metric of metrics) {
    // Extract all values for this metric using the utility function
    const values = data
      .map((row) => extractMetricValues(row, [metric])[metric])
      .filter(isNotNullOrUndefined);

    // Detect aggregation type and apply correct function
    const aggregationType = detectAggregationType(metric);
    const result = applyAggregation(values, aggregationType);

    // Round to 10 decimal places to avoid floating-point precision issues
    subtotals[metric] = Math.round(result * 1e10) / 1e10;
  }

  return subtotals;
}

/**
 * Calculates grand totals across all data rows
 * Aggregates metric values across the entire dataset
 *
 * @param data - Array of database rows to calculate grand totals for
 * @param metrics - Array of metric field names to aggregate
 * @returns Object with metric names as keys and calculated grand totals as values
 */
export function calculateGrandTotals(
  data: DatabaseRow[],
  metrics: string[],
): Record<string, number> {
  return calculateSubtotals(data, metrics);
}

/**
 * Creates a subtotal row for a specific dimension group
 * Generates subtotal row with appropriate styling and values
 *
 * @param dimensionValue - The dimension value this subtotal represents
 * @param subtotalValues - Calculated subtotal values for metrics
 * @param level - Indentation level for the row
 * @returns Formatted pivot table subtotal row
 */
export function createSubtotalRow(
  dimensionValue: string,
  subtotalValues: Record<string, number>,
  level: number,
): PivotTableRow {
  const dimensionValues = { subtotal: dimensionValue };

  return {
    id: generateRowId(dimensionValues, "subtotal", level),
    type: "subtotal",
    level,
    label: `${dimensionValue} (Subtotal)`,
    values: subtotalValues,
    isSubtotal: true,
    dimensionValues,
  };
}

/**
 * Creates the grand total row for the pivot table
 * Generates final total row with all metric grand totals
 *
 * @param metrics - Array of metric field names
 * @param grandTotalValues - Calculated grand total values for metrics
 * @returns Formatted pivot table grand total row
 */
export function createGrandTotalRow(
  metrics: string[],
  grandTotalValues: Record<string, number>,
): PivotTableRow {
  const dimensionValues = { total: "grand" };

  return {
    id: generateRowId(dimensionValues, "total", 0),
    type: "total",
    level: 0,
    label: "Total",
    values: grandTotalValues,
    isTotal: true,
    dimensionValues,
  };
}
