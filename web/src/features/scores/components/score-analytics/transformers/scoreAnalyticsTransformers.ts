/**
 * Pure transformation functions for score analytics data
 * Extracted from analytics.tsx, SingleScoreAnalytics, TwoScoreAnalytics
 * to eliminate duplication and enable testing
 */

import type { RouterOutputs } from "@/src/utils/api";
import {
  generateNumericHeatmapData,
  generateConfusionMatrixData,
} from "@/src/features/scores/components/score-analytics/libs/heatmap-utils";

// Type aliases for cleaner code
type ConfusionMatrixRow = {
  rowCategory: string;
  colCategory: string;
  count: number;
};

type StackedDistributionRow = {
  score1Category: string;
  score2Stack: string;
  count: number;
};

type Distribution = Array<{ binIndex: number; count: number }>;

type DataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

/**
 * Extract unique categories from score analytics data
 *
 * For numeric scores, returns undefined.
 * For categorical/boolean scores, extracts category names from:
 * 1. stackedDistribution (preferred for comparisons)
 * 2. confusionMatrix (fallback)
 * 3. Hardcoded ["False", "True"] for boolean
 *
 * Categories are returned in alphabetical order.
 *
 * @param params - Configuration object
 * @param params.dataType - Score data type (NUMERIC, CATEGORICAL, BOOLEAN)
 * @param params.confusionMatrix - Confusion matrix from API
 * @param params.stackedDistribution - Optional stacked distribution from API
 * @returns Sorted array of category names, or undefined for numeric scores
 *
 * @example
 * ```typescript
 * const categories = extractCategories({
 *   dataType: 'CATEGORICAL',
 *   confusionMatrix: [{ rowCategory: 'good', colCategory: 'bad', count: 10 }],
 * });
 * // Returns: ['bad', 'good']
 * ```
 */
export function extractCategories(params: {
  dataType: DataType;
  confusionMatrix: ConfusionMatrixRow[];
  stackedDistribution?: StackedDistributionRow[];
}): string[] | undefined {
  if (params.dataType === "NUMERIC") return undefined;

  // For boolean scores: ALWAYS return both categories
  // This ensures confusion matrix, distributions, and time series show both False and True
  // even when the data only contains one category (e.g., all True or all False)
  // IMPORTANT: This check must come BEFORE stackedDistribution/confusionMatrix checks
  // to prevent early returns with incomplete category lists
  if (params.dataType === "BOOLEAN") {
    return ["False", "True"];
  }

  if (params.stackedDistribution && params.stackedDistribution.length > 0) {
    const uniqueCategories = new Set<string>();
    params.stackedDistribution.forEach((item) => {
      uniqueCategories.add(item.score1Category);
    });
    return Array.from(uniqueCategories).sort();
  }

  // Fallback to confusionMatrix
  if (params.confusionMatrix.length > 0) {
    const uniqueCategories = new Set<string>();
    params.confusionMatrix.forEach((row) => {
      uniqueCategories.add(row.rowCategory);
    });
    return Array.from(uniqueCategories).sort();
  }

  return undefined;
}

/**
 * Fill missing bins with zero counts
 *
 * Backend only returns bins with data, but we want to show all categories.
 * This ensures every category has an entry, even if count is zero.
 *
 * @param distribution - Distribution data from API (may have missing bins)
 * @param categories - All category names (defines expected bins)
 * @returns Distribution with all bins filled (missing bins have count: 0)
 *
 * @example
 * ```typescript
 * const filled = fillDistributionBins(
 *   [{ binIndex: 0, count: 10 }, { binIndex: 2, count: 5 }],
 *   ['cat1', 'cat2', 'cat3']
 * );
 * // Returns: [
 * //   { binIndex: 0, count: 10 },
 * //   { binIndex: 1, count: 0 },   // Filled
 * //   { binIndex: 2, count: 5 }
 * // ]
 * ```
 */
export function fillDistributionBins(
  distribution: Distribution,
  categories: string[],
): Distribution {
  const binMap = new Map(
    distribution.map((item) => [item.binIndex, item.count]),
  );

  return categories.map((_, index) => ({
    binIndex: index,
    count: binMap.get(index) ?? 0,
  }));
}

/**
 * Calculate mode metrics for categorical/boolean scores
 *
 * Finds the most frequent category (mode) and calculates its percentage.
 * Uses distribution for counts and timeSeries for category name mapping.
 *
 * @param params - Configuration object
 * @param params.distribution - Distribution data (binIndex → count)
 * @param params.timeSeries - Time series data (category → count)
 * @param params.totalCount - Total count for percentage calculation
 * @returns Mode metrics or null if no data
 *
 * @example
 * ```typescript
 * const metrics = calculateModeMetrics({
 *   distribution: [{ binIndex: 0, count: 10 }, { binIndex: 1, count: 50 }],
 *   timeSeries: [{ category: 'good', count: 10 }, { category: 'great', count: 50 }],
 *   totalCount: 80
 * });
 * // Returns: { mode: { category: 'great', count: 50 }, modePercentage: 62.5 }
 * ```
 */
export function calculateModeMetrics(params: {
  distribution: Distribution;
  timeSeries: Array<{ category: string; count: number }>;
  totalCount: number;
}): {
  mode: { category: string; count: number };
  modePercentage: number;
} | null {
  if (params.distribution.length === 0 || params.timeSeries.length === 0) {
    return null;
  }

  // Extract unique categories and create mapping
  // This matches the ORDER BY in the ClickHouse query
  const uniqueCategories = Array.from(
    new Set(params.timeSeries.map((item) => item.category)),
  ).sort();

  const binIndexToCategory = new Map(
    uniqueCategories.map((cat, idx) => [idx, cat]),
  );

  // Find bin with max count (mode)
  const maxCount = Math.max(...params.distribution.map((d) => d.count));
  const modeItem = params.distribution.find((d) => d.count === maxCount);

  if (!modeItem) return null;

  const categoryName = binIndexToCategory.get(modeItem.binIndex);
  if (!categoryName) return null;

  const modePercentage = (modeItem.count / params.totalCount) * 100;

  return {
    mode: {
      category: categoryName,
      count: modeItem.count,
    },
    modePercentage,
  };
}

/**
 * Transform heatmap data for visualization
 *
 * Converts API data to format expected by heatmap components.
 * - Numeric scores → generateNumericHeatmapData (10x10 bins)
 * - Categorical/Boolean → generateConfusionMatrixData
 *
 * @param params - Configuration object
 * @param params.apiData - Full API response from getScoreComparisonAnalytics
 * @param params.dataType - Score data type
 * @param params.parsedScore1 - First score info (for type checking)
 * @returns Heatmap data or null if no data available
 *
 * @example
 * ```typescript
 * const heatmap = transformHeatmapData({
 *   apiData: analyticsData,
 *   dataType: 'NUMERIC',
 *   parsedScore1: { name: 'score1', dataType: 'NUMERIC', source: 'API' }
 * });
 * // Returns: { cells: [...], rowLabels: [...], colLabels: [...], ... }
 * ```
 */
export function transformHeatmapData(params: {
  apiData: RouterOutputs["scores"]["getScoreComparisonAnalytics"];
  dataType: DataType;
  parsedScore1: { name: string; dataType: string; source: string };
}):
  | ReturnType<typeof generateNumericHeatmapData>
  | ReturnType<typeof generateConfusionMatrixData>
  | null {
  const { apiData, dataType } = params;

  if (!apiData) return null;

  const isNumeric = dataType === "NUMERIC";

  if (isNumeric && apiData.heatmap.length > 0) {
    // Transform API data to match heatmap-utils expected format
    const transformedData = apiData.heatmap.map((row) => ({
      bin_x: row.binX,
      bin_y: row.binY,
      count: row.count,
      min1: row.min1,
      max1: row.max1,
      min2: row.min2,
      max2: row.max2,
    }));

    return generateNumericHeatmapData({
      data: transformedData,
      nBins: 10,
      showCounts: true,
      showPercentages: false,
    });
  } else if (!isNumeric && apiData.confusionMatrix.length > 0) {
    // Transform API data for confusion matrix
    const transformedData = apiData.confusionMatrix.map((row) => ({
      row_category: row.rowCategory,
      col_category: row.colCategory,
      count: row.count,
    }));

    return generateConfusionMatrixData({
      data: transformedData,
      showCounts: true,
      showPercentages: true,
    });
  }

  return null;
}

/**
 * Generate bin labels for numeric scores
 *
 * Creates formatted bin labels for histogram display.
 * Adjusts precision based on range magnitude.
 *
 * @param params - Configuration object
 * @param params.min - Minimum value in range
 * @param params.max - Maximum value in range
 * @param params.nBins - Number of bins (usually 10)
 * @returns Array of formatted bin labels (e.g., "[0.0, 0.1)", "[0.1, 0.2)")
 *
 * @example
 * ```typescript
 * const labels = generateBinLabels({ min: 0, max: 1, nBins: 4 });
 * // Returns: ['[0.0, 0.2)', '[0.2, 0.5)', '[0.5, 0.8)', '[0.8, 1.0)']
 * ```
 */
export function generateBinLabels(params: {
  min: number;
  max: number;
  nBins: number;
}): string[] {
  const { min, max, nBins } = params;
  const binWidth = (max - min) / nBins;

  return Array.from({ length: nBins }, (_, i) => {
    const start = min + i * binWidth;
    const end = min + (i + 1) * binWidth;
    return formatBinLabel(start, end);
  });
}

/**
 * Format a bin label for display
 * Private helper function
 *
 * @param start - Start of the range
 * @param end - End of the range
 * @returns Formatted label string
 *
 * @internal
 */
function formatBinLabel(start: number, end: number): string {
  const range = Math.abs(end - start);
  let precision: number;

  if (range >= 1) {
    precision = 1;
  } else if (range >= 0.1) {
    precision = 2;
  } else {
    precision = 3;
  }

  return `${start.toFixed(precision)} - ${end.toFixed(precision)}`;
}
