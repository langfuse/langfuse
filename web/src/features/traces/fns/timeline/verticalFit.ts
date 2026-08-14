/**
 * The vertical half of "visible in one glance".
 *
 * Fit-to-box solved the time axis: the whole trace is always inside the lane.
 * It did nothing for the OTHER scrollbar — in a narrow, tall layout you still
 * scroll down to see the trace, and at 26px a row the bars are slivers next to
 * their own labels, so the thing reads as a list of numbers rather than a shape.
 *
 * This module inverts the priorities for that case: spend nothing on identity
 * and everything on shape.
 *
 * 1. **Row height shrinks to fit.** It resolves DOWN from the measured box and
 *    the row count, floored at a 4px hairline (3px bar + 1px gap). It never
 *    grows past the comfortable height — a short trace in a tall box stays
 *    dense, which is a decision already taken.
 * 2. **What a row can show follows from its height**, not the other way around:
 *    at hairline height there is no text and no name, only a bar and a 2×2
 *    colour square for the type.
 * 3. **A focus lens replaces the text.** Rows near the pointer (or finger)
 *    expand to a readable height while the rest give up their space, so the
 *    total never changes and nothing scrolls. Dragging a finger down the trace
 *    moves the lens through it.
 */

export const COMFORTABLE_ROW_HEIGHT = 26;
/** 3px of bar, 1px of gap: the smallest row that still reads as a bar. */
export const HAIRLINE_ROW_HEIGHT = 4;
/** Below this a row cannot hold text. */
const COMPACT_TEXT_THRESHOLD = 20;
/** Below this a row cannot hold the type square and a bar side by side. */
const HAIRLINE_THRESHOLD = 10;

export type RowPresentation =
  /** Bar, duration label and name. */
  | "labelled"
  /** Bar plus a type square. No text. */
  | "compact"
  /** Bar only, with the type square inline. No text, no gap to speak of. */
  | "hairline";

export type VerticalFit = {
  rowHeight: number;
  barHeight: number;
  presentation: RowPresentation;
  /** Every row is inside the box: nothing scrolls in either axis. */
  fitsWithoutScroll: boolean;
  /** Rows the box could hold at the hairline floor — where no-scroll breaks. */
  capacityAtFloor: number;
  /** Rows that do not fit even at the floor; 0 when it fits. */
  overflowRows: number;
};

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function resolveVerticalFit(input: {
  rowCount: number;
  boxHeight: number;
}): VerticalFit {
  const rowCount = Math.max(Math.floor(finite(input.rowCount, 0)), 0);
  const boxHeight = Math.max(finite(input.boxHeight, 0), 0);

  const perRow =
    rowCount > 0 && boxHeight > 0 ? Math.floor(boxHeight / rowCount) : 0;
  const rowHeight =
    rowCount === 0
      ? COMFORTABLE_ROW_HEIGHT
      : clamp(perRow, HAIRLINE_ROW_HEIGHT, COMFORTABLE_ROW_HEIGHT);

  const presentation: RowPresentation =
    rowHeight >= COMPACT_TEXT_THRESHOLD
      ? "labelled"
      : rowHeight >= HAIRLINE_THRESHOLD
        ? "compact"
        : "hairline";

  const capacityAtFloor = Math.floor(boxHeight / HAIRLINE_ROW_HEIGHT);
  const overflowRows = Math.max(rowCount - capacityAtFloor, 0);

  return {
    rowHeight,
    barHeight:
      presentation === "labelled"
        ? 16
        : Math.max(1, rowHeight - (presentation === "hairline" ? 1 : 2)),
    presentation,
    fitsWithoutScroll: rowCount * rowHeight <= boxHeight,
    capacityAtFloor,
    overflowRows,
  };
}

export type LensRow = {
  index: number;
  y: number;
  height: number;
  /** 1 = untouched by the lens; higher = magnified. */
  magnification: number;
};

/**
 * Focus+context lens over a fixed total height.
 *
 * Heights are assigned by weight and then normalised to `totalHeight`, so the
 * sum is exactly the height we were given no matter how strong the lens is.
 * That is the property that keeps it scroll-free: the magnified rows can only
 * borrow their space from the rows furthest from the focus.
 *
 * `focusIndex: null` is the resting state — uniform rows, no lens.
 */
export function applyFocusLens(input: {
  rowCount: number;
  /** The height the rows must sum to. */
  totalHeight: number;
  focusIndex: number | null;
  /** Rows either side of the focus the lens reaches. */
  radius: number;
  /** How many times its share the focused row takes. */
  magnification: number;
}): LensRow[] {
  const rowCount = Math.max(Math.floor(finite(input.rowCount, 0)), 0);
  if (rowCount === 0) return [];

  const totalHeight = Math.max(finite(input.totalHeight, 0), 0);
  const uniform = totalHeight / rowCount;

  const focusIndex =
    input.focusIndex == null
      ? null
      : clamp(Math.round(finite(input.focusIndex, 0)), 0, rowCount - 1);
  const radius = Math.max(finite(input.radius, 0), 0);
  const magnification = Math.max(finite(input.magnification, 1), 1);

  if (focusIndex == null || magnification === 1) {
    return Array.from({ length: rowCount }, (_, index) => ({
      index,
      y: index * uniform,
      height: uniform,
      magnification: 1,
    }));
  }

  // Raised-cosine falloff: the lens has no edge to catch the eye on, which is
  // what makes dragging through it feel like a lens rather than a moving block.
  const weights = new Array<number>(rowCount);
  let totalWeight = 0;
  for (let index = 0; index < rowCount; index++) {
    const distance = Math.abs(index - focusIndex);
    const falloff =
      radius <= 0
        ? distance === 0
          ? 1
          : 0
        : distance >= radius
          ? 0
          : 0.5 * (1 + Math.cos((Math.PI * distance) / radius));
    const weight = 1 + (magnification - 1) * falloff;
    weights[index] = weight;
    totalWeight += weight;
  }

  const rows: LensRow[] = new Array(rowCount);
  let y = 0;
  for (let index = 0; index < rowCount; index++) {
    const height =
      totalWeight > 0 ? (totalHeight * weights[index]!) / totalWeight : 0;
    rows[index] = { index, y, height, magnification: weights[index]! };
    y += height;
  }
  return rows;
}

/**
 * Which row a pointer at `y` is over, given lens-distorted row heights.
 * Binary search: the lens recomputes on every pointer move, so this must not
 * walk the list.
 */
export function rowIndexAtY(
  rows: readonly LensRow[],
  y: number,
): number | null {
  if (rows.length === 0) return null;
  const target = finite(y, 0);
  if (target < 0) return null;

  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const row = rows[mid]!;
    if (target < row.y) high = mid - 1;
    else if (target >= row.y + row.height) low = mid + 1;
    else return mid;
  }
  return null;
}
