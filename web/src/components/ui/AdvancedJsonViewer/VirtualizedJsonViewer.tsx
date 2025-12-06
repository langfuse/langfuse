/**
 * VirtualizedJsonViewer - Virtualized JSON viewer using TanStack Virtual
 *
 * Renders only visible rows for optimal performance with large datasets.
 * Uses @tanstack/react-virtual which is already in project dependencies.
 */

import {
  useRef,
  useMemo,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type FlatJSONRow,
  type SearchMatch,
  type JSONTheme,
  type StringWrapMode,
} from "./types";
import { JsonRowFixed } from "./components/JsonRowFixed";
import { JsonRowScrollable } from "./components/JsonRowScrollable";
import { createHeightEstimator } from "./utils/estimateRowHeight";
import { getCurrentMatchIndexInRow } from "./utils/searchJson";
import { calculateMinimumWidth } from "./utils/calculateWidth";
import { calculateFixedColumnWidth } from "./utils/calculateFixedColumnWidth";

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
  const prevRowCountRef = useRef(rows.length);
  const prevWrapModeRef = useRef(stringWrapMode);

  // Key to force complete virtualizer remount when row structure or wrap mode changes
  // This is necessary because TanStack Virtual maintains an index-based measurement cache.
  // When rows are added/removed (expand/collapse), the same index points to different rows,
  // but the cache still contains stale measurements and positions from the old rows at those indices.
  // Similarly, when wrap mode changes, all row heights may change but the cache isn't invalidated.
  // By changing this key, we force React to unmount and remount the virtualizer container,
  // giving TanStack Virtual a fresh start with an empty cache.
  const [virtualizerKey, setVirtualizerKey] = useState(0);

  // Pending scroll restoration - stored in state so it survives virtualizer remount
  // After remount, useLayoutEffect will restore the scroll position before browser paint
  // We track the toggled row and its viewport position, so it stays in the same visual location
  // Also preserve horizontal scroll to prevent left/right jumping
  const [pendingScrollRestore, setPendingScrollRestore] = useState<{
    toggledRowId: string; // The row that was clicked
    viewportOffsetTop: number; // Distance from viewport top
    scrollLeft: number; // Horizontal scroll position
  } | null>(null);

  // Calculate maximum number of digits needed for line numbers
  // Use totalLineCount if provided, otherwise fall back to current rows length
  const maxLineNumberDigits = useMemo(() => {
    const lineCount = totalLineCount ?? rows.length;
    return Math.max(1, Math.floor(Math.log10(lineCount)) + 1);
  }, [totalLineCount, rows.length]);

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

  // Wrapped toggle handler that captures scroll position
  const handleToggleExpansion = useCallback(
    (rowId: string) => {
      if (!onToggleExpansion) return;

      // Capture the toggled row's position relative to viewport
      // This ensures the clicked row stays exactly where it was visually
      const scrollElement = scrollContainerRef?.current || parentRef.current;
      if (scrollElement) {
        // Find the toggled row's index and DOM element
        const rowIndex = rows.findIndex((r) => r.id === rowId);
        const rowElement = scrollElement.querySelector(
          `[data-index="${rowIndex}"]`,
        );

        if (rowElement) {
          const rect = rowElement.getBoundingClientRect();
          const containerRect = scrollElement.getBoundingClientRect();
          const viewportOffsetTop = rect.top - containerRect.top;

          console.log("[Toggle] Capturing toggled row position:", {
            rowId,
            rowIndex,
            viewportOffsetTop,
            scrollLeft: scrollElement.scrollLeft,
          });

          setPendingScrollRestore({
            toggledRowId: rowId,
            viewportOffsetTop,
            scrollLeft: scrollElement.scrollLeft,
          });
        } else {
          console.log("[Toggle] Row element not found:", rowId);
        }
      } else {
        console.log("[Toggle] No scroll element found");
      }

      onToggleExpansion(rowId);
    },
    [onToggleExpansion, rows, scrollContainerRef],
  );

  // Force complete virtualizer remount when rows are added/removed (expand/collapse)
  // TanStack Virtual's measurement cache becomes stale when row indices shift due to
  // expansion/collapse. Remounting ensures accurate positioning for all rows.
  useEffect(() => {
    if (prevRowCountRef.current !== rows.length) {
      console.log("[Remount Effect] Row count changed:", {
        prev: prevRowCountRef.current,
        new: rows.length,
        pendingScrollRestore,
      });
      // Force virtualizer remount by changing key (invalidates entire cache)
      setVirtualizerKey((prev) => {
        console.log(
          "[Remount Effect] Incrementing virtualizer key:",
          prev,
          "->",
          prev + 1,
        );
        return prev + 1;
      });
      prevRowCountRef.current = rows.length;
    }
  }, [rows.length, pendingScrollRestore]);

  // Force complete virtualizer remount when wrap mode changes
  // When switching between wrap/nowrap/truncate modes, row heights change significantly
  // but the cached measurements don't automatically update. Remounting fixes this.
  useEffect(() => {
    if (prevWrapModeRef.current !== stringWrapMode) {
      // Force virtualizer remount by changing key (invalidates entire cache)
      setVirtualizerKey((prev) => prev + 1);
      prevWrapModeRef.current = stringWrapMode;
    }
  }, [stringWrapMode]);

  // Restore scroll position after virtualizer remount
  // Uses useLayoutEffect to run synchronously before browser paint, preventing visible jump
  useLayoutEffect(() => {
    if (!pendingScrollRestore) return;

    console.log(
      "[Layout Effect] Attempting scroll restoration:",
      pendingScrollRestore,
    );

    const { toggledRowId, viewportOffsetTop, scrollLeft } =
      pendingScrollRestore;
    const scrollElement = scrollContainerRef?.current || parentRef.current;

    if (!scrollElement) {
      console.log("[Layout Effect] No scroll element, clearing pending state");
      setPendingScrollRestore(null);
      return;
    }

    // Use double RAF to ensure virtualizer measurements are stable
    // Frame 1: React commits DOM, virtualizer starts measuring
    // Frame 2: Measurements complete, layout stable
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Find the toggled row's new index and DOM element
        const newIndex = rows.findIndex((r) => r.id === toggledRowId);
        const rowElement = scrollElement.querySelector(
          `[data-index="${newIndex}"]`,
        );

        if (rowElement) {
          // Get actual DOM measurements (not estimates)
          const currentRect = rowElement.getBoundingClientRect();
          const containerRect = scrollElement.getBoundingClientRect();
          const currentOffsetTop = currentRect.top - containerRect.top;

          // Calculate how much to adjust scroll to maintain visual position
          const scrollDelta = currentOffsetTop - viewportOffsetTop;

          console.log("[Layout Effect RAF2] Restoring scroll:", {
            toggledRowId,
            newIndex,
            currentOffsetTop,
            targetOffsetTop: viewportOffsetTop,
            scrollDelta,
            scrollLeftBefore: scrollElement.scrollLeft,
            scrollLeftTarget: scrollLeft,
          });

          // Adjust scroll position (both vertical and horizontal)
          scrollElement.scrollTop += scrollDelta;
          scrollElement.scrollLeft = scrollLeft;

          console.log("[Layout Effect RAF2] After scroll restoration:", {
            scrollTop: scrollElement.scrollTop,
            scrollLeft: scrollElement.scrollLeft,
          });
        } else {
          console.log("[Layout Effect RAF2] Row element not found:", {
            toggledRowId,
            newIndex,
          });
        }

        // Clear pending restoration
        setPendingScrollRestore(null);
      });
    });
  }, [pendingScrollRestore, rows, scrollContainerRef]);

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
        key={virtualizerKey} // Force remount when key changes to invalidate TanStack Virtual's cache
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
