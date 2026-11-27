import type { Viewport, ViewportLimits } from "../types";
import { LABELLED_ROW_HEIGHT } from "../constants";
import { finite } from "./finite";
import { rowHeightOf } from "./rowHeightOf";
import { zoomViewport } from "./zoomViewport";

export function zoomViewportRevealLabels(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { factor: number; xRatio: number; yRatio: number },
): Viewport {
  const factor = finite(options.factor, 1);
  if (factor <= 1) {
    return zoomViewport(viewport, limits, options);
  }
  const height = rowHeightOf(viewport, limits.boxHeight);
  if (!(height > 0) || height >= LABELLED_ROW_HEIGHT) {
    return zoomViewport(viewport, limits, options);
  }
  const yFactorNeeded = LABELLED_ROW_HEIGHT / height;
  if (factor <= yFactorNeeded) {
    return zoomViewport(viewport, limits, { ...options, axes: "y" });
  }
  const labelled = zoomViewport(viewport, limits, {
    ...options,
    factor: yFactorNeeded,
    axes: "y",
  });
  return zoomViewport(labelled, limits, {
    ...options,
    factor: factor / yFactorNeeded,
  });
}
