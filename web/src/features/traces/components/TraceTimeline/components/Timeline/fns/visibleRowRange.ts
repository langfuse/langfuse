import type { Viewport } from "../types";
import { finite } from "./finite";

export function visibleRowRange(
  viewport: Viewport,
  rowCount: number,
  overscan = 2,
): { startIndex: number; endIndex: number } {
  const total = Math.max(Math.floor(finite(rowCount, 0)), 0);
  if (total === 0) return { startIndex: 0, endIndex: -1 };
  const start = Math.max(
    Math.floor(finite(viewport.rows.start, 0)) - overscan,
    0,
  );
  const end = Math.min(
    Math.ceil(finite(viewport.rows.start, 0) + finite(viewport.rows.count, 0)) +
      overscan,
    total - 1,
  );
  return { startIndex: start, endIndex: Math.max(end, start) };
}

/**
 * A point on the way from one viewport to another, for animating a focus.
 *
 * Scales interpolate GEOMETRICALLY and offsets linearly. A linear interpolation
 * of a duration reads wrong — it crawls at the wide end and then lurches — which
 * is the same reason zoom is exponential in a level: halving is halving whether
 * you are at 24s or 240ms.
 */
