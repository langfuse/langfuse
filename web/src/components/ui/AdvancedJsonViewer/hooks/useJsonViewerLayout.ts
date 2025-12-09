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
import { type JSONTheme, type StringWrapMode } from "../types";
import type { TreeState } from "../utils/treeStructure";
import { calculateFixedColumnWidth } from "../utils/calculateFixedColumnWidth";
import { calculateMinimumWidth } from "../utils/calculateWidth";
import { createHeightEstimator } from "../utils/estimateRowHeight";
import {
  getVisibleDepthRange,
  getAllVisibleNodes,
  treeNodeToFlatRow,
} from "../utils/treeNavigation";

interface UseJsonViewerLayoutParams {
  tree: TreeState | null;
  expansionVersion: number;
  theme: JSONTheme;
  showLineNumbers: boolean;
  totalLineCount?: number;
  stringWrapMode: StringWrapMode;
  truncateStringsAt: number | null;
}

export function useJsonViewerLayout({
  tree,
  expansionVersion,
  theme,
  showLineNumbers,
  totalLineCount,
  stringWrapMode,
  truncateStringsAt,
}: UseJsonViewerLayoutParams) {
  // Get rows from tree
  const effectiveRows = useMemo(() => {
    if (!tree) return [];
    const visibleNodes = getAllVisibleNodes(tree.rootNode);
    return visibleNodes.map((node, index) => treeNodeToFlatRow(node, index));
  }, [tree, expansionVersion]);

  // Calculate maximum number of digits needed for line numbers
  // Use totalLineCount if provided, otherwise fall back to current rows length
  const maxLineNumberDigits = useMemo(() => {
    const lineCount = totalLineCount ?? effectiveRows.length;
    return Math.max(1, Math.floor(Math.log10(lineCount)) + 1);
  }, [totalLineCount, effectiveRows.length]);

  // Calculate fixed column width (line numbers + expand buttons)
  const fixedColumnWidth = useMemo(
    () => calculateFixedColumnWidth(showLineNumbers, maxLineNumberDigits),
    [showLineNumbers, maxLineNumberDigits],
  );

  // Calculate minimum width for scrollable column
  const scrollableMinWidth = useMemo(() => {
    if (stringWrapMode === "nowrap") {
      // Calculate based on actual content width (respects truncation)
      return calculateMinimumWidth(effectiveRows, theme, truncateStringsAt);
    }
    if (!tree) return undefined;

    if (stringWrapMode === "wrap") {
      // Calculate based on max depth to ensure values have room to wrap properly
      // Cap at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getVisibleDepthRange(tree.rootNode);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Add buffer for key name + colon + value (400px minimum for value area)
      return maxIndent + 400;
    }
    if (stringWrapMode === "truncate") {
      // Set reasonable minimum to prevent excessive wrapping of keys and short values
      // Cap at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getVisibleDepthRange(tree.rootNode);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Add buffer for key + truncated value (600px for value area to show truncated strings comfortably)
      return maxIndent + 600;
    }
    return undefined;
  }, [stringWrapMode, tree, effectiveRows, theme, truncateStringsAt]);

  // Calculate maximum width for scrollable column (to prevent excessive horizontal scrolling)
  const scrollableMaxWidth = useMemo(() => {
    if (stringWrapMode === "wrap" && tree) {
      // Cap at reasonable width for wrap mode to force line breaking
      // Cap depth at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getVisibleDepthRange(tree.rootNode);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Max 600px for value area - forces long lines to wrap
      return maxIndent + 600;
    }
    if (stringWrapMode === "truncate" && tree) {
      // Cap width for truncate mode to trigger truncation component
      // Cap depth at 20 levels to prevent excessive width from deeply nested data
      const [, maxDepth] = getVisibleDepthRange(tree.rootNode);
      const cappedDepth = Math.min(maxDepth, 20);
      const maxIndent = cappedDepth * theme.indentSize;
      // Max 800px for value area - allows truncated strings to display comfortably
      return maxIndent + 800;
    }
    // No maximum for nowrap mode
    return undefined;
  }, [stringWrapMode, tree, theme]);

  // Create height estimator (for virtualization)
  const estimateSize = useMemo(
    () =>
      createHeightEstimator(effectiveRows, {
        baseHeight: theme.lineHeight,
        longStringThreshold: truncateStringsAt ?? 100,
        charsPerLine: 80,
      }),
    [effectiveRows, theme.lineHeight, truncateStringsAt],
  );

  return {
    maxLineNumberDigits,
    fixedColumnWidth,
    scrollableMinWidth,
    scrollableMaxWidth,
    estimateSize,
  };
}
