import type { Viewport, ViewportLimits } from "../types";
import { clampViewport } from "./clampViewport";
import { finite } from "./finite";

export function revealViewport(
  viewport: Viewport,
  limits: ViewportLimits,
  target: { rowIndex: number; startMs: number; endMs: number },
): Viewport {
  const from = clampViewport(viewport, limits);
  const rowIndex = Math.max(finite(target.rowIndex, 0), 0);

  // Keep a row of context around it where the window is big enough to spare it.
  const count = from.rows.count;
  const margin = Math.min(1, Math.max(count - 1, 0) / 2);
  let rowStart = from.rows.start;
  if (rowIndex < rowStart + margin) rowStart = rowIndex - margin;
  else if (rowIndex + 1 > rowStart + count - margin) {
    rowStart = rowIndex + 1 + margin - count;
  }

  const duration = from.time.duration;
  const startMs = finite(target.startMs, 0);
  const endMs = Math.max(finite(target.endMs, startMs), startMs);
  let timeStart = from.time.start;
  if (endMs - startMs >= duration) timeStart = (startMs + endMs - duration) / 2;
  else if (startMs < timeStart) timeStart = startMs;
  else if (endMs > timeStart + duration) timeStart = endMs - duration;

  return clampViewport(
    { time: { start: timeStart, duration }, rows: { start: rowStart, count } },
    limits,
  );
}
