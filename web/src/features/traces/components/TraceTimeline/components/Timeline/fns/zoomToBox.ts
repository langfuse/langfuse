import type { Viewport, ViewportLimits } from "../types";
import { clamp } from "./clamp";
import { clampViewport } from "./clampViewport";
import { finite } from "./finite";

export function zoomToBox(
  viewport: Viewport,
  limits: ViewportLimits,
  box: {
    xStartRatio: number;
    xEndRatio: number;
    yStartRatio: number;
    yEndRatio: number;
  },
): Viewport {
  const from = clampViewport(viewport, limits);
  const x0 = clamp(finite(box.xStartRatio, 0), 0, 1);
  const x1 = clamp(finite(box.xEndRatio, 1), 0, 1);
  const y0 = clamp(finite(box.yStartRatio, 0), 0, 1);
  const y1 = clamp(finite(box.yEndRatio, 1), 0, 1);
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  // A zero-width or zero-height box would ask for an infinite zoom; keep that
  // axis as it is rather than refusing the whole gesture.
  const duration =
    right > left ? from.time.duration * (right - left) : from.time.duration;
  const count =
    bottom > top ? from.rows.count * (bottom - top) : from.rows.count;

  return clampViewport(
    {
      time: { start: from.time.start + from.time.duration * left, duration },
      rows: { start: from.rows.start + from.rows.count * top, count },
    },
    limits,
  );
}
