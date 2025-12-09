/**
 * VirtualizedJsonViewer - Virtualized JSON viewer using TanStack Virtual
 *
 * Renders only visible rows for optimal performance with large datasets.
 * Uses @tanstack/react-virtual which is already in project dependencies.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type SearchMatch, type JSONTheme, type StringWrapMode } from "./types";
import type { TreeState } from "./utils/treeStructure";
import { getNodeByIndex, treeNodeToFlatRow } from "./utils/treeNavigation";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { debugLog } from "./utils/debug";

interface VirtualizedJsonViewerProps {
  tree: TreeState | null;
  expansionVersion: number; // Triggers re-render on expansion changes
  theme: JSONTheme;
  searchMatches?: SearchMatch[];
  currentMatchIndex?: number;
  matchCounts?: Map<string, number>; // Row ID -> count of matches in row and descendants
  showLineNumbers?: boolean;
  enableCopy?: boolean;
  stringWrapMode?: StringWrapMode;
  truncateStringsAt?: number | null;
  onToggleExpansion?: (rowId: string) => void;
  className?: string;
  scrollToIndex?: number; // For search navigation
  scrollContainerRef?: RefObject<HTMLDivElement | null>; // Parent scroll container
  totalLineCount?: number; // Total number of lines when fully expanded (for line number width calculation)
}

export const VirtualizedJsonViewer = memo(function VirtualizedJsonViewer({
  tree,
  expansionVersion,
  theme,
  searchMatches = [],
  currentMatchIndex = 0,
  matchCounts,
  showLineNumbers = false,
  enableCopy = false,
  stringWrapMode = "truncate",
  truncateStringsAt = null,
  onToggleExpansion,
  className,
  scrollToIndex,
  scrollContainerRef,
  totalLineCount,
}: VirtualizedJsonViewerProps) {
  debugLog("[VirtualizedJsonViewer] RENDER", { expansionVersion });
  const parentRef = useRef<HTMLDivElement>(null);

  // Determine row count
  // NOTE: Must recalculate when expansionVersion changes because tree is mutated in place
  const rowCount = tree ? 1 + tree.rootNode.visibleDescendantCount : 0;
  debugLog("[VirtualizedJsonViewer] rowCount:", rowCount);

  // Layout calculations (widths, heights, column sizes)
  const {
    maxLineNumberDigits,
    fixedColumnWidth,
    scrollableMinWidth,
    scrollableMaxWidth,
    estimateSize,
  } = useJsonViewerLayout({
    tree,
    expansionVersion,
    theme,
    showLineNumbers,
    totalLineCount,
    stringWrapMode,
    truncateStringsAt,
  });

  // Search-related calculations
  const { matchMap, currentMatch, currentMatchIndexInRow } = useJsonSearch(
    searchMatches,
    currentMatchIndex,
  );

  // Initialize virtualizer
  // NOTE: We deliberately do NOT provide getItemKey because our data model is index-based.
  // The tree is mutated in-place and getNodeByIndex does JIT lookup by index.
  // When expansion changes, the node at each index changes, so we WANT all rows to repaint.
  // Using index-based keys (default) aligns perfectly with our JIT architecture.
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef?.current || parentRef.current,
    estimateSize,
    overscan: 500, // Render 500 extra rows above/below viewport
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
    // No getItemKey - default to index-based keys for our positional data model
  });

  // Use tree toggle directly (scroll restoration is handled by tree expansion logic)
  const finalHandleToggleExpansion = onToggleExpansion;

  // Log virtualizer creation (only when rowCount changes)
  useEffect(() => {
    debugLog(
      `[VirtualizedJsonViewer] Virtualizer initialized with ${rowCount} rows`,
    );
    // No need to call measure() - the virtualizer will remeasure automatically
    // because getItemKey returns new keys when expansionVersion changes
  }, [rowCount]);

  // Scroll to match when search navigation occurs
  useEffect(() => {
    if (
      scrollToIndex !== undefined &&
      scrollToIndex >= 0 &&
      scrollToIndex < rowCount
    ) {
      rowVirtualizer.scrollToIndex(scrollToIndex, {
        align: "center",
        behavior: "auto", // Use "auto" instead of "smooth" for dynamic sizing
      });
    }
  }, [scrollToIndex, rowVirtualizer, rowCount]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  // Calculate total content width (PRESENTATION LAYER)
  const totalContentWidth = useMemo(() => {
    if (!tree) return undefined;

    // For nowrap mode: use full untruncated width from tree
    if (stringWrapMode === "nowrap") {
      const total = fixedColumnWidth + tree.maxContentWidth;
      console.log("[VirtualizedJsonViewer] Width calculation (nowrap):", {
        stringWrapMode,
        fixedColumnWidth,
        treeMaxContentWidth: tree.maxContentWidth,
        totalContentWidth: total,
      });
      return total;
    }

    // For wrap/truncate: use constrained width from scrollableMaxWidth
    if (scrollableMaxWidth) {
      const total = fixedColumnWidth + scrollableMaxWidth;
      console.log(
        "[VirtualizedJsonViewer] Width calculation (wrap/truncate):",
        {
          stringWrapMode,
          fixedColumnWidth,
          scrollableMaxWidth,
          totalContentWidth: total,
        },
      );
      return total;
    }

    return undefined;
  }, [tree, fixedColumnWidth, stringWrapMode, scrollableMaxWidth]);

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: "100%",
        width: stringWrapMode === "wrap" ? "100%" : "fit-content",
        minWidth: "100%",
        backgroundColor: theme.background,
        color: theme.foreground,
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: totalContentWidth ? `${totalContentWidth}px` : "max-content",
        }}
      >
        {virtualRows.map((virtualRow) => {
          // Get row from tree
          if (!tree) return null;

          const node = getNodeByIndex(tree.rootNode, virtualRow.index);
          if (!node) return null;

          const row = treeNodeToFlatRow(node, virtualRow.index);

          const searchMatch = matchMap.get(row.id);
          const isCurrentMatch = currentMatch?.rowId === row.id;
          const matchCount = matchCounts?.get(row.id);

          return (
            <div
              key={row.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: totalContentWidth ? `${totalContentWidth}px` : "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `${fixedColumnWidth}px auto`,
              }}
            >
              {/* Fixed column (line numbers + expand buttons) - sticky within row */}
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  width: `${fixedColumnWidth}px`,
                  backgroundColor: theme.background,
                }}
              >
                <JsonRowFixed
                  row={row}
                  theme={theme}
                  showLineNumber={showLineNumbers}
                  lineNumber={row.absoluteLineNumber ?? virtualRow.index + 1}
                  maxLineNumberDigits={maxLineNumberDigits}
                  searchMatch={searchMatch}
                  isCurrentMatch={isCurrentMatch}
                  onToggleExpansion={finalHandleToggleExpansion}
                  stringWrapMode={stringWrapMode}
                />
              </div>

              {/* Scrollable column (indent + key + value + badges + copy) */}
              <div
                style={{
                  width: "fit-content",
                  minWidth: scrollableMinWidth
                    ? `${scrollableMinWidth}px`
                    : undefined,
                  maxWidth: scrollableMaxWidth
                    ? `${scrollableMaxWidth}px`
                    : undefined,
                }}
              >
                <JsonRowScrollable
                  row={row}
                  theme={theme}
                  stringWrapMode={stringWrapMode}
                  truncateStringsAt={truncateStringsAt}
                  matchCount={matchCount}
                  currentMatchIndexInRow={
                    isCurrentMatch ? currentMatchIndexInRow : undefined
                  }
                  enableCopy={enableCopy}
                  searchMatch={searchMatch}
                  isCurrentMatch={isCurrentMatch}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {rowCount === 0 && (
        <div
          className="flex items-center justify-center p-8 text-muted-foreground"
          style={{ fontSize: theme.fontSize }}
        >
          No data to display
        </div>
      )}
    </div>
  );
});
