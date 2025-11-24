/**
 * usePanelSizeMemory - Remember last non-collapsed panel size
 *
 * Solves: Collapse → Expand → Restore previous width (not default)
 *
 * Usage:
 * - Call captureSize() on every resize when panel is not collapsed
 * - Call getRestoreSize() when expanding to get last known size
 */

import { useRef } from "react";

export function usePanelSizeMemory(
  panelId: string,
  defaultSize: number,
  collapsedThreshold: number = 5,
) {
  const lastNonCollapsedSizeRef = useRef<number>(defaultSize);

  const captureSize = (currentSize: number) => {
    // Only remember sizes that are not collapsed
    if (currentSize > collapsedThreshold) {
      lastNonCollapsedSizeRef.current = currentSize;
    }
  };

  const getRestoreSize = () => {
    return lastNonCollapsedSizeRef.current;
  };

  return { captureSize, getRestoreSize };
}
