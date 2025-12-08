/**
 * VirtualizedJsonViewer - Virtualized JSON viewer using TanStack Virtual
 *
 * Renders only visible rows for optimal performance with large datasets.
 * Uses @tanstack/react-virtual which is already in project dependencies.
 */

import { useRef, useMemo, useEffect, useCallback, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type FlatJSONRow,
  type SearchMatch,
  type JSONTheme,
  type StringWrapMode,
} from "./types";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { useVirtualizerScrollRestoration } from "./hooks/useVirtualizerScrollRestoration";

interface VirtualizedJsonViewerProps {
  rows: FlatJSONRow[];
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

export function VirtualizedJsonViewer({
  rows,
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
  const parentRef = useRef<HTMLDivElement>(null);

  // Layout calculations (widths, heights, column sizes)
  const {
    maxLineNumberDigits,
    fixedColumnWidth,
    scrollableMinWidth,
    estimateSize,
  } = useJsonViewerLayout({
    rows,
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

  // Memoize getItemKey to track rows by ID instead of index
  // This prevents TanStack Virtual from invalidating its cache when row indices shift
  const getItemKey = useCallback(
    (index: number) => {
      const row = rows[index];
      return row?.id ?? index;
    },
    [rows],
  );

  // Initialize virtualizer
  console.log(
    "[VirtualizedJsonViewer] Creating virtualizer with",
    rows.length,
    "rows",
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef?.current || parentRef.current,
    estimateSize,
    overscan: 500, // Render 500 extra rows above/below viewport
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
    getItemKey, // Track items by row.id, not by array index
  });

  // Scroll restoration logic (uses virtualizer's scrollToIndex)
  const { handleToggleExpansion } = useVirtualizerScrollRestoration({
    rows,
    virtualizer: rowVirtualizer,
    onToggleExpansion,
  });

  // Scroll to match when search navigation occurs
  useEffect(() => {
    if (
      scrollToIndex !== undefined &&
      scrollToIndex >= 0 &&
      scrollToIndex < rows.length
    ) {
      rowVirtualizer.scrollToIndex(scrollToIndex, {
        align: "center",
        behavior: "auto", // Use "auto" instead of "smooth" for dynamic sizing
      });
    }
  }, [scrollToIndex, rowVirtualizer, rows.length]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: "100%",
        width: "100%",
        backgroundColor: theme.background,
        color: theme.foreground,
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "fit-content",
          minWidth: "100%",
          position: "relative",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index]!;
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
                width: "fit-content",
                minWidth: "100%",
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
                  onToggleExpansion={handleToggleExpansion}
                  stringWrapMode={stringWrapMode}
                />
              </div>

              {/* Scrollable column (indent + key + value + badges + copy) */}
              <div
                style={{
                  minWidth: scrollableMinWidth
                    ? `${scrollableMinWidth}px`
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
      {rows.length === 0 && (
        <div
          className="flex items-center justify-center p-8 text-muted-foreground"
          style={{ fontSize: theme.fontSize }}
        >
          No data to display
        </div>
      )}
    </div>
  );
}
