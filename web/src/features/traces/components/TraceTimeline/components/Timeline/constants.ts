/** One device pixel per span. */
export const MIN_ROW_HEIGHT = 1;
/** Zooming in cannot end at one giant row. */
export const MAX_ROW_HEIGHT = 40;
/** The row height a human reads comfortably. */
export const HUMAN_ROW_HEIGHT = 26;
/** Shortest row that can hold a duration label and a name. */
export const LABELLED_ROW_HEIGHT = 20;
/** Zooming past 1ms per lane buys nothing. */
export const MAX_ZOOM_PRECISION_MS = 1;
/** Manual measurement average when no canvas is available. */
export const PX_PER_LETTER = 6.5;
