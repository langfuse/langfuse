import type { Viewport } from "../types";
import { finite } from "./finite";

export function rowHeightOf(viewport: Viewport, boxHeight: number): number {
  const count = Math.max(finite(viewport.rows.count, 0), 0);
  const height = Math.max(finite(boxHeight, 0), 0);
  return count > 0 ? height / count : 0;
}
