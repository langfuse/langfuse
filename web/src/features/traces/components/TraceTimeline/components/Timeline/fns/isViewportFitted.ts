import type { Viewport, ViewportLimits } from "../types";
import { rowCountBounds } from "./rowCountBounds";

export const isViewportFitted = (
  viewport: Viewport,
  limits: ViewportLimits,
): boolean => {
  const bounds = rowCountBounds(limits);
  return (
    viewport.time.duration >= limits.traceSpace.duration - 0.5 &&
    viewport.rows.count >= bounds.max - 0.001 &&
    viewport.rows.start <= 0.001
  );
};
