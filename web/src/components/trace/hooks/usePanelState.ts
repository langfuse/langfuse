import {
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
  useRef,
} from "react";
import useLocalStorage from "@/src/components/useLocalStorage";

interface PanelState {
  sizes: number[]; // [leftPanelSize, rightPanelSize]
  minSize: number;
  maxSize: number;
}

export function usePanelState(
  containerRef: React.RefObject<HTMLDivElement | null>,
  viewType: "timeline" | "tree",
) {
  const previousViewTypeRef = useRef<string>(viewType);

  const [timelineSizes, setTimelineSizes] = useLocalStorage(
    "trace-detail-timeline",
    [30, 70],
  );
  const [treeSizes, setTreeSizes] = useLocalStorage(
    "trace-detail-tree",
    [30, 70],
  );

  const [panelState, setPanelState] = useState<PanelState>(() => {
    const savedSizes = viewType === "timeline" ? timelineSizes : treeSizes;

    return {
      sizes: savedSizes,
      minSize: 25, // Will be updated by ResizeObserver
      maxSize: viewType === "timeline" ? 80 : 70, // Will be updated by ResizeObserver
    };
  });

  // Handle view switching
  useEffect(() => {
    if (previousViewTypeRef.current !== viewType) {
      const newSizes = viewType === "timeline" ? timelineSizes : treeSizes;

      setPanelState((prev) => ({
        ...prev,
        sizes: newSizes,
        maxSize: viewType === "timeline" ? 80 : 70,
      }));

      previousViewTypeRef.current = viewType;
    }
  }, [viewType, timelineSizes, treeSizes]);

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
          return { ...prev, minSize, maxSize };
        }
        return prev;
      });
    },
    [viewType],
  );

  const onLayout = useCallback(
    (sizes: number[]) => {
      if (viewType === "timeline") {
        setTimelineSizes(sizes);
      } else {
        setTreeSizes(sizes);
      }

      setPanelState((prev) => ({ ...prev, sizes }));
    },
    [viewType, setTimelineSizes, setTreeSizes],
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
    sizes: panelState.sizes,
    minSize: panelState.minSize,
    maxSize: panelState.maxSize,
    onLayout,
  };
}
