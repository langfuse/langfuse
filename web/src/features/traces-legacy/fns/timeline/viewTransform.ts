/**
 * Four-space view model for the timeline.
 *
 * | space      | meaning                                                  |
 * | ---------- | -------------------------------------------------------- |
 * | trace      | the whole trace in time units — `[0, totalDuration]`     |
 * | view       | the visible window into trace space — this IS zoom/pan   |
 * | physical   | the measured pixel box of the chart lane                 |
 * | container  | the measured pixel box of the whole timeline             |
 *
 * Default `view === traceSpace` is what makes "the whole trace fits the box at
 * any size, with no horizontal scroll" true by construction rather than by
 * luck. Ported from Sentry's `traceRenderers/traceView.tsx` as scalars: the
 * mat3 composition buys nothing while both spaces are 1-dimensional in time.
 *
 * Total by construction: `pxPerMs` is 0 (never Infinity/NaN) for a degenerate
 * window, so every derived coordinate stays finite and collapses to the lane's
 * left edge instead of exploding.
 *
 * Production code, arriving one PR before its callers: the renderer beside it
 * (`TimelineV2.tsx`) is a Storybook harness and says so, this is not.
 */

export type TimeSpan = {
  /** ms offset from the trace origin */
  start: number;
  /** ms */
  duration: number;
};

export type Box = { width: number; height: number };

/** Zooming past 1ms per lane buys nothing and costs float precision. */
const MAX_ZOOM_PRECISION_MS = 1;

export type ViewTransform = {
  /** ms in view space → px from the lane's left edge */
  toPx: (ms: number) => number;
  /** px from the lane's left edge → ms in view space */
  toMs: (px: number) => number;
  pxPerMs: number;
};

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

/** Shared with layout(), which clamps bars and labels into the same lane. */
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function traceSpaceOf(durationMs: number): TimeSpan {
  return { start: 0, duration: Math.max(finite(durationMs, 0), 0) };
}

export function fitView(space: TimeSpan): TimeSpan {
  return { start: space.start, duration: space.duration };
}

/**
 * The window can never leave trace space, nor invert, nor go non-finite.
 *
 * Deviates from Sentry deliberately: at the right edge we hold the zoom level
 * and pull `start` back, where they hold `x` and shrink the window. Holding the
 * zoom is what a pan gesture means — panning past the end should stop, not
 * silently zoom out.
 */
export function clampView(view: TimeSpan, space: TimeSpan): TimeSpan {
  const spaceDuration = Math.max(finite(space.duration, 0), 0);
  const duration = clamp(
    finite(view.duration, spaceDuration),
    Math.min(MAX_ZOOM_PRECISION_MS, spaceDuration),
    spaceDuration,
  );
  const start = clamp(
    finite(view.start, space.start),
    space.start,
    space.start + spaceDuration - duration,
  );
  return { start, duration };
}

export function createViewTransform(view: TimeSpan, box: Box): ViewTransform {
  const width = Math.max(finite(box.width, 0), 0);
  const duration = Math.max(finite(view.duration, 0), 0);
  const pxPerMs = duration > 0 && width > 0 ? width / duration : 0;

  return {
    pxPerMs,
    toPx: (ms) => (finite(ms, view.start) - view.start) * pxPerMs,
    toMs: (px) =>
      pxPerMs > 0 ? view.start + finite(px, 0) / pxPerMs : view.start,
  };
}
