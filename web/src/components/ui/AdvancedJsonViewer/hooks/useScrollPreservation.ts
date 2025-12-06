/**
 * useScrollPreservation - Hook for preserving scroll position in non-virtualized viewer
 *
 * Simpler version of scroll preservation for SimpleJsonViewer (non-virtualized).
 * Tracks the toggled row's position and restores it after the DOM updates.
 *
 * Used by SimpleJsonViewer
 */

import { useRef, useLayoutEffect, useCallback, useEffect } from "react";
import type { FlatJSONRow } from "../types";

interface UseScrollPreservationParams {
  rows: FlatJSONRow[];
  onToggleExpansion?: (rowId: string) => void;
}

export function useScrollPreservation({
  rows,
  onToggleExpansion,
}: UseScrollPreservationParams) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastToggledRowRef = useRef<{
    rowId: string;
    offsetFromTop: number;
  } | null>(null);

  // Clean up refs for rows that no longer exist to prevent memory leak
  useEffect(() => {
    const currentRowIds = new Set(rows.map((r) => r.id));
    rowRefs.current.forEach((_, rowId) => {
      if (!currentRowIds.has(rowId)) {
        rowRefs.current.delete(rowId);
      }
    });
  }, [rows]);

  // Wrapped toggle handler that preserves scroll position
  const handleToggleExpansion = useCallback(
    (rowId: string) => {
      if (!onToggleExpansion) return;

      const element = rowRefs.current.get(rowId);
      if (element && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const offsetFromTop = elementRect.top - containerRect.top;
        lastToggledRowRef.current = {
          rowId,
          offsetFromTop,
        };
      }

      onToggleExpansion(rowId);
    },
    [onToggleExpansion],
  );

  // Restore scroll position after expansion/collapse
  // This effect runs after the rows array has changed (DOM updated)
  useLayoutEffect(() => {
    if (!lastToggledRowRef.current) return;

    const { rowId, offsetFromTop } = lastToggledRowRef.current;
    const element = rowRefs.current.get(rowId);

    if (element && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const currentOffset = elementRect.top - containerRect.top;
      const scrollAdjustment = currentOffset - offsetFromTop;

      if (scrollAdjustment !== 0) {
        containerRef.current.scrollTop += scrollAdjustment;
      }
    }

    lastToggledRowRef.current = null;
  });

  return {
    containerRef,
    rowRefs,
    handleToggleExpansion,
  };
}
