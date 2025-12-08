/**
 * useVirtualizerScrollRestoration - Hook for managing scroll position during expand/collapse
 *
 * Uses TanStack Virtual's built-in scrollToIndex to maintain the toggled row's position
 * after expansion/collapse. This is much simpler and faster than DOM-based restoration.
 *
 * Strategy:
 * 1. Remember which row was toggled
 * 2. After state update, find that row's new index (by ID, using getItemKey)
 * 3. Use virtualizer.scrollToIndex to scroll back to that row
 *
 * Used by VirtualizedJsonViewer
 */

import { useRef, useCallback, useLayoutEffect } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { FlatJSONRow } from "../types";

interface UseVirtualizerScrollRestorationParams {
  rows: FlatJSONRow[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  onToggleExpansion?: (rowId: string) => void;
}

export function useVirtualizerScrollRestoration({
  rows,
  virtualizer,
  onToggleExpansion,
}: UseVirtualizerScrollRestorationParams) {
  // Track which row was toggled and its position before toggle
  const toggledRowRef = useRef<{
    rowId: string;
    scrollOffset: number; // Current scroll position before toggle
  } | null>(null);
  const prevRowsLength = useRef(rows.length);

  // Wrapped toggle handler that captures current scroll position
  const handleToggleExpansion = useCallback(
    (rowId: string) => {
      if (!onToggleExpansion) return;

      console.log("[useVirtualizerScrollRestoration] Toggling row:", rowId);

      // Capture current scroll position
      const currentScrollOffset = virtualizer.scrollOffset ?? 0;

      toggledRowRef.current = {
        rowId,
        scrollOffset: currentScrollOffset,
      };

      onToggleExpansion(rowId);
    },
    [onToggleExpansion, virtualizer],
  );

  // After rows update, maintain scroll position
  useLayoutEffect(() => {
    // Only restore if row count changed (expansion/collapse happened)
    if (prevRowsLength.current === rows.length || !toggledRowRef.current) {
      prevRowsLength.current = rows.length;
      return;
    }

    const { rowId, scrollOffset } = toggledRowRef.current;

    console.log(
      `[useVirtualizerScrollRestoration] Row count changed ${prevRowsLength.current} → ${rows.length}, maintaining scroll position for row:`,
      rowId,
      "at offset:",
      scrollOffset,
    );

    // Simply restore the scroll offset - TanStack Virtual with getItemKey
    // will maintain correct item positions automatically
    virtualizer.scrollToOffset(scrollOffset, {
      align: "start",
      behavior: "auto",
    });

    prevRowsLength.current = rows.length;
    toggledRowRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rows.length]); // virtualizer intentionally omitted - see comment below
  // Note: virtualizer is accessed via closure and changes on every render.
  // Including it in deps would cause infinite re-render loop:
  // render → new virtualizer → effect → scrollToOffset → virtualizer state update → render → ...
  // We only want this effect to run when rows actually change (expansion/collapse)

  return {
    handleToggleExpansion,
  };
}
