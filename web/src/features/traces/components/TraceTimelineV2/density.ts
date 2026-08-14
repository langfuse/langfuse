/**
 * Density is a resolved value, not a constant.
 *
 * It is a function of the measured box AND the input modality, and the two pull
 * in opposite directions:
 *
 * - `pointer: fine` (mouse) wants Finder-row density — a span as tall as a file
 *   in a file listing, ~26px.
 * - `pointer: coarse` (touch) wants ≥44px, because zoom-and-tap instead of
 *   hover makes the tap target load-bearing rather than cosmetic.
 *
 * Rows stay uniform height — vertical virtualization depends on it. Only the
 * *value* is resolved: a short trace in a tall box grows its rows into the slack
 * (capped, so it stays a list and not a chart), and a long trace floors at the
 * modality's minimum and scrolls.
 */

import type { Box } from "./viewTransform";

export type PointerModality = "fine" | "coarse";

export const FINE_ROW_HEIGHT = 26;
export const COARSE_ROW_HEIGHT = 44;
/** A row that stacks a name over its bar needs two text lines' worth. */
export const TWO_LINE_MIN_HEIGHT = 38;
/** How far rows may grow into a tall box before it stops reading as a list. */
const MAX_GROWTH = 1.3;

export type Density = {
  pointer: PointerModality;
  rowHeight: number;
  barHeight: number;
  labelFontPx: number;
  /** Horizontal padding for a label drawn inside its bar. */
  labelPaddingPx: number;
  /** Gap between a bar and a label drawn outside it. */
  labelGapPx: number;
  /** Zero-duration spans stay visible as a marker this wide. */
  minBarWidthPx: number;
};

export function resolveDensity(options: {
  box: Box;
  pointer: PointerModality;
  rowCount: number;
  /** 2 when the row stacks a name above its bar (no name gutter). */
  lines?: 1 | 2;
}): Density {
  const { pointer, rowCount } = options;
  const lines = options.lines ?? 1;
  const base = Math.max(
    pointer === "coarse" ? COARSE_ROW_HEIGHT : FINE_ROW_HEIGHT,
    lines === 2 ? TWO_LINE_MIN_HEIGHT : 0,
  );
  const height = Number.isFinite(options.box.height) ? options.box.height : 0;

  const perRow = rowCount > 0 && height > 0 ? Math.floor(height / rowCount) : 0;
  const rowHeight = Math.min(
    Math.max(perRow, base),
    Math.round(base * MAX_GROWTH),
  );

  return {
    pointer,
    rowHeight,
    barHeight: Math.max(8, Math.round(rowHeight * (lines === 2 ? 0.35 : 0.6))),
    labelFontPx: pointer === "coarse" ? 13 : 12,
    labelPaddingPx: 4,
    labelGapPx: 6,
    minBarWidthPx: pointer === "coarse" ? 6 : 4,
  };
}

/** Browser-only companion to `resolveDensity`; never called from `layout()`. */
export function detectPointerModality(): PointerModality {
  if (typeof window === "undefined" || !window.matchMedia) return "fine";
  return window.matchMedia("(pointer: coarse)").matches ? "coarse" : "fine";
}
