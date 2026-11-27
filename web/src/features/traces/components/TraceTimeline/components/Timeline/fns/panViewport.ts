import type { Viewport, ViewportLimits } from "../types";
import { clampViewport } from "./clampViewport";
import { finite } from "./finite";

export function panViewport(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { dxPx: number; dyPx: number; boxWidth: number },
): Viewport {
  const boxWidth = Math.max(finite(options.boxWidth, 0), 0);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);

  const msPerPx = boxWidth > 0 ? viewport.time.duration / boxWidth : 0;
  const rowsPerPx = boxHeight > 0 ? viewport.rows.count / boxHeight : 0;

  return clampViewport(
    {
      time: {
        start: viewport.time.start - finite(options.dxPx, 0) * msPerPx,
        duration: viewport.time.duration,
      },
      rows: {
        start: viewport.rows.start - finite(options.dyPx, 0) * rowsPerPx,
        count: viewport.rows.count,
      },
    },
    limits,
  );
}
