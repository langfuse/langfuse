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

import { MAX_PIVOT_TABLE_DIMENSIONS } from "@langfuse/shared";

/**
 * Default row limit for pivot table data rows (excluding total rows)
 * This prevents performance issues with large datasets while maintaining
 * useful data visibility.
 */
export const DEFAULT_ROW_LIMIT = 20;

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
 * Validates that the dimension count doesn't exceed the configured maximum
 *
 * @param dimensions - Array of dimension names to validate
 * @throws Error if dimension count exceeds MAX_PIVOT_TABLE_DIMENSIONS
 */
export function validateDimensionCount(dimensions: string[]): void {
  if (dimensions.length > MAX_PIVOT_TABLE_DIMENSIONS) {
    throw new Error(
      `Cannot create pivot table with ${dimensions.length} dimensions. ` +
        `Maximum supported dimensions: ${MAX_PIVOT_TABLE_DIMENSIONS}`,
    );
  }
}

/**
 * Validates that the provided configuration is valid for pivot table generation
 *
 * @param config - Pivot table configuration to validate
 * @throws Error if configuration is invalid
 */
export function validatePivotTableConfig(config: PivotTableConfig): void {
  validateDimensionCount(config.dimensions);

  if (config.metrics.length === 0) {
    throw new Error("At least one metric is required for pivot table");
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
 * Placeholder function for transforming flat query results into pivot table structure
 * This will be implemented in Step 4: Data Transformation Engine
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
 * // Returns structured rows with subtotals and grand totals
 * ```
 */
export function transformToPivotTable(
  data: DatabaseRow[],
  config: PivotTableConfig,
): PivotTableRow[] {
  // Validate configuration
  validatePivotTableConfig(config);

  // TODO: Implement in Step 4 - Data Transformation Engine
  // This function will handle:
  // 1. Grouping data by dimensions
  // 2. Calculating subtotals for each dimension level
  // 3. Generating grand totals
  // 4. Applying row limits
  // 5. Creating properly nested structure with indentation levels

  console.warn("transformToPivotTable: Implementation pending - Step 4");

  // Return empty array for now
  return [];
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
      acc[metric] = typeof value === "number" ? value : 0;
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
