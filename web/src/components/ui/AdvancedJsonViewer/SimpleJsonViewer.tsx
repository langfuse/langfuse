/**
 * SimpleJsonViewer - Non-virtualized JSON viewer
 *
 * Renders all rows without virtualization.
 * Best for small datasets (<500 rows) where virtualization overhead isn't worth it.
 */

import { useMemo, useEffect, useRef, type RefObject } from "react";
import { type FlatJSONRow, type SearchMatch, type JSONTheme } from "./types";
import { JsonRow } from "./components/JsonRow";
import { getCurrentMatchIndexInRow } from "./utils/searchJson";

interface SimpleJsonViewerProps {
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

export function SimpleJsonViewer({
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
        backgroundColor: theme.background,
        color: theme.foreground,
        fontFamily: "monospace",
      }}
    >
      {rows.map((row, index) => {
        const searchMatch = matchMap.get(row.id);
        const isCurrentMatch = currentMatch?.rowId === row.id;
        const matchCount = matchCounts?.get(row.id);

        return (
          <div
            key={row.id}
            ref={(el) => {
              if (el) {
                rowRefs.current.set(row.id, el);
              } else {
                rowRefs.current.delete(row.id);
              }
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
              lineNumber={index + 1}
              enableCopy={enableCopy}
              truncateStringsAt={truncateStringsAt}
              wrapLongStrings={wrapLongStrings}
              onToggleExpansion={onToggleExpansion}
              maxLineNumberDigits={maxLineNumberDigits}
            />
          </div>
        );
      })}

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
