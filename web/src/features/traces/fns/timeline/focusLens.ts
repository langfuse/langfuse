/**
 * A focus+context lens over a list of rows — GROUNDWORK, not in use.
 *
 * The idea: rows near the pointer expand to a readable height while the rest
 * give up their space, so the total never changes and nothing scrolls. Dragging
 * a finger down the trace moves the lens through it. The maths hold — heights
 * are weight-normalised, so they sum to exactly the height given at any
 * magnification, which is the property that keeps it scroll-free.
 *
 * It is deliberately NOT wired into the renderer. Hit-testing a fisheye needs
 * the transform to be invertible: test in distorted space and the lens feeds on
 * its own output (the row moves out from under the cursor); test in resting
 * space and the row that expands is not the one under the cursor. Neither is
 * acceptable, and absolutely-positioned rows are the wrong substrate for the
 * analytic inverse. This is the starting point for that spike, on a canvas
 * surface where the inverse is natural.
 *
 * Uniform rows do have an analytic inverse — see `rowIndexAtOffset` in
 * viewport.ts, which is what the renderer actually uses.
 */

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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
