import { HUMAN_ROW_HEIGHT, MAX_ROW_HEIGHT, MIN_ROW_HEIGHT } from "../constants";
import { clamp } from "./clamp";
import { finite } from "./finite";

export function rowCountBounds(limits: {
  rowCount: number;
  boxHeight: number;
}): { min: number; max: number } {
  const rowCount = Math.max(Math.floor(finite(limits.rowCount, 0)), 0);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);
  if (rowCount === 0 || boxHeight === 0) {
    return { min: Math.max(rowCount, 1), max: Math.max(rowCount, 1) };
  }
  const max = clamp(
    rowCount,
    Math.max(boxHeight / HUMAN_ROW_HEIGHT, 1),
    Math.max(boxHeight / MIN_ROW_HEIGHT, 1),
  );
  const min = clamp(boxHeight / MAX_ROW_HEIGHT, 1, max);
  return { min, max };
}
