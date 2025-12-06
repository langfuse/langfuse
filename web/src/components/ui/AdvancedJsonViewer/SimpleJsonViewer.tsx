/**
 * SimpleJsonViewer - Non-virtualized JSON viewer
 *
 * Renders all rows without virtualization.
 * Best for small datasets (<500 rows) where virtualization overhead isn't worth it.
 */

import { useMemo, useEffect, useRef, type RefObject } from "react";
import {
  type FlatJSONRow,
  type SearchMatch,
  type JSONTheme,
  type StringWrapMode,
} from "./types";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { getCurrentMatchIndexInRow } from "./utils/searchJson";
import { calculateMinimumWidth } from "./utils/calculateWidth";
import { calculateFixedColumnWidth } from "./utils/calculateFixedColumnWidth";

interface SimpleJsonViewerProps {
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
}

export function SimpleJsonViewer({
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
  scrollContainerRef: _scrollContainerRef,
}: SimpleJsonViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Calculate maximum number of digits needed for line numbers
  const maxLineNumberDigits = useMemo(() => {
    return Math.max(1, Math.floor(Math.log10(rows.length)) + 1);
  }, [rows.length]);

  // Build a map of rowId -> match for quick lookup
  const matchMap = new Map<string, SearchMatch>();
  searchMatches.forEach((match) => {
    matchMap.set(match.rowId, match);
  });

  // Get current match for highlighting
  const currentMatch = searchMatches[currentMatchIndex];

  // Get current match index within its row (1-based)
  const currentMatchIndexInRow = useMemo(
    () => getCurrentMatchIndexInRow(currentMatchIndex, searchMatches),
    [currentMatchIndex, searchMatches],
  );

  // Calculate fixed column width
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

  // Scroll to match when search navigation occurs
  useEffect(() => {
    if (
      scrollToIndex !== undefined &&
      scrollToIndex >= 0 &&
      scrollToIndex < rows.length
    ) {
      const row = rows[scrollToIndex];
      if (row) {
        const element = rowRefs.current.get(row.id);
        if (element) {
          element.scrollIntoView({
            behavior: "auto",
            block: "center",
            inline: "nearest",
          });
        }
      }
    }
  }, [scrollToIndex, rows]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: "flex",
        backgroundColor: theme.background,
        color: theme.foreground,
        fontFamily: "monospace",
      }}
    >
      {/* Fixed column (line numbers + expand buttons) */}
      <div
        style={{
          width: `${fixedColumnWidth}px`,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {rows.map((row, index) => {
          const searchMatch = matchMap.get(row.id);
          const isCurrentMatch = currentMatch?.rowId === row.id;

          return (
            <JsonRowFixed
              key={`fixed-${row.id}`}
              row={row}
              theme={theme}
              showLineNumber={showLineNumbers}
              lineNumber={row.absoluteLineNumber ?? index + 1}
              maxLineNumberDigits={maxLineNumberDigits}
              searchMatch={searchMatch}
              isCurrentMatch={isCurrentMatch}
              onToggleExpansion={onToggleExpansion}
              stringWrapMode={stringWrapMode}
            />
          );
        })}
      </div>

      {/* Scrollable column (indent + key + value + badges + copy) */}
      <div
        style={{
          flex: 1,
          overflowX: stringWrapMode === "nowrap" ? "auto" : "hidden",
          overflowY: "hidden",
          minWidth: scrollableMinWidth ? `${scrollableMinWidth}px` : undefined,
        }}
      >
        {rows.map((row) => {
          const searchMatch = matchMap.get(row.id);
          const isCurrentMatch = currentMatch?.rowId === row.id;
          const matchCount = matchCounts?.get(row.id);

          return (
            <div
              key={`scrollable-${row.id}`}
              ref={(el) => {
                if (el) {
                  rowRefs.current.set(row.id, el);
                } else {
                  rowRefs.current.delete(row.id);
                }
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
