import type { TimeSpan } from "../types";
import { MAX_ZOOM_PRECISION_MS } from "../constants";
import { clamp } from "./clamp";
import { clampView } from "./clampView";
import { finite } from "./finite";

export function zoomToSpan(
  target: TimeSpan,
  space: TimeSpan,
  paddingRatio = 0.1,
): TimeSpan {
  const targetDuration = Math.max(finite(target.duration, 0), 0);
  const padding = Math.max(
    targetDuration * clamp(finite(paddingRatio, 0), 0, 1),
    MAX_ZOOM_PRECISION_MS,
  );
  return clampView(
    {
      start: finite(target.start, space.start) - padding,
      duration: targetDuration + padding * 2,
    },
    space,
  );
}
