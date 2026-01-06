/**
 * VirtualizedJsonViewer - Virtualized JSON viewer using TanStack Virtual
 *
 * Renders only visible rows for optimal performance with large datasets.
 * Uses @tanstack/react-virtual which is already in project dependencies.
 */

import { useRef, useEffect, useMemo, memo, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type SearchMatch, type JSONTheme, type StringWrapMode } from "./types";
import type { TreeState } from "./utils/treeStructure";
import { getNodeByIndex, treeNodeToFlatRow } from "./utils/treeNavigation";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { pathArrayToJsonPath } from "./utils/pathUtils";
import { useMonospaceCharWidth } from "./hooks/useMonospaceCharWidth";

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
  commentedPaths?: Map<string, Array<{ start: number; end: number }>>;
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
  stringWrapMode = "wrap",
  truncateStringsAt = null,
  onToggleExpansion,
  className,
  scrollToIndex,
  scrollContainerRef,
  totalLineCount,
  commentedPaths,
}: VirtualizedJsonViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Measure actual monospace character width for accurate height estimation
  const charWidth = useMonospaceCharWidth();

  // Determine row count
  // NOTE: Must recalculate when expansionVersion changes because tree is mutated in place
  const rowCount = tree ? 1 + tree.rootNode.visibleDescendantCount : 0;

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
    charWidth,
  });

  // Search-related calculations
  const { matchMap, currentMatch, currentMatchIndexInRow } = useJsonSearch(
    searchMatches,
    currentMatchIndex,
  );

  // Initialize virtualizer
  // NOTE: We provide getItemKey using node IDs so the virtualizer can detect when
  // the content at a given index changes (e.g., after expand/collapse).
  // This ensures cached measurements are invalidated when different nodes move to the same index.
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef?.current || parentRef.current,
    estimateSize,
    overscan: 500, // Render 500 extra rows above/below viewport
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
    getItemKey: (index) => {
      if (!tree) return index;
      const node = getNodeByIndex(tree.rootNode, index);
      return node ? node.id : index;
    },
  });

  // Use tree toggle directly (scroll restoration is handled by tree expansion logic)
  const finalHandleToggleExpansion = onToggleExpansion;

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
      return fixedColumnWidth + tree.maxContentWidth;
    }

    // For wrap/truncate: use constrained width from scrollableMaxWidth
    if (scrollableMaxWidth) {
      return fixedColumnWidth + scrollableMaxWidth;
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
          const rowJsonPath = pathArrayToJsonPath(row.pathArray);
          const commentRanges = commentedPaths?.get(rowJsonPath);

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
                  matchCount={matchCount}
                  currentMatchIndexInRow={
                    isCurrentMatch ? currentMatchIndexInRow : undefined
                  }
                  onToggleExpansion={finalHandleToggleExpansion}
                  stringWrapMode={stringWrapMode}
                />
              </div>

              {/* Scrollable column (indent + key + value + copy) */}
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
                  enableCopy={enableCopy}
                  searchMatch={searchMatch}
                  isCurrentMatch={isCurrentMatch}
                  jsonPath={rowJsonPath}
                  commentRanges={commentRanges}
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
