/**
 * VirtualizedJsonViewer - Virtualized JSON viewer using TanStack Virtual
 *
 * Renders only visible rows for optimal performance with large datasets.
 * Uses @tanstack/react-virtual which is already in project dependencies.
 */

import { useRef, useMemo, useEffect, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FlatJSONRow, type SearchMatch, type JSONTheme } from "./types";
import { JsonRow } from "./components/JsonRow";
import { createHeightEstimator } from "./utils/estimateRowHeight";
import { getCurrentMatchIndexInRow } from "./utils/searchJson";

interface VirtualizedJsonViewerProps {
  rows: FlatJSONRow[];
  theme: JSONTheme;
  searchMatches?: SearchMatch[];
  currentMatchIndex?: number;
  matchCounts?: Map<string, number>; // Row ID -> count of matches in row and descendants
  showLineNumbers?: boolean;
  enableCopy?: boolean;
  truncateStringsAt?: number | null;
  wrapLongStrings?: boolean;
  onToggleExpansion?: (rowId: string) => void;
  className?: string;
  scrollToIndex?: number; // For search navigation
  scrollContainerRef?: RefObject<HTMLDivElement | null>; // Parent scroll container
}

export function VirtualizedJsonViewer({
  rows,
  theme,
  searchMatches = [],
  currentMatchIndex = 0,
  matchCounts,
  showLineNumbers = false,
  enableCopy = false,
  truncateStringsAt = null,
  wrapLongStrings = false,
  onToggleExpansion,
  className,
  scrollToIndex,
  scrollContainerRef,
}: VirtualizedJsonViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate maximum number of digits needed for line numbers
  const maxLineNumberDigits = useMemo(() => {
    return Math.max(1, Math.floor(Math.log10(rows.length)) + 1);
  }, [rows.length]);

  // Build a map of rowId -> match for quick lookup
  const matchMap = useMemo(() => {
    const map = new Map<string, SearchMatch>();
    searchMatches.forEach((match) => {
      map.set(match.rowId, match);
    });
    return map;
  }, [searchMatches]);

  // Get current match for highlighting
  const currentMatch = searchMatches[currentMatchIndex];

  // Get current match index within its row (1-based)
  const currentMatchIndexInRow = useMemo(
    () => getCurrentMatchIndexInRow(currentMatchIndex, searchMatches),
    [currentMatchIndex, searchMatches],
  );

  // Create height estimator
  const estimateSize = useMemo(
    () =>
      createHeightEstimator(rows, {
        baseHeight: theme.lineHeight,
        longStringThreshold: truncateStringsAt ?? 100,
        charsPerLine: 80,
      }),
    [rows, theme.lineHeight, truncateStringsAt],
  );

  // Initialize virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef?.current || parentRef.current,
    estimateSize,
    overscan: 50, // Render 50 extra rows above/below viewport
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
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
        backgroundColor: theme.background,
        color: theme.foreground,
      }}
    >
      {/* Total height container */}
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {/* Virtualized rows */}
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
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <JsonRow
                row={row}
                theme={theme}
                searchMatch={searchMatch}
                isCurrentMatch={isCurrentMatch}
                matchCount={matchCount}
                currentMatchIndexInRow={
                  isCurrentMatch ? currentMatchIndexInRow : undefined
                }
                showLineNumber={showLineNumbers}
                lineNumber={virtualRow.index + 1}
                enableCopy={enableCopy}
                truncateStringsAt={truncateStringsAt}
                wrapLongStrings={wrapLongStrings}
                onToggleExpansion={onToggleExpansion}
                maxLineNumberDigits={maxLineNumberDigits}
              />
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
