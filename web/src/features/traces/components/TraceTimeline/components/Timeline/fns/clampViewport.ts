import type { Viewport, ViewportLimits } from "../types";
import { clamp } from "./clamp";
import { clampView } from "./clampView";
import { finite } from "./finite";
import { rowCountBounds } from "./rowCountBounds";

export function clampViewport(
  viewport: Viewport,
  limits: ViewportLimits,
): Viewport {
  const rowCount = Math.max(Math.floor(finite(limits.rowCount, 0)), 0);
  const bounds = rowCountBounds(limits);
  const count = clamp(
    finite(viewport.rows.count, bounds.max),
    bounds.min,
    bounds.max,
  );
  const start = clamp(
    finite(viewport.rows.start, 0),
    0,
    Math.max(rowCount - count, 0),
  );
  return {
    time: clampView(viewport.time, limits.traceSpace),
    rows: { start, count },
  };
}
