/**
 * Data preprocessing utilities for heatmap visualization
 * Transforms ClickHouse query results into heatmap cell data
 */

/**
 * Represents a single cell in the heatmap grid
 */
export interface HeatmapCell {
  row: number; // 0-indexed row position
  col: number; // 0-indexed column position
  value: number; // Raw value (e.g., count)
  displayValue?: string; // Optional formatted text to show in cell
  metadata?: Record<string, unknown>; // Extra data for tooltips/clicks
}

/**
 * Input data from ClickHouse for numeric heatmap (binned data)
 */
export interface NumericHeatmapInput {
  data: Array<{
    bin_x: number;
    bin_y: number;
    count: number;
    min1: number;
    max1: number;
    min2: number;
    max2: number;
  }>;
  nBins: number;
  showPercentages?: boolean;
  showCounts?: boolean;
}

/**
 * Generate heatmap data for numeric score comparison
 * Creates a square grid with bins showing correlation patterns
 * Colors are computed separately by the parent component
 */
export function generateNumericHeatmapData({
  data,
  nBins,
  showPercentages = false,
  showCounts = true,
}: NumericHeatmapInput): {
  cells: HeatmapCell[];
  rowLabels: string[];
  colLabels: string[];
  maxValue: number;
} {
  // Handle empty data
  if (data.length === 0) {
    return {
      cells: [],
      rowLabels: [],
      colLabels: [],
      maxValue: 0,
    };
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count));

  // Get bounds (assuming all rows have same bounds)
  const { min1, max1, min2, max2 } = data[0];
  const binWidth1 = (max1 - min1) / nBins;
  const binWidth2 = (max2 - min2) / nBins;

  // Generate cells
  const cells: HeatmapCell[] = data.map((d) => {
    const percentage = total > 0 ? (d.count / total) * 100 : 0;

    const xRange: [number, number] = [
      min2 + d.bin_x * binWidth2,
      min2 + (d.bin_x + 1) * binWidth2,
    ];
    const yRange: [number, number] = [
      min1 + d.bin_y * binWidth1,
      min1 + (d.bin_y + 1) * binWidth1,
    ];

    // Format display value
    let displayValue = "";
    if (showCounts && showPercentages) {
      displayValue = `${d.count}\n${percentage.toFixed(1)}%`;
    } else if (showCounts) {
      displayValue = String(d.count);
    } else if (showPercentages) {
      displayValue = `${percentage.toFixed(1)}%`;
    }

    return {
      row: d.bin_y,
      col: d.bin_x,
      value: d.count,
      displayValue,
      metadata: { xRange, yRange, percentage },
    };
  });

  // Generate division point labels (nBins + 1 points for nBins bins)
  const range1 = max1 - min1;
  const range2 = max2 - min2;

  const rowLabels = Array.from({ length: nBins + 1 }, (_, i) => {
    const divisionPoint = min1 + i * binWidth1;
    return formatDivisionPoint(divisionPoint, range1);
  });

  const colLabels = Array.from({ length: nBins + 1 }, (_, i) => {
    const divisionPoint = min2 + i * binWidth2;
    return formatDivisionPoint(divisionPoint, range2);
  });

  return { cells, rowLabels, colLabels, maxValue: maxCount };
}

/**
 * Input data from ClickHouse for confusion matrix (categorical data)
 */
export interface ConfusionMatrixInput {
  data: Array<{
    row_category: string;
    col_category: string;
    count: number;
  }>;
  showPercentages?: boolean;
  showCounts?: boolean;
}

/**
 * Generate confusion matrix data for categorical/boolean score comparison
 * Creates an n×m grid showing agreement between categories
 * Colors are computed separately by the parent component
 */
export function generateConfusionMatrixData({
  data,
  showPercentages = false,
  showCounts = true,
}: ConfusionMatrixInput): {
  cells: HeatmapCell[];
  rowLabels: string[];
  colLabels: string[];
  rows: number;
  cols: number;
  maxValue: number;
} {
  // Handle empty data
  if (data.length === 0) {
    return {
      cells: [],
      rowLabels: [],
      colLabels: [],
      rows: 0,
      cols: 0,
      maxValue: 0,
    };
  }

  // Extract unique categories
  const rowCategories = Array.from(
    new Set(data.map((d) => d.row_category)),
  ).sort();
  const colCategories = Array.from(
    new Set(data.map((d) => d.col_category)),
  ).sort();

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count));

  // Create lookup map
  const dataMap = new Map<string, number>();
  data.forEach((d) => {
    dataMap.set(`${d.row_category}-${d.col_category}`, d.count);
  });

  // Generate cells
  const cells: HeatmapCell[] = [];
  rowCategories.forEach((rowCat, rowIdx) => {
    colCategories.forEach((colCat, colIdx) => {
      const count = dataMap.get(`${rowCat}-${colCat}`) || 0;
      const percentage = total > 0 ? (count / total) * 100 : 0;
      const isDiagonal = rowCat === colCat;

      // Format display value
      let displayValue = "";
      if (showCounts && showPercentages) {
        displayValue = `${count}\n${percentage.toFixed(1)}%`;
      } else if (showCounts) {
        displayValue = String(count);
      } else if (showPercentages) {
        displayValue = `${percentage.toFixed(1)}%`;
      }

      cells.push({
        row: rowIdx,
        col: colIdx,
        value: count,
        displayValue,
        metadata: {
          rowCategory: rowCat,
          colCategory: colCat,
          percentage,
          isDiagonal,
        },
      });
    });
  });

  return {
    cells,
    rowLabels: rowCategories,
    colLabels: colCategories,
    rows: rowCategories.length,
    cols: colCategories.length,
    maxValue: maxCount,
  };
}

/**
 * Format a single division point value
 * @param value - The division point value
 * @param range - The total range to determine precision
 * @returns Formatted value string
 */
function formatDivisionPoint(value: number, range: number): string {
  let precision: number;

  if (range >= 10) {
    precision = 1;
  } else if (range >= 1) {
    precision = 2;
  } else if (range >= 0.1) {
    precision = 3;
  } else {
    precision = 4;
  }

  return value.toFixed(precision);
}

/**
 * Fill missing bins with zero counts
 * Useful when ClickHouse doesn't return bins with count=0
 */
export function fillMissingBins(
  data: Array<{ bin_x: number; bin_y: number; count: number }>,
  nBins: number,
  bounds: { min1: number; max1: number; min2: number; max2: number },
): Array<{
  bin_x: number;
  bin_y: number;
  count: number;
  min1: number;
  max1: number;
  min2: number;
  max2: number;
}> {
  const dataMap = new Map<string, number>();
  data.forEach((d) => {
    dataMap.set(`${d.bin_x}-${d.bin_y}`, d.count);
  });

  const filled = [];
  for (let y = 0; y < nBins; y++) {
    for (let x = 0; x < nBins; x++) {
      const count = dataMap.get(`${x}-${y}`) || 0;
      filled.push({
        bin_x: x,
        bin_y: y,
        count,
        ...bounds,
      });
    }
  }

  return filled;
}
