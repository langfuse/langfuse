/**
 * usePanelState - Calculate dynamic min/max panel sizes based on container width
 *
 * Purpose:
 * - Ensure panels are always usable on any screen size
 * - Convert pixel constraints to percentages based on container width
 * - Update constraints dynamically when window resizes
 *
 * Usage:
 * ```tsx
 * const { minSize, maxSize } = usePanelState("trace2-layout");
 * <CollapsiblePanel minSize={minSize} maxSize={maxSize} />
 * ```
 */

import { useState, useLayoutEffect } from "react";

interface PanelState {
  minSize: number; // Percentage
  maxSize: number; // Percentage
}

interface UsePanelStateOptions {
  minWidthPx?: number; // Minimum panel width in pixels
  maxWidthPx?: number; // Maximum panel width in pixels
  maxPercentage?: number; // Absolute max as percentage (e.g., 80)
}

export function usePanelState(
  panelGroupId: string,
  options: UsePanelStateOptions = {},
) {
  const { minWidthPx = 255, maxWidthPx = 700, maxPercentage = 80 } = options;

  const [panelState, setPanelState] = useState<PanelState>({
    minSize: 10, // Start with low default, will be updated by ResizeObserver
    maxSize: 70,
  });

  // Handle PanelGroup width changes
  useLayoutEffect(() => {
    const panelGroup = document.querySelector(
      `[data-panel-group-id="${panelGroupId}"]`,
    );
    if (!panelGroup) return;

    const resizeObserver = new ResizeObserver(() => {
      const width = panelGroup.getBoundingClientRect().width;

      if (width <= 0) return;

      // Calculate min size: ensure panel is at least minWidthPx
      // But cap at 60% to avoid taking up entire container
      const minSize = Math.max(10, Math.min(60, (minWidthPx / width) * 100));

      // Calculate max size: ensure panel doesn't exceed maxWidthPx
      // But cap at maxPercentage to leave room for other panels
      const calculatedMax = (maxWidthPx / width) * 100;
      const maxSize = Math.max(25, Math.min(maxPercentage, calculatedMax));

      setPanelState((prev) => {
        if (prev.minSize !== minSize || prev.maxSize !== maxSize) {
          return { minSize, maxSize };
        }
        return prev;
      });
    });

    resizeObserver.observe(panelGroup);

    return () => {
      resizeObserver.disconnect();
    };
  }, [panelGroupId, minWidthPx, maxWidthPx, maxPercentage]);

  return {
    minSize: panelState.minSize,
    maxSize: panelState.maxSize,
  };
}
