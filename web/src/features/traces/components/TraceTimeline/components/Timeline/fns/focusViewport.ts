import type { Viewport, ViewportLimits } from "../types";
import { HUMAN_ROW_HEIGHT } from "../constants";
import { clamp } from "./clamp";
import { clampViewport } from "./clampViewport";
import { finite } from "./finite";
import { rowCountBounds } from "./rowCountBounds";

export function focusViewport(
  limits: ViewportLimits,
  target: { rowIndex: number; startMs: number; durationMs: number },
  paddingRatio = 0.25,
): Viewport {
  const bounds = rowCountBounds(limits);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);

  const count = clamp(
    boxHeight > 0 ? boxHeight / HUMAN_ROW_HEIGHT : bounds.min,
    bounds.min,
    bounds.max,
  );
  const rowIndex = Math.max(finite(target.rowIndex, 0), 0);

  // A zero-duration span still needs a window, so fall back to a slice of the
  // trace rather than collapsing the time axis onto it.
  const durationMs = Math.max(finite(target.durationMs, 0), 0);
  const fallback = limits.traceSpace.duration * 0.05;
  const span = durationMs > 0 ? durationMs : Math.max(fallback, 1);
  const padding = span * clamp(finite(paddingRatio, 0), 0, 2);

  return clampViewport(
    {
      time: {
        start: finite(target.startMs, 0) - padding,
        duration: span + padding * 2,
      },
      rows: { start: rowIndex + 0.5 - count / 2, count },
    },
    limits,
  );
}
