/**
 * Row height estimation for virtualization
 *
 * Provides height estimates for TanStack Virtual to optimize rendering.
 * Estimates are based on row content (string length, depth, etc.)
 */

import type { FlatJSONRow, RowHeightConfig, RowHeightEstimate } from "../types";

/**
 * Default row height configuration
 */
export const DEFAULT_ROW_HEIGHT_CONFIG: RowHeightConfig = {
  baseHeight: 24, // Base height for single-line rows
  longStringThreshold: 100, // Strings longer than this might wrap
  charsPerLine: 80, // Approximate characters per line when wrapped
};

/**
 * Estimate the height of a single row
 *
 * @param row - The row to estimate height for
 * @param config - Height configuration
 * @returns Height estimate with dynamic flag
 */
export function estimateRowHeight(
  row: FlatJSONRow,
  config: RowHeightConfig = DEFAULT_ROW_HEIGHT_CONFIG,
): RowHeightEstimate {
  const { baseHeight, longStringThreshold, charsPerLine } = config;

  // Expandable rows are always single line (just show preview)
  if (row.isExpandable) {
    return {
      height: baseHeight,
      isDynamic: false,
    };
  }

  // String values might wrap to multiple lines
  if (row.type === "string") {
    const str = row.value as string;

    // In nowrap/truncate modes, strings are always single line
    if (
      config.stringWrapMode === "nowrap" ||
      config.stringWrapMode === "truncate"
    ) {
      return {
        height: baseHeight,
        isDynamic: false,
      };
    }

    // In wrap mode: calculate multi-line heights for long strings
    // Short strings are single line
    if (str.length <= longStringThreshold) {
      return {
        height: baseHeight,
        isDynamic: false,
      };
    }

    // Long strings might wrap - estimate lines
    const estimatedLines = Math.ceil(str.length / charsPerLine);
    const cappedLines = Math.min(estimatedLines, 10); // Cap at 10 lines

    return {
      height: baseHeight * cappedLines,
      isDynamic: true, // Height might change based on container width
    };
  }

  // All other types are single line
  return {
    height: baseHeight,
    isDynamic: false,
  };
}

/**
 * Batch estimate heights for multiple rows
 * Returns a function that can be used by TanStack Virtual's estimateSize
 *
 * @param rows - All rows to estimate
 * @param config - Height configuration
 * @returns Function that returns height for a given index
 */
export function createHeightEstimator(
  rows: FlatJSONRow[],
  config: RowHeightConfig = DEFAULT_ROW_HEIGHT_CONFIG,
): (index: number) => number {
  // Pre-compute all height estimates
  const heights = rows.map((row) => estimateRowHeight(row, config).height);

  // Return estimator function
  return (index: number) => {
    return heights[index] ?? config.baseHeight;
  };
}

/**
 * Calculate total estimated height of all rows
 * Useful for determining if virtualization is needed
 *
 * @param rows - All rows
 * @param config - Height configuration
 * @returns Total estimated height in pixels
 */
export function calculateTotalHeight(
  rows: FlatJSONRow[],
  config: RowHeightConfig = DEFAULT_ROW_HEIGHT_CONFIG,
): number {
  return rows.reduce((total, row) => {
    return total + estimateRowHeight(row, config).height;
  }, 0);
}

/**
 * Determine if virtualization is recommended based on row count and height
 *
 * @param rows - All rows
 * @param config - Height configuration
 * @returns Whether virtualization is recommended
 */
export function shouldVirtualize(
  rows: FlatJSONRow[],
  config: RowHeightConfig = DEFAULT_ROW_HEIGHT_CONFIG,
): boolean {
  // Always virtualize if more than 500 rows
  if (rows.length > 500) return true;

  // Virtualize if total height exceeds 10,000 pixels (~4 screens)
  const totalHeight = calculateTotalHeight(rows, config);
  if (totalHeight > 10000) return true;

  // Check for very long strings that might cause layout issues
  const hasVeryLongStrings = rows.some((row) => {
    return (
      row.type === "string" &&
      (row.value as string).length > config.longStringThreshold * 5
    );
  });

  if (hasVeryLongStrings) return true;

  return false;
}

/**
 * Get statistics about row heights
 * Useful for debugging and optimization
 */
export interface HeightStats {
  minHeight: number;
  maxHeight: number;
  avgHeight: number;
  totalHeight: number;
  dynamicRows: number;
}

export function getHeightStats(
  rows: FlatJSONRow[],
  config: RowHeightConfig = DEFAULT_ROW_HEIGHT_CONFIG,
): HeightStats {
  if (rows.length === 0) {
    return {
      minHeight: 0,
      maxHeight: 0,
      avgHeight: 0,
      totalHeight: 0,
      dynamicRows: 0,
    };
  }

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let totalHeight = 0;
  let dynamicRows = 0;

  rows.forEach((row) => {
    const estimate = estimateRowHeight(row, config);
    const height = estimate.height;

    if (height < minHeight) minHeight = height;
    if (height > maxHeight) maxHeight = height;
    totalHeight += height;

    if (estimate.isDynamic) dynamicRows++;
  });

  return {
    minHeight,
    maxHeight,
    avgHeight: totalHeight / rows.length,
    totalHeight,
    dynamicRows,
  };
}

/**
 * Adjust row height based on measured dimensions
 * Can be used to improve estimates after initial render
 *
 * @param measuredHeight - Actual measured height from DOM
 * @param estimatedHeight - Previously estimated height
 * @returns Adjusted height for future estimates
 */
export function adjustHeightEstimate(
  measuredHeight: number,
  estimatedHeight: number,
): number {
  // If measurement is significantly different, use it directly
  const diff = Math.abs(measuredHeight - estimatedHeight);
  if (diff > 10) {
    return measuredHeight;
  }

  // Otherwise, blend measured and estimated (weighted average)
  return Math.round(estimatedHeight * 0.7 + measuredHeight * 0.3);
}
