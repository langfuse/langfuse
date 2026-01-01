/**
 * SimpleJsonViewer - Non-virtualized JSON viewer
 *
 * Renders all rows without virtualization.
 * Best for small datasets (<500 rows) where virtualization overhead isn't worth it.
 */

import { useEffect, useMemo, useRef, memo, type RefObject } from "react";
import { type SearchMatch, type JSONTheme, type StringWrapMode } from "./types";
import type { TreeState } from "./utils/treeStructure";
import { getAllVisibleNodes, treeNodeToFlatRow } from "./utils/treeNavigation";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { pathArrayToJsonPath } from "./utils/pathUtils";
import { debugLog } from "./utils/debug";

interface SimpleJsonViewerProps {
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

export const SimpleJsonViewer = memo(function SimpleJsonViewer({
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
  scrollContainerRef: _scrollContainerRef,
  totalLineCount,
  commentedPaths,
}: SimpleJsonViewerProps) {
  debugLog("[SimpleJsonViewer] RENDER");

  // Get rows from tree
  const effectiveRows = useMemo(() => {
    if (!tree) return [];
    const visibleNodes = getAllVisibleNodes(tree.rootNode);
    return visibleNodes.map((node, index) => treeNodeToFlatRow(node, index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, expansionVersion]); // expansionVersion forces re-computation on expand/collapse

  // Refs for scroll-to-match functionality
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Layout calculations (widths, heights, column sizes)
  const {
    maxLineNumberDigits,
    fixedColumnWidth,
    scrollableMinWidth,
    scrollableMaxWidth,
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

  // Scroll to match when search navigation occurs
  useEffect(() => {
    if (
      scrollToIndex !== undefined &&
      scrollToIndex >= 0 &&
      scrollToIndex < effectiveRows.length
    ) {
      const row = effectiveRows[scrollToIndex];
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
  }, [scrollToIndex, effectiveRows]);
  // Note: rowRefs is a stable ref from useScrollPreservation hook, doesn't need to be in deps

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: stringWrapMode === "wrap" ? "100%" : "fit-content",
        minWidth: "100%",
        backgroundColor: theme.background,
        color: theme.foreground,
        fontFamily: "monospace",
      }}
    >
      <div style={{ position: "relative" }}>
        {effectiveRows.map((row, index) => {
          const searchMatch = matchMap.get(row.id);
          const isCurrentMatch = currentMatch?.rowId === row.id;
          const matchCount = matchCounts?.get(row.id);
          const rowJsonPath = pathArrayToJsonPath(row.pathArray);
          const commentRanges = commentedPaths?.get(rowJsonPath);

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
              style={{
                display: "grid",
                gridTemplateColumns: `${fixedColumnWidth}px auto`,
                width: stringWrapMode === "nowrap" ? undefined : "100%",
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
                  lineNumber={row.absoluteLineNumber ?? index + 1}
                  maxLineNumberDigits={maxLineNumberDigits}
                  searchMatch={searchMatch}
                  isCurrentMatch={isCurrentMatch}
                  matchCount={matchCount}
                  currentMatchIndexInRow={
                    isCurrentMatch ? currentMatchIndexInRow : undefined
                  }
                  onToggleExpansion={onToggleExpansion}
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
      {effectiveRows.length === 0 && (
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
