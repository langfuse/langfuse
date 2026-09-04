import { useCallback, useRef, useState } from "react";

/**
 * Measures a container and reports how many fixed-height rows fit inside it, so
 * a list/table/bar-chart can render exactly that many by default — filling the
 * tile with NO scrollbar and no dead gap — and defer the rest to a "Show all"
 * affordance. Re-measures whenever the container resizes (tile drag/resize,
 * viewport change). (LFE-11035)
 *
 * Uses a callback ref (not useRef + useEffect) so the ResizeObserver attaches
 * the moment the measured node mounts — critical here because the node lives
 * behind a loading gate and only appears once data has loaded.
 *
 * The observed element must have a height that does NOT depend on how many rows
 * are rendered (e.g. a `flex-1 min-h-0` region that fills leftover card height),
 * otherwise measuring and rendering would feed back into each other.
 */
export function useFitRowCount({
  rowHeightPx,
  reservedPx = 0,
  min = 1,
  fallback,
}: {
  /** Approximate height of one row, including its spacing. */
  rowHeightPx: number;
  /** Height consumed by non-row chrome inside the measured box (axis, etc.). */
  reservedPx?: number;
  /** Never report fewer than this many rows. */
  min?: number;
  /** Row count to use before the first measurement (SSR / initial paint). */
  fallback: number;
}) {
  const [rowCount, setRowCount] = useState<number>(fallback);
  // Measured px height of the container. `null` until first measured; consumers
  // that need a definite height (e.g. recharts) fall back until then.
  const [height, setHeight] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || typeof ResizeObserver === "undefined") return;

      const measure = () => {
        const measuredHeight = node.clientHeight;
        const fit = Math.floor((measuredHeight - reservedPx) / rowHeightPx);
        setHeight(measuredHeight);
        setRowCount(Math.max(min, Number.isFinite(fit) ? fit : min));
      };

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      observerRef.current = observer;
    },
    [rowHeightPx, reservedPx, min],
  );

  return { containerRef, rowCount, height };
}
