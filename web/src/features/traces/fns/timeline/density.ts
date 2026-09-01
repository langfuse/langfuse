/**
 * Density is a resolved value, not a constant.
 *
 * It resolves from the input modality and how many text lines a row must hold:
 *
 * - `pointer: fine` (mouse) wants Finder-row density — a span as tall as a file
 *   in a file listing, ~26px.
 * - `pointer: coarse` (touch) wants ≥44px, because zoom-and-tap instead of
 *   hover makes the tap target load-bearing rather than cosmetic.
 *
 * Deliberately NOT a function of box height. An earlier revision grew rows into
 * the slack of a tall box (a 3-row trace got 34px rows in a 420px box); review
 * rejected it — density is the point, so the box decides how many rows are
 * visible, never how tall they are. Rows also stay uniform height, because
 * vertical virtualization depends on it.
 *
 * Production code, arriving one PR before its callers: the renderer beside it
 * (`TimelineV2.tsx`) is a Storybook harness and says so, this is not.
 */

export type PointerModality = "fine" | "coarse";

const FINE_ROW_HEIGHT = 26;
const COARSE_ROW_HEIGHT = 44;
/** A row that stacks a name over its bar needs two text lines' worth. */
const TWO_LINE_MIN_HEIGHT = 38;

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

/** Browser-only companion to `resolveDensity`; never called from `layout()`. */
export function detectPointerModality(): PointerModality {
  if (typeof window === "undefined" || !window.matchMedia) return "fine";
  return window.matchMedia("(pointer: coarse)").matches ? "coarse" : "fine";
}
