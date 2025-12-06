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

  // Calculate minimum width for nowrap mode (scrollable column only)
  const scrollableMinWidth = useMemo(() => {
    if (stringWrapMode === "nowrap") {
      return calculateMinimumWidth(rows, theme);
    }
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
    estimateSize,
  };
}
