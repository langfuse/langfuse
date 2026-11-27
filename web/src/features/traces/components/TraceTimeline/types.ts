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
