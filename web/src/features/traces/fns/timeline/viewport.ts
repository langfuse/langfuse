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
 * Both axes clamp to content, so the viewport can never leave the trace.
 * Gesture zoom is usually one `factor` on both axes — a map does not zoom one
 * axis at a time — except while rows are still too short to hold a label: then
 * zooming in grows only the rows, so the whole duration stays on screen until
 * the names come back.
 */

import { clampView, type TimeSpan } from "./viewTransform";

/**
 * One device pixel per span — the floor, and it is deliberately literal.
 *
 * A 4px floor still made a few thousand spans a scrolling job, which is the one
 * thing this layout exists to avoid: at 4px you are reading a window, at 1px you
 * are reading the trace. A 600px-tall box holds 600 rows, so most traces fit
 * whole and the shape arrives all at once; zoom is then how you get from the
 * shape to a span, rather than how you find out there is more below.
 */
export const MIN_ROW_HEIGHT = 1;
/** Nor thicker than this, so zooming in cannot end at one giant row. */
export const MAX_ROW_HEIGHT = 40;
/** The row height a human reads comfortably — what double-click aims for. */
export const HUMAN_ROW_HEIGHT = 26;
/** Shortest row that can hold a duration label and a name. */
export const LABELLED_ROW_HEIGHT = 20;

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
  if (height >= LABELLED_ROW_HEIGHT) return "labelled";
  if (height >= 10) return "compact";
  return "hairline";
}

type RowWindow = {
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

const finite = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

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

export type ZoomAxes = "both" | "x" | "y";

/**
 * Zoom about a point in the box, given as ratios of its width and height.
 * `factor > 1` zooms in. The content under the anchor stays under it.
 *
 * `axes` defaults to both. `"y"` grows or shrinks only the rows, which is how
 * a long trace can keep its full duration on screen while the labels return.
 */
export function zoomViewport(
  viewport: Viewport,
  limits: ViewportLimits,
  options: {
    factor: number;
    xRatio: number;
    yRatio: number;
    axes?: ZoomAxes;
  },
): Viewport {
  const factor = finite(options.factor, 1);
  if (factor <= 0) return clampViewport(viewport, limits);

  const axes = options.axes ?? "both";
  const zoomX = axes !== "y";
  const zoomY = axes !== "x";
  const xRatio = clamp(finite(options.xRatio, 0.5), 0, 1);
  const yRatio = clamp(finite(options.yRatio, 0.5), 0, 1);

  const anchorMs = viewport.time.start + viewport.time.duration * xRatio;
  const timeDuration = zoomX
    ? viewport.time.duration / factor
    : viewport.time.duration;

  const anchorRow = viewport.rows.start + viewport.rows.count * yRatio;
  const rowsCount = zoomY ? viewport.rows.count / factor : viewport.rows.count;

  return clampViewport(
    {
      time: {
        start: zoomX ? anchorMs - timeDuration * xRatio : viewport.time.start,
        duration: timeDuration,
      },
      rows: {
        start: zoomY ? anchorRow - rowsCount * yRatio : viewport.rows.start,
        count: rowsCount,
      },
    },
    limits,
  );
}

/**
 * Grow rows until they can hold labels, without narrowing the time window.
 *
 * The resting fit of a long trace is 1px rows — the whole shape, no text. This
 * is the other rest: the same clock, rows tall enough to name themselves, the
 * rest of the tree panned to.
 */
export function expandRowsToReadable(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { yRatio?: number; targetRowHeight?: number } = {},
): Viewport {
  const from = clampViewport(viewport, limits);
  const target = Math.max(
    finite(options.targetRowHeight, HUMAN_ROW_HEIGHT),
    LABELLED_ROW_HEIGHT,
  );
  const yRatio = clamp(finite(options.yRatio, 0), 0, 1);
  const bounds = rowCountBounds(limits);
  const boxHeight = Math.max(finite(limits.boxHeight, 0), 0);
  const count = clamp(
    boxHeight > 0 ? boxHeight / target : bounds.min,
    bounds.min,
    bounds.max,
  );
  const anchorRow = from.rows.start + from.rows.count * yRatio;
  return clampViewport(
    {
      time: from.time,
      rows: { start: anchorRow - count * yRatio, count },
    },
    limits,
  );
}

/** Whether growing the rows (and keeping the clock) would reveal labels. */
export function canExpandRowsToReadable(
  viewport: Viewport,
  limits: ViewportLimits,
): boolean {
  const height = rowHeightOf(viewport, limits.boxHeight);
  if (height >= LABELLED_ROW_HEIGHT) return false;
  const expanded = expandRowsToReadable(viewport, limits);
  return rowHeightOf(expanded, limits.boxHeight) > height + 0.05;
}

/**
 * Zoom in: grow rows first until labels fit, then apply whatever factor is
 * left to both axes. Zoom out: both axes (a full-width window only shrinks
 * the rows).
 */
export function zoomViewportRevealLabels(
  viewport: Viewport,
  limits: ViewportLimits,
  options: { factor: number; xRatio: number; yRatio: number },
): Viewport {
  const factor = finite(options.factor, 1);
  if (factor <= 1) {
    return zoomViewport(viewport, limits, options);
  }
  const height = rowHeightOf(viewport, limits.boxHeight);
  if (!(height > 0) || height >= LABELLED_ROW_HEIGHT) {
    return zoomViewport(viewport, limits, options);
  }
  const yFactorNeeded = LABELLED_ROW_HEIGHT / height;
  if (factor <= yFactorNeeded) {
    return zoomViewport(viewport, limits, { ...options, axes: "y" });
  }
  const labelled = zoomViewport(viewport, limits, {
    ...options,
    factor: yFactorNeeded,
    axes: "y",
  });
  return zoomViewport(labelled, limits, {
    ...options,
    factor: factor / yFactorNeeded,
  });
}

/**
 * Zoom to a box drawn on the surface — "show me exactly this region".
 *
 * Given as ratios of the box's own width and height, like `zoomViewport`'s
 * anchor, so this function never needs to know a pixel. Both axes come from the
 * rectangle and nothing is inferred: a marquee is the one gesture where the user
 * has stated the window on both axes, so the only thing left to do is clamp it
 * into the content and into the row-height limits.
 */
export function zoomToBox(
  viewport: Viewport,
  limits: ViewportLimits,
  box: {
    xStartRatio: number;
    xEndRatio: number;
    yStartRatio: number;
    yEndRatio: number;
  },
): Viewport {
  const from = clampViewport(viewport, limits);
  const x0 = clamp(finite(box.xStartRatio, 0), 0, 1);
  const x1 = clamp(finite(box.xEndRatio, 1), 0, 1);
  const y0 = clamp(finite(box.yStartRatio, 0), 0, 1);
  const y1 = clamp(finite(box.yEndRatio, 1), 0, 1);
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  // A zero-width or zero-height box would ask for an infinite zoom; keep that
  // axis as it is rather than refusing the whole gesture.
  const duration =
    right > left ? from.time.duration * (right - left) : from.time.duration;
  const count =
    bottom > top ? from.rows.count * (bottom - top) : from.rows.count;

  return clampViewport(
    {
      time: { start: from.time.start + from.time.duration * left, duration },
      rows: { start: from.rows.start + from.rows.count * top, count },
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

export type RowExtent = { startMs: number; endMs: number };

/**
 * Slide the clock to where the rows are, when a zoom has landed on empty air.
 *
 * The two axes are independent by design — one is time, the other is position in
 * the tree — and they are only ever CORRELATED, never proportional: a chain of
 * 600 spans can finish in the first third of a trace whose duration is set by one
 * long root. Zooming both axes about the same point therefore has a failure mode
 * with nothing wrong with it and nothing in it: forty rows whose spans all lie
 * outside the window, drawn as a column of edge carets.
 *
 * So after a zoom, if not one visible row has anything inside the window, the
 * window slides onto the rows that are there. It never resizes — the zoom the
 * user asked for is the zoom they get — and it does nothing at all whenever there
 * is something to see, so it cannot fight someone who is looking at a span.
 */
export function anchorTimeToRows(
  viewport: Viewport,
  limits: ViewportLimits,
  extentOf: (rowIndex: number) => RowExtent | null,
): Viewport {
  const range = visibleRowRange(viewport, limits.rowCount, 0);
  const windowStart = viewport.time.start;
  const windowEnd = windowStart + viewport.time.duration;
  let earliest = Infinity;
  let latest = -Infinity;

  for (let index = range.startIndex; index <= range.endIndex; index++) {
    const extent = extentOf(index);
    if (!extent) continue;
    // Anything at all inside the window means there is something to look at.
    if (extent.endMs >= windowStart && extent.startMs <= windowEnd) {
      return viewport;
    }
    earliest = Math.min(earliest, extent.startMs);
    latest = Math.max(latest, extent.endMs);
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return viewport;

  const centre = (earliest + latest) / 2;
  return clampViewport(
    {
      time: {
        start: centre - viewport.time.duration / 2,
        duration: viewport.time.duration,
      },
      rows: viewport.rows,
    },
    limits,
  );
}

/**
 * The smallest move that brings a row and its span inside the window —
 * scrollIntoView for a 2D viewport, and deliberately NOT a focus.
 *
 * Selection arrives from everywhere: the tree, a search hit, a deep link, a
 * playback cursor. All of those owe the user a visible highlight, but none of
 * them is a request to change how far in you are looking — so the zoom on both
 * axes is carried through untouched and only the offsets move. A span wider than
 * the current window is centred, since no offset can contain it.
 */
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
