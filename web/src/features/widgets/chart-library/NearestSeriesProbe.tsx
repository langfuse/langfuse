import { useEffect, useMemo, useRef } from "react";
import {
  useActiveTooltipCoordinate,
  useActiveTooltipDataPoints,
  useIsTooltipActive,
  useYAxisScale,
} from "recharts";

/** Two lines count as overlapping (both highlight) within this many pixels. */
const COLOCATED_PX = 1;

/**
 * Detects the single series line the cursor is vertically nearest to at the
 * hovered x and reports it upward so the chart can emphasize it. Renders
 * nothing — it only reads recharts' active-hover state via hooks, so it MUST be
 * a child of the chart (LineChart/AreaChart). (LFE-10549)
 *
 * Reports the nearest line only when the cursor is within `thresholdPx` of it
 * (otherwise nothing — the chart renders normally). A second line is reported
 * only when it sits within {@link COLOCATED_PX} of the nearest one, i.e. they
 * overlap at that pixel. Gate with `enabled` so a synced sibling chart (whose
 * crosshair tracks via syncId) doesn't react to a cursor that isn't over it.
 */
export function NearestSeriesProbe({
  dimensions,
  thresholdPx = 8,
  enabled = true,
  onNearestChange,
}: {
  dimensions: string[];
  thresholdPx?: number;
  enabled?: boolean;
  onNearestChange: (nearest: string[]) => void;
}) {
  const isActive = useIsTooltipActive();
  const coordinate = useActiveTooltipCoordinate();
  const yScale = useYAxisScale();
  const activePoints = useActiveTooltipDataPoints<Record<string, unknown>>();

  const nearest = useMemo(() => {
    const cursorY = coordinate?.y;
    const row = activePoints?.[0];
    if (
      !enabled ||
      !isActive ||
      typeof cursorY !== "number" ||
      !yScale ||
      !row
    ) {
      return [] as string[];
    }

    const positions: { dimension: string; pixelY: number }[] = [];
    for (const dimension of dimensions) {
      const value = row[dimension];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const pixelY = yScale(value);
      if (typeof pixelY !== "number") continue;
      positions.push({ dimension, pixelY });
    }
    if (positions.length === 0) return [];

    let closest = positions[0];
    for (const position of positions) {
      if (
        Math.abs(position.pixelY - cursorY) < Math.abs(closest.pixelY - cursorY)
      ) {
        closest = position;
      }
    }
    // Only highlight when the cursor is essentially on a line.
    if (Math.abs(closest.pixelY - cursorY) > thresholdPx) return [];
    // The nearest line, plus any line overlapping it at this pixel row.
    return positions
      .filter(
        (position) =>
          Math.abs(position.pixelY - closest.pixelY) <= COLOCATED_PX,
      )
      .map((position) => position.dimension);
  }, [
    enabled,
    isActive,
    coordinate,
    yScale,
    activePoints,
    dimensions,
    thresholdPx,
  ]);

  // Report only when the set actually changes (the cursor moving within a line's
  // band shouldn't churn parent state). JSON.stringify (not join) so two distinct
  // dimension lists can't collide on a shared separator.
  const key = JSON.stringify(nearest);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    onNearestChange(nearest);
  }, [key, nearest, onNearestChange]);

  return null;
}
