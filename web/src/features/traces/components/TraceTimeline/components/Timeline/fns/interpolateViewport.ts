import type { Viewport } from "../types";
import { clamp } from "./clamp";
import { finite } from "./finite";

export function interpolateViewport(
  from: Viewport,
  to: Viewport,
  t: number,
): Viewport {
  const progress = clamp(finite(t, 1), 0, 1);
  const lerp = (a: number, b: number) =>
    finite(a, b) + (finite(b, 0) - finite(a, b)) * progress;
  const scaleLerp = (a: number, b: number) => {
    const from_ = Math.max(finite(a, 1), 1e-6);
    const to_ = Math.max(finite(b, 1), 1e-6);
    return from_ * (to_ / from_) ** progress;
  };

  return {
    time: {
      start: lerp(from.time.start, to.time.start),
      duration: scaleLerp(from.time.duration, to.time.duration),
    },
    rows: {
      start: lerp(from.rows.start, to.rows.start),
      count: scaleLerp(from.rows.count, to.rows.count),
    },
  };
}
