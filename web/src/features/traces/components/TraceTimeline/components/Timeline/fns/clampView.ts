import type { TimeSpan } from "../types";
import { MAX_ZOOM_PRECISION_MS } from "../constants";
import { clamp } from "./clamp";
import { finite } from "./finite";

export function clampView(view: TimeSpan, space: TimeSpan): TimeSpan {
  const spaceDuration = Math.max(finite(space.duration, 0), 0);
  const duration = clamp(
    finite(view.duration, spaceDuration),
    Math.min(MAX_ZOOM_PRECISION_MS, spaceDuration),
    spaceDuration,
  );
  const start = clamp(
    finite(view.start, space.start),
    space.start,
    space.start + spaceDuration - duration,
  );
  return { start, duration };
}
