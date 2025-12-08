/**
 * useJsonViewerLayout - Hook for calculating layout dimensions
 *
 * Handles:
 * - Line number digit calculation (for consistent width)
 * - Fixed column width (line numbers + expand buttons)
 * - Scrollable column minimum width (for nowrap mode)
 * - Row height estimation (for virtualization)
 *
 * Used by both VirtualizedJsonViewer and SimpleJsonViewer
 */

import { useMemo } from "react";
import {
  type FlatJSONRow,
  type JSONTheme,
  type StringWrapMode,
} from "../types";
import { calculateFixedColumnWidth } from "../utils/calculateFixedColumnWidth";
import { calculateMinimumWidth } from "../utils/calculateWidth";
import { createHeightEstimator } from "../utils/estimateRowHeight";
import { getDepthRange } from "../utils/flattenJson";

interface UseJsonViewerLayoutParams {
  rows: FlatJSONRow[];
  theme: JSONTheme;
  showLineNumbers: boolean;
  totalLineCount?: number;
  stringWrapMode: StringWrapMode;
  truncateStringsAt: number | null;
}

export function useJsonViewerLayout({
  rows,
  theme,
  showLineNumbers,
  totalLineCount,
  stringWrapMode,
  truncateStringsAt,
}: UseJsonViewerLayoutParams) {
  // Calculate maximum number of digits needed for line numbers
  // Use totalLineCount if provided, otherwise fall back to current rows length
  const maxLineNumberDigits = useMemo(() => {
    const lineCount = totalLineCount ?? rows.length;
    return Math.max(1, Math.floor(Math.log10(lineCount)) + 1);
  }, [totalLineCount, rows.length]);

  // Calculate fixed column width (line numbers + expand buttons)
  const fixedColumnWidth = useMemo(
    () => calculateFixedColumnWidth(showLineNumbers, maxLineNumberDigits),
    [showLineNumbers, maxLineNumberDigits],
  );

  // Calculate minimum width for scrollable column
  const scrollableMinWidth = useMemo(() => {
    if (stringWrapMode === "nowrap") {
      // Calculate based on actual content width (respects truncation)
      return calculateMinimumWidth(rows, theme, truncateStringsAt);
    }
    if (stringWrapMode === "wrap") {
      // Calculate based on max depth to ensure values have room to wrap properly
      // Cap at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getDepthRange(rows);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Add buffer for key name + colon + value (400px minimum for value area)
      return maxIndent + 400;
    }
    if (stringWrapMode === "truncate") {
      // Set reasonable minimum to prevent excessive wrapping of keys and short values
      // Cap at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getDepthRange(rows);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Add buffer for key + truncated value (600px for value area to show truncated strings comfortably)
      return maxIndent + 600;
    }
    return undefined;
  }, [stringWrapMode, rows, theme, truncateStringsAt]);

  // Calculate maximum width for scrollable column (to prevent excessive horizontal scrolling)
  const scrollableMaxWidth = useMemo(() => {
    if (stringWrapMode === "wrap") {
      // Cap at reasonable width for wrap mode to force line breaking
      // Cap depth at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getDepthRange(rows);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Max 600px for value area - forces long lines to wrap
      return maxIndent + 600;
    }
    // No maximum for nowrap and truncate modes
    return undefined;
  }, [stringWrapMode, rows, theme]);

  // Create height estimator (for virtualization)
  const estimateSize = useMemo(
    () =>
      createHeightEstimator(rows, {
        baseHeight: theme.lineHeight,
        longStringThreshold: truncateStringsAt ?? 100,
        charsPerLine: 80,
      }),
    [rows, theme.lineHeight, truncateStringsAt],
  );

  return {
    maxLineNumberDigits,
    fixedColumnWidth,
    scrollableMinWidth,
    scrollableMaxWidth,
    estimateSize,
  };
}
