import type { Viewport, ViewportLimits } from "../types";
import { LABELLED_ROW_HEIGHT } from "../constants";
import { expandRowsToReadable } from "./expandRowsToReadable";
import { rowHeightOf } from "./rowHeightOf";

export function canExpandRowsToReadable(
  viewport: Viewport,
  limits: ViewportLimits,
): boolean {
  const height = rowHeightOf(viewport, limits.boxHeight);
  if (height >= LABELLED_ROW_HEIGHT) return false;
  const expanded = expandRowsToReadable(viewport, limits);
  return rowHeightOf(expanded, limits.boxHeight) > height + 0.05;
}
