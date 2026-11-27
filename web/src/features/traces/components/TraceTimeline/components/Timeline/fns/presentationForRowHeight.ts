import type { RowPresentation } from "../types";
import { LABELLED_ROW_HEIGHT } from "../constants";

export function presentationForRowHeight(rowHeight: number): RowPresentation {
  const height = Number.isFinite(rowHeight) ? rowHeight : 0;
  if (height >= LABELLED_ROW_HEIGHT) return "labelled";
  if (height >= 10) return "compact";
  return "hairline";
}
