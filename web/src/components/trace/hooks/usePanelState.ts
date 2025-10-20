import { useState, useLayoutEffect } from "react";

interface PanelState {
  minSize: number;
  maxSize: number;
}

export function usePanelState(
  panelGroupId: string,
  viewType: "timeline" | "tree",
) {
  const MIN_WIDTH_PX = 255;
  const MAX_TREE_WIDTH_PX = 700;

  const [panelState, setPanelState] = useState<PanelState>({
    minSize: 10, // Start with low default, will be updated by ResizeObserver
    maxSize: viewType === "timeline" ? 80 : 70,
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

      const minSize = Math.max(10, Math.min(60, (MIN_WIDTH_PX / width) * 100));
      const maxSize =
        viewType === "timeline"
          ? 80
          : Math.max(25, Math.min(70, (MAX_TREE_WIDTH_PX / width) * 100));

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
  }, [panelGroupId, viewType]);

  return {
    minSize: panelState.minSize,
    maxSize: panelState.maxSize,
  };
}
