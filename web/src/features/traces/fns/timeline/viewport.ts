/**
 * A 2D viewport over the trace, driven like a map.
 *
 * The one-dimensional view model (a time window) was enough while row height was
 * a fixed, resolved value. It is not enough for a dense timeline you explore:
 * there, zoom has to work on BOTH axes at once — narrowing the time window and
 * growing the rows together — and you have to be able to pan anywhere.
 *
 * Content space is time × rows:
 *  - `time` is a window in compressed ms, exactly as before.
 *  - `rows` is a window in ROW INDICES: which row sits at the top (fractional,
 *    so panning is smooth) and how many are visible. Row height is therefore
 *    `boxHeight / rows.count` — vertical zoom IS the visible row count, which is
 *    what makes "zoom until the rows are readable" a single number.
 *
 * Both axes clamp to content, so the viewport can never leave the trace, and a
 * single `factor` drives both — a map does not zoom one axis at a time.
 */

import { clampView, type TimeSpan } from "./viewTransform";

/** Rows never render thinner than this, so "everything visible" has a limit. */
export const MIN_ROW_HEIGHT = 4;
/** Nor thicker than this, so zooming in cannot end at one giant row. */
export const MAX_ROW_HEIGHT = 40;
/** The row height a human reads comfortably — what double-click aims for. */
export const HUMAN_ROW_HEIGHT = 26;

export type RowPresentation =
  /** Bar, duration label and name. */
  | "labelled"
  /** Bar plus a type square. No text. */
  | "compact"
  /** Bar and type square only — no text fits. */
  | "hairline";

/** What a row can show follows from how tall it is, never the other way round. */
export function presentationForRowHeight(rowHeight: number): RowPresentation {
  const height = Number.isFinite(rowHeight) ? rowHeight : 0;
  if (height >= 20) return "labelled";
  if (height >= 10) return "compact";
  return "hairline";
}

export type RowWindow = {
  /** Index of the topmost visible row; fractional while panning. */
  start: number;
  /** How many rows are visible. */
  count: number;
};

export type Viewport = { time: TimeSpan; rows: RowWindow };

export type ViewportLimits = {
  traceSpace: TimeSpan;
  rowCount: number;
  boxHeight: number;
};

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Widest and narrowest row windows the height allows, in rows.
 *
 * The window is allowed to be TALLER THAN THE CONTENT, and that is the load
 * bearing part: three rows in a 600px box must not become three 200px rows.
 * Expressing the ceiling as a minimum row count cannot prevent that, because
 * you cannot show fewer rows than a trace has. Expressing it as a window that
 * over-hangs the content can — three rows render at the human height and the
 * remaining space stays empty, which is the standing decision that density must
 * not grow into a tall box's slack.
 *
 * So the resting window is the row count clamped into
 * `[height / humanHeight, height / minHeight]`:
 *  - a short trace floors at `height / 26`, so rows cap at ~26px;
 *  - a long trace ceilings at `height / 4`, so rows never go below the hairline
 *    and the rest is panned to.
 *
 * Exported because the vertical window depends only on the row count and the
 * height — never on the width. That is what lets a caller resolve row height
 * BEFORE deciding how wide the name gutter should be, without a cycle.
 */
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

export function fitViewport(limits: ViewportLimits): Viewport {
  const bounds = rowCountBounds(limits);
  return {
    time: {
      start: limits.traceSpace.start,
      duration: limits.traceSpace.duration,
    },
    rows: { start: 0, count: bounds.max },
  };
}

export function clampViewport(
  viewport: Viewport,
  limits: ViewportLimits,
): Viewport {
  const rowCount = Math.max(Math.floor(finite(limits.rowCount, 0)), 0);
  const bounds = rowCountBounds(limits);
  const count = clamp(
    finite(viewport.rows.count, bounds.max),
    bounds.min,
    bounds.max,
  );
  const start = clamp(
    finite(viewport.rows.start, 0),
    0,
    Math.max(rowCount - count, 0),
  );
  return {
    time: clampView(viewport.time, limits.traceSpace),
    rows: { start, count },
  };
}

/**
 * Zoom both axes about a point in the box, given as ratios of its width and
 * height. `factor > 1` zooms in. The content under the anchor stays under it.
 */
export function zoomViewport(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { factor: number; xRatio: number; yRatio: number },
): Viewport {
  const factor = finite(options.factor, 1);
  if (factor <= 0) return clampViewport(viewport, limits);

  const xRatio = clamp(finite(options.xRatio, 0.5), 0, 1);
  const yRatio = clamp(finite(options.yRatio, 0.5), 0, 1);

  const anchorMs = viewport.time.start + viewport.time.duration * xRatio;
  const timeDuration = viewport.time.duration / factor;

  const anchorRow = viewport.rows.start + viewport.rows.count * yRatio;
  const rowsCount = viewport.rows.count / factor;

  return clampViewport(
    {
      time: {
        start: anchorMs - timeDuration * xRatio,
        duration: timeDuration,
      },
      rows: { start: anchorRow - rowsCount * yRatio, count: rowsCount },
    },
    limits,
  );
}

/** Pan by a pixel delta — the drag gesture, in both axes at once. */
export function panViewport(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { dxPx: number; dyPx: number; boxWidth: number },
): Viewport {
  const boxWidth = Math.max(finite(options.boxWidth, 0), 0);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);

  const msPerPx = boxWidth > 0 ? viewport.time.duration / boxWidth : 0;
  const rowsPerPx = boxHeight > 0 ? viewport.rows.count / boxHeight : 0;

  return clampViewport(
    {
      time: {
        start: viewport.time.start - finite(options.dxPx, 0) * msPerPx,
        duration: viewport.time.duration,
      },
      rows: {
        start: viewport.rows.start - finite(options.dyPx, 0) * rowsPerPx,
        count: viewport.rows.count,
      },
    },
    limits,
  );
}

/**
 * Double-click target: put one span on screen at a height a human reads, with
 * its own time extent filling the width. Both axes move — that is the whole
 * point, "focus on this element" rather than "zoom the clock".
 */
export function focusViewport(
  limits: ViewportLimits,
  target: { rowIndex: number; startMs: number; durationMs: number },
  paddingRatio = 0.25,
): Viewport {
  const bounds = rowCountBounds(limits);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);

  const count = clamp(
    boxHeight > 0 ? boxHeight / HUMAN_ROW_HEIGHT : bounds.min,
    bounds.min,
    bounds.max,
  );
  const rowIndex = Math.max(finite(target.rowIndex, 0), 0);

  // A zero-duration span still needs a window, so fall back to a slice of the
  // trace rather than collapsing the time axis onto it.
  const durationMs = Math.max(finite(target.durationMs, 0), 0);
  const fallback = limits.traceSpace.duration * 0.05;
  const span = durationMs > 0 ? durationMs : Math.max(fallback, 1);
  const padding = span * clamp(finite(paddingRatio, 0), 0, 2);

  return clampViewport(
    {
      time: {
        start: finite(target.startMs, 0) - padding,
        duration: span + padding * 2,
      },
      rows: { start: rowIndex + 0.5 - count / 2, count },
    },
    limits,
  );
}

/**
 * Which row sits at a pixel offset in the box — the analytic inverse of the
 * render mapping `y = (index - rows.start) * rowHeight`. Exact by construction,
 * which is what a lens over non-uniform rows cannot offer.
 */
export function rowIndexAtOffset(
  viewport: Viewport,
  offsetY: number,
  rowHeight: number,
  rowCount: number,
): number | null {
  if (!(rowHeight > 0)) return null;
  const index = Math.floor(
    finite(viewport.rows.start, 0) + finite(offsetY, -1) / rowHeight,
  );
  const total = Math.max(Math.floor(finite(rowCount, 0)), 0);
  return index >= 0 && index < total ? index : null;
}

/** Row height implied by the vertical window. */
export function rowHeightOf(viewport: Viewport, boxHeight: number): number {
  const count = Math.max(finite(viewport.rows.count, 0), 0);
  const height = Math.max(finite(boxHeight, 0), 0);
  return count > 0 ? height / count : 0;
}

/** Inclusive row index range to render — windowing falls out of the viewport. */
export function visibleRowRange(
  viewport: Viewport,
  rowCount: number,
  overscan = 2,
): { startIndex: number; endIndex: number } {
  const total = Math.max(Math.floor(finite(rowCount, 0)), 0);
  if (total === 0) return { startIndex: 0, endIndex: -1 };
  const start = Math.max(
    Math.floor(finite(viewport.rows.start, 0)) - overscan,
    0,
  );
  const end = Math.min(
    Math.ceil(finite(viewport.rows.start, 0) + finite(viewport.rows.count, 0)) +
      overscan,
    total - 1,
  );
  return { startIndex: start, endIndex: Math.max(end, start) };
}

/**
 * A point on the way from one viewport to another, for animating a focus.
 *
 * Scales interpolate GEOMETRICALLY and offsets linearly. A linear interpolation
 * of a duration reads wrong — it crawls at the wide end and then lurches — which
 * is the same reason zoom is exponential in a level: halving is halving whether
 * you are at 24s or 240ms.
 */
export function interpolateViewport(
  from: Viewport,
  to: Viewport,
  t: number,
): Viewport {
  const progress = clamp(finite(t, 1), 0, 1);
  const lerp = (a: number, b: number) =>
    finite(a, b) + (finite(b, 0) - finite(a, b)) * progress;
  const scaleLerp = (a: number, b: number) => {
    const from_ = Math.max(finite(a, 1), 1e-6);
    const to_ = Math.max(finite(b, 1), 1e-6);
    return from_ * (to_ / from_) ** progress;
  };

  return {
    time: {
      start: lerp(from.time.start, to.time.start),
      duration: scaleLerp(from.time.duration, to.time.duration),
    },
    rows: {
      start: lerp(from.rows.start, to.rows.start),
      count: scaleLerp(from.rows.count, to.rows.count),
    },
  };
}

/** Same window, within a pixel-ish tolerance — used to tell a consumed gesture
 * from one that hit a clamp, so a trapped scroll can be handed back to the page. */
export function viewportsEqual(a: Viewport, b: Viewport): boolean {
  const close = (x: number, y: number, epsilon: number) =>
    Math.abs(finite(x, 0) - finite(y, 0)) < epsilon;
  return (
    close(a.time.start, b.time.start, 0.001) &&
    close(a.time.duration, b.time.duration, 0.001) &&
    close(a.rows.start, b.rows.start, 0.0001) &&
    close(a.rows.count, b.rows.count, 0.0001)
  );
}

export const isViewportFitted = (
  viewport: Viewport,
  limits: ViewportLimits,
): boolean => {
  const bounds = rowCountBounds(limits);
  return (
    viewport.time.duration >= limits.traceSpace.duration - 0.5 &&
    viewport.rows.count >= bounds.max - 0.001 &&
    viewport.rows.start <= 0.001
  );
};
