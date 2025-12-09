/**
 * SimpleJsonViewer - Non-virtualized JSON viewer
 *
 * Renders all rows without virtualization.
 * Best for small datasets (<500 rows) where virtualization overhead isn't worth it.
 */

import { useEffect, useMemo, memo, type RefObject } from "react";
import { type SearchMatch, type JSONTheme, type StringWrapMode } from "./types";
import type { TreeState } from "./utils/treeStructure";
import { getAllVisibleNodes, treeNodeToFlatRow } from "./utils/treeNavigation";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { useJsonSearch } from "./hooks/useJsonSearch";
import { useJsonViewerLayout } from "./hooks/useJsonViewerLayout";
import { useScrollPreservation } from "./hooks/useScrollPreservation";
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
  stringWrapMode = "truncate",
  truncateStringsAt = null,
  onToggleExpansion,
  className,
  scrollToIndex,
  scrollContainerRef: _scrollContainerRef,
  totalLineCount,
}: SimpleJsonViewerProps) {
  debugLog("[SimpleJsonViewer] RENDER");

  // Get rows from tree
  const effectiveRows = useMemo(() => {
    if (!tree) return [];
    const visibleNodes = getAllVisibleNodes(tree.rootNode);
    return visibleNodes.map((node, index) => treeNodeToFlatRow(node, index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, expansionVersion]); // expansionVersion forces re-computation on expand/collapse

  // Scroll preservation logic
  const { containerRef, rowRefs } = useScrollPreservation({
    rows: effectiveRows,
    onToggleExpansion,
  });

  // Use tree toggle directly (scroll preservation is handled by tree expansion logic)
  const finalHandleToggleExpansion = onToggleExpansion;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex, effectiveRows]);
  // Note: rowRefs is a stable ref from useScrollPreservation hook, doesn't need to be in deps

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `${fixedColumnWidth}px auto`,
        width: stringWrapMode === "wrap" ? "100%" : "fit-content",
        minWidth: "100%",
        backgroundColor: theme.background,
        color: theme.foreground,
        fontFamily: "monospace",
      }}
    >
      {/* Fixed column (line numbers + expand buttons) - sticky */}
      <div
        style={{
          position: "sticky",
          left: 0,
          zIndex: 2,
          backgroundColor: theme.background,
          overflow: "hidden",
        }}
      >
        {effectiveRows.map((row, index) => {
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
              onToggleExpansion={finalHandleToggleExpansion}
              stringWrapMode={stringWrapMode}
            />
          );
        })}
      </div>

      {/* Scrollable column (indent + key + value + badges + copy) */}
      <div
        style={{
          minWidth: scrollableMinWidth ? `${scrollableMinWidth}px` : undefined,
          maxWidth: scrollableMaxWidth ? `${scrollableMaxWidth}px` : undefined,
        }}
      >
        {effectiveRows.map((row) => {
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
