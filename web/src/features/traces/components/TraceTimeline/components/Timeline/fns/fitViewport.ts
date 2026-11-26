import type { Viewport, ViewportLimits } from "../types";
import { rowCountBounds } from "./rowCountBounds";

export function fitViewport(limits: ViewportLimits): Viewport {
  const bounds = rowCountBounds(limits);
  return {
    time: {
      start: limits.traceSpace.start,
      duration: limits.traceSpace.duration,
    },
    rows: { start: 0, count: bounds.max },
  };
}
