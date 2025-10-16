import { useState, useCallback, useLayoutEffect } from "react";

interface PanelState {
  minSize: number;
  maxSize: number;
}

export function usePanelState(
  containerRef: React.RefObject<HTMLDivElement | null>,
  viewType: "timeline" | "tree",
) {
  const [panelState, setPanelState] = useState<PanelState>({
    minSize: 25, // Will be updated by ResizeObserver
    maxSize: viewType === "timeline" ? 80 : 70, // Will be updated by ResizeObserver
  });

  const updateConstraints = useCallback(
    (containerWidth: number) => {
      const MIN_WIDTH_PX = 355;
      const MAX_TREE_WIDTH_PX = 700;

      if (containerWidth <= 0) return;

      const minSize = Math.max(
        10,
        Math.min(60, (MIN_WIDTH_PX / containerWidth) * 100),
      );
      const maxSize =
        viewType === "timeline"
          ? 80
          : Math.max(
              25,
              Math.min(70, (MAX_TREE_WIDTH_PX / containerWidth) * 100),
            );

      setPanelState((prev) => {
        if (prev.minSize !== minSize || prev.maxSize !== maxSize) {
          return { minSize, maxSize };
        }
        return prev;
      });
    },
    [viewType],
  );

  // Handle container width changes
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateConstraints(entry.contentRect.width);
      }
    });

    // Initial calculation
    updateConstraints(container.offsetWidth);

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateConstraints, containerRef]);

  return {
    minSize: panelState.minSize,
    maxSize: panelState.maxSize,
  };
}
