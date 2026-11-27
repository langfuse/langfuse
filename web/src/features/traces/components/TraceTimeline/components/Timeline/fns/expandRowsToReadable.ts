import type { Viewport, ViewportLimits } from "../types";
import { HUMAN_ROW_HEIGHT, LABELLED_ROW_HEIGHT } from "../constants";
import { clamp } from "./clamp";
import { clampViewport } from "./clampViewport";
import { finite } from "./finite";
import { rowCountBounds } from "./rowCountBounds";

export function expandRowsToReadable(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { yRatio?: number; targetRowHeight?: number } = {},
): Viewport {
  const from = clampViewport(viewport, limits);
  const target = Math.max(
    finite(options.targetRowHeight, HUMAN_ROW_HEIGHT),
    LABELLED_ROW_HEIGHT,
  );
  const yRatio = clamp(finite(options.yRatio, 0), 0, 1);
  const bounds = rowCountBounds(limits);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);
  const count = clamp(
    boxHeight > 0 ? boxHeight / target : bounds.min,
    bounds.min,
    bounds.max,
  );
  const anchorRow = from.rows.start + from.rows.count * yRatio;
  return clampViewport(
    {
      time: from.time,
      rows: { start: anchorRow - count * yRatio, count },
    },
    limits,
  );
}
