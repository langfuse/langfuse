import type { Density, PointerModality } from "../types";

const FINE_ROW_HEIGHT = 26;
const COARSE_ROW_HEIGHT = 44;
/** A row that stacks a name over its bar needs two text lines' worth. */
const TWO_LINE_MIN_HEIGHT = 38;

export function resolveDensity(options: {
  pointer: PointerModality;
  /** 2 when the row stacks a name above its bar (no name gutter). */
  lines?: 1 | 2;
}): Density {
  const { pointer } = options;
  const lines = options.lines ?? 1;
  const rowHeight = Math.max(
    pointer === "coarse" ? COARSE_ROW_HEIGHT : FINE_ROW_HEIGHT,
    lines === 2 ? TWO_LINE_MIN_HEIGHT : 0,
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
