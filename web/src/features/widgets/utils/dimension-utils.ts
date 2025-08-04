/**
 * @fileoverview Multi-dimension utility functions for chart widgets
 *
 * This module provides core utilities for processing multi-dimensional data that will be
 * shared across all chart types. It handles dimension key creation, data enrichment,
 * and dimension counting to support unified multi-breakdown functionality.
 *
 * Key Features:
 * - Generic dimension key creation for any number of dimensions
 * - Data enrichment with combined dimension keys
 * - Dimension count detection for auto-rendering logic
 * - Backward compatibility with existing single-dimension data
 * - Support for null/undefined dimension values with proper fallbacks
 *
 * Usage:
 * - Used by all chart components for multi-dimensional data processing
 * - Integrated with data transformation pipeline for chart rendering
 * - Supports future expansion beyond current 2-dimension limit
 */

import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

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
 * Parses a combined dimension key back into individual dimension components
 * Handles edge cases like empty keys and malformed keys gracefully
 *
 * @param combinedKey - Combined dimension key string (e.g., "production|gpt-4")
 * @returns Array of individual dimension values
 *
 * @example
 * ```typescript
 * parseCombinedDimensionKey("production|gpt-4") // ["production", "gpt-4"]
 * parseCombinedDimensionKey("staging") // ["staging"]
 * parseCombinedDimensionKey("Unknown") // []
 * parseCombinedDimensionKey("") // []
 * ```
 */
export const parseCombinedDimensionKey = (combinedKey: string): string[] => {
  if (!combinedKey || combinedKey.trim() === "" || combinedKey === "Unknown") {
    return [];
  }

  return combinedKey
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "");
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

/**
 * Validates that dimension arrays are consistent across all data points
 * Ensures data integrity for multi-dimensional processing
 *
 * @param data - Array of DataPoint objects to validate
 * @returns Object with validation results and error details
 *
 * @example
 * ```typescript
 * const validation = validateDimensionConsistency(data);
 * if (!validation.isValid) {
 *   console.error("Dimension validation failed:", validation.errors);
 * }
 * ```
 */
export const validateDimensionConsistency = (
  data: DataPoint[],
): {
  isValid: boolean;
  errors: string[];
  dimensionCount: number;
} => {
  if (!data || data.length === 0) {
    return { isValid: true, errors: [], dimensionCount: 0 };
  }

  const errors: string[] = [];
  const firstItem = data[0];
  const expectedDimensionCount = getDimensionCount([firstItem]);

  // Check consistency across all data points
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const itemDimensionCount = getDimensionCount([item]);

    if (itemDimensionCount !== expectedDimensionCount) {
      errors.push(
        `Data point ${i} has ${itemDimensionCount} dimensions, expected ${expectedDimensionCount}`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    dimensionCount: expectedDimensionCount,
  };
};

/**
 * Extracts unique dimension values from dataset for legend generation
 * Useful for creating consistent color mappings and legend entries
 *
 * @param data - Array of DataPoint objects to analyze
 * @param dimensionIndex - Index of dimension to extract (0-based)
 * @returns Array of unique dimension values at the specified index
 *
 * @example
 * ```typescript
 * // Extract unique values for first dimension (environments)
 * getUniqueDimensionValues(data, 0) // ["production", "staging"]
 *
 * // Extract unique values for second dimension (models)
 * getUniqueDimensionValues(data, 1) // ["gpt-4", "gpt-3.5", "claude"]
 * ```
 */
export const getUniqueDimensionValues = (
  data: DataPoint[],
  dimensionIndex: number,
): string[] => {
  if (!data || data.length === 0) return [];

  const values = new Set<string>();

  for (const item of data) {
    if (item.dimensions && item.dimensions.length > dimensionIndex) {
      const value = item.dimensions[dimensionIndex];
      if (value != null && value.trim() !== "") {
        values.add(value.trim());
      }
    }
  }

  return Array.from(values).sort();
};

/**
 * Creates a mapping of combined dimension keys to display labels
 * Useful for legend generation and tooltip display
 *
 * @param data - Array of DataPoint objects to process
 * @param separator - Separator to use between dimension values (default: " - ")
 * @returns Map of combined keys to formatted display labels
 *
 * @example
 * ```typescript
 * const labelMap = createDimensionLabelMap(data, " - ");
 * // Result: { "production|gpt-4": "production - gpt-4", "staging|claude": "staging - claude" }
 * ```
 */
export const createDimensionLabelMap = (
  data: DataPoint[],
  separator: string = " - ",
): Record<string, string> => {
  const labelMap: Record<string, string> = {};

  for (const item of data) {
    if (item.combinedDimension && item.dimensions) {
      const displayLabel = item.dimensions
        .filter((d) => d != null && d.trim() !== "")
        .join(separator);
      labelMap[item.combinedDimension] = displayLabel || "Unknown";
    }
  }

  return labelMap;
};
