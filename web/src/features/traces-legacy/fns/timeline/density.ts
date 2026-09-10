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

/** Browser-only pointer probe; never called from `layout()`. */
export function detectPointerModality(): PointerModality {
  if (typeof window === "undefined" || !window.matchMedia) return "fine";
  return window.matchMedia("(pointer: coarse)").matches ? "coarse" : "fine";
}
