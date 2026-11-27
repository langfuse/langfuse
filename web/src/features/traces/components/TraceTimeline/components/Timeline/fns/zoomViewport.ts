import type { Viewport, ViewportLimits } from "../types";
import { clamp } from "./clamp";
import { clampViewport } from "./clampViewport";
import { finite } from "./finite";

type ZoomAxes = "both" | "x" | "y";

/**
 * Zoom about a point in the box, given as ratios of its width and height.
 * `factor > 1` zooms in. The content under the anchor stays under it.
 *
 * `axes` defaults to both. `"y"` grows or shrinks only the rows, which is how
 * a long trace can keep its full duration on screen while the labels return.
 * @internal
 */
export function zoomViewport(
  viewport: Viewport,
  limits: ViewportLimits,
  options: {
    factor: number;
    xRatio: number;
    yRatio: number;
    axes?: ZoomAxes;
  },
): Viewport {
  const factor = finite(options.factor, 1);
  if (factor <= 0) return clampViewport(viewport, limits);

  const axes = options.axes ?? "both";
  const zoomX = axes !== "y";
  const zoomY = axes !== "x";
  const xRatio = clamp(finite(options.xRatio, 0.5), 0, 1);
  const yRatio = clamp(finite(options.yRatio, 0.5), 0, 1);

  const anchorMs = viewport.time.start + viewport.time.duration * xRatio;
  const timeDuration = zoomX
    ? viewport.time.duration / factor
    : viewport.time.duration;

  const anchorRow = viewport.rows.start + viewport.rows.count * yRatio;
  const rowsCount = zoomY ? viewport.rows.count / factor : viewport.rows.count;

  return clampViewport(
    {
      time: {
        start: zoomX ? anchorMs - timeDuration * xRatio : viewport.time.start,
        duration: timeDuration,
      },
      rows: {
        start: zoomY ? anchorRow - rowsCount * yRatio : viewport.rows.start,
        count: rowsCount,
      },
    },
    limits,
  );
}
