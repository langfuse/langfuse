/**
 * useVirtualizerScrollRestoration - Hook for managing scroll position during virtualizer remounts
 *
 * Handles the complex logic of preserving scroll position when the virtualizer is remounted
 * due to row count changes (expand/collapse) or wrap mode changes.
 *
 * Strategy:
 * 1. Capture toggled row's viewport position before expansion/collapse
 * 2. Force virtualizer remount to invalidate stale TanStack Virtual cache
 * 3. Restore scroll position using double RAF to ensure measurements are stable
 *
 * Used by VirtualizedJsonViewer
 */

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  type RefObject,
} from "react";
import type { FlatJSONRow, StringWrapMode } from "../types";

interface UseVirtualizerScrollRestorationParams {
  rows: FlatJSONRow[];
  stringWrapMode: StringWrapMode;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  parentRef: RefObject<HTMLDivElement>;
  onToggleExpansion?: (rowId: string) => void;
}

export function useVirtualizerScrollRestoration({
  rows,
  stringWrapMode,
  scrollContainerRef,
  parentRef,
  onToggleExpansion,
}: UseVirtualizerScrollRestorationParams) {
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

          setPendingScrollRestore({
            toggledRowId: rowId,
            viewportOffsetTop,
            scrollLeft: scrollElement.scrollLeft,
          });
        }
      }

      onToggleExpansion(rowId);
    },
    [onToggleExpansion, rows, scrollContainerRef, parentRef],
  );

  // Force complete virtualizer remount when rows are added/removed (expand/collapse)
  // TanStack Virtual's measurement cache becomes stale when row indices shift due to
  // expansion/collapse. Remounting ensures accurate positioning for all rows.
  useEffect(() => {
    if (prevRowCountRef.current !== rows.length) {
      // Force virtualizer remount by changing key (invalidates entire cache)
      setVirtualizerKey((prev) => prev + 1);
      prevRowCountRef.current = rows.length;
    }
  }, [rows.length]);

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

    const { toggledRowId, viewportOffsetTop, scrollLeft } =
      pendingScrollRestore;
    const scrollElement = scrollContainerRef?.current || parentRef.current;

    if (!scrollElement) {
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

          // Adjust scroll position (both vertical and horizontal)
          scrollElement.scrollTop += scrollDelta;
          scrollElement.scrollLeft = scrollLeft;
        }

        // Clear pending restoration
        setPendingScrollRestore(null);
      });
    });
  }, [pendingScrollRestore, rows, scrollContainerRef, parentRef]);

  return {
    virtualizerKey,
    handleToggleExpansion,
  };
}
