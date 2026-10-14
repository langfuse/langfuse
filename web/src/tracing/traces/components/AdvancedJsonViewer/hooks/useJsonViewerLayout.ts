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

import { useMemo, useCallback } from "react";
import { type JSONTheme, type StringWrapMode } from "../types";
import type { TreeState } from "../utils/treeStructure";
import { calculateFixedColumnWidth } from "../utils/calculateFixedColumnWidth";
import {
  getVisibleDepthRange,
  getNodeByIndex,
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
  charWidth?: number; // Measured character width for accurate height estimation
}

export function useJsonViewerLayout({
  tree,
  expansionVersion: _expansionVersion,
  theme,
  showLineNumbers,
  totalLineCount,
  stringWrapMode,
  truncateStringsAt,
  charWidth,
}: UseJsonViewerLayoutParams) {
  // Calculate visible row count from tree
  const visibleRowCount = tree ? 1 + tree.rootNode.visibleDescendantCount : 0;

  // Calculate maximum number of digits needed for line numbers
  // Use totalLineCount if provided, otherwise fall back to current visible count
  const maxLineNumberDigits = useMemo(() => {
    const lineCount = totalLineCount ?? visibleRowCount;
    return Math.max(1, Math.floor(Math.log10(lineCount)) + 1);
  }, [totalLineCount, visibleRowCount]);

  // Calculate fixed column width (line numbers + expand buttons)
  const fixedColumnWidth = useMemo(
    () => calculateFixedColumnWidth(showLineNumbers, maxLineNumberDigits),
    [showLineNumbers, maxLineNumberDigits],
  );

  // Calculate minimum width for scrollable column (PRESENTATION LAYER)
  const scrollableMinWidth = useMemo(() => {
    if (!tree) return undefined;

    if (stringWrapMode === "nowrap") {
      // Use full untruncated width from tree metadata
      return tree.maxContentWidth;
    }

    // For wrap and truncate modes, use depth-based constraints
    const [, maxDepth] = getVisibleDepthRange(tree.rootNode);
    const cappedDepth = Math.min(maxDepth, 20);
    const maxIndent = cappedDepth * theme.indentSize;

    if (stringWrapMode === "wrap") {
      // Add buffer for key name + colon + value (400px minimum for value area)
      return maxIndent + 400;
    }

    if (stringWrapMode === "truncate") {
      // Buffer for key + truncated value (600px for value area to show truncated strings comfortably)
      return maxIndent + 600;
    }

    return undefined;
  }, [stringWrapMode, tree, theme]);

  // Calculate maximum width for scrollable column (PRESENTATION LAYER)
  const scrollableMaxWidth = useMemo(() => {
    if (!tree) return undefined;

    if (stringWrapMode === "nowrap") {
      // No maximum for nowrap - use full width for horizontal scrolling
      return undefined;
    }

    // For wrap and truncate modes, apply constraints
    const [, maxDepth] = getVisibleDepthRange(tree.rootNode);
    const cappedDepth = Math.min(maxDepth, 20);
    const maxIndent = cappedDepth * theme.indentSize;

    if (stringWrapMode === "wrap") {
      // Max 600px for value area - forces long lines to wrap
      return maxIndent + 600;
    }

    if (stringWrapMode === "truncate") {
      // Max 600px for value area (same as wrap) - triggers CSS ellipsis
      return maxIndent + 600;
    }

    return undefined;
  }, [stringWrapMode, tree, theme]);

  // Create height estimator (for virtualization) - JIT lookup from tree
  // This matches getItemKey by using getNodeByIndex, ensuring both see the same tree state
  const estimateSize = useCallback(
    (index: number) => {
      if (!tree) return theme.lineHeight;

      const node = getNodeByIndex(tree.rootNode, index);
      if (!node) return theme.lineHeight;

      const row = treeNodeToFlatRow(node, index);

      // Expandable rows are always single line (show preview only)
      if (row.isExpandable) return theme.lineHeight;

      // In nowrap/truncate modes, all strings are single line
      if (stringWrapMode === "nowrap" || stringWrapMode === "truncate") {
        return theme.lineHeight;
      }

      // In wrap mode, calculate multi-line height for long strings
      if (row.type === "string") {
        const str = row.value as string;
        const threshold = truncateStringsAt ?? 100;

        if (str.length > threshold) {
          // Use measured character width for accurate line calculation
          if (charWidth && scrollableMaxWidth) {
            const indentWidth = node.depth * theme.indentSize;
            const keyWidth = String(row.key).length * charWidth;
            const colonWidth = 2 * charWidth; // ": "
            // For wrapped strings with white-space: pre-wrap, ALL lines (including continuations)
            // start at the same position - after the opening quote of the value
            const leftIndent = indentWidth + keyWidth + colonWidth + charWidth; // +charWidth for opening quote position
            const availableWidth = scrollableMaxWidth - leftIndent;

            if (availableWidth > 0) {
              const charsPerLine = Math.max(
                40,
                Math.floor(availableWidth / charWidth),
              );
              const lines = Math.ceil(str.length / charsPerLine);
              return theme.lineHeight * Math.min(lines, 10);
            }
          }

          // Fallback to original estimate if charWidth not available or calc fails
          const lines = Math.ceil(str.length / 80);
          return theme.lineHeight * Math.min(lines, 10);
        }
      }

      return theme.lineHeight;
    },
    [
      tree,
      theme.lineHeight,
      theme.indentSize,
      stringWrapMode,
      truncateStringsAt,
      charWidth,
      scrollableMaxWidth,
    ],
  );

  return {
    maxLineNumberDigits,
    fixedColumnWidth,
    scrollableMinWidth,
    scrollableMaxWidth,
    estimateSize,
  };
}
