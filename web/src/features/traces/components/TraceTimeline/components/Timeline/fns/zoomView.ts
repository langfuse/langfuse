import type { TimeSpan } from "../types";
import { clamp } from "./clamp";
import { clampView } from "./clampView";
import { finite } from "./finite";

export function zoomView(
  view: TimeSpan,
  space: TimeSpan,
  options: { factor: number; anchorRatio: number },
): TimeSpan {
  const factor = finite(options.factor, 1);
  if (factor <= 0) return clampView(view, space);

  const anchorRatio = clamp(finite(options.anchorRatio, 0.5), 0, 1);
  const anchorMs = view.start + view.duration * anchorRatio;
  const duration = view.duration / factor;

  return clampView(
    { start: anchorMs - duration * anchorRatio, duration },
    space,
  );
}
