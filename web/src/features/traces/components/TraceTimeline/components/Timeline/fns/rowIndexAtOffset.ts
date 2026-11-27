import type { Viewport } from "../types";
import { finite } from "./finite";

export function rowIndexAtOffset(
  viewport: Viewport,
  offsetY: number,
  rowHeight: number,
  rowCount: number,
): number | null {
  if (!(rowHeight > 0)) return null;
  const index = Math.floor(
    finite(viewport.rows.start, 0) + finite(offsetY, -1) / rowHeight,
  );
  const total = Math.max(Math.floor(finite(rowCount, 0)), 0);
  return index >= 0 && index < total ? index : null;
}
