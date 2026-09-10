/**
 * Idle-gap time compression — ported from Sentry's
 * `traceRenderers/traceTimeCompression.tsx`.
 *
 * Fit-to-box is correct but not always legible: a 36s trace whose real work is
 * three 40ms spans fits honestly and reads as three invisible slivers. Gaps
 * where nothing happens, wider than 5% of the trace, collapse to a fixed ~28px
 * marker so the busy regions get the pixels.
 *
 * Compression is a coordinate remap applied BEFORE the view transform: the view
 * (zoom/pan) then works in compressed ms, so panning is linear on screen and
 * the collapsed gaps don't re-flow while the user zooms.
 *
 * It buys legibility by lying about proportion — the renderer must therefore
 * draw the gap markers, and tick labels must come back through `toRealMs`.
 *
 * Production code, arriving one PR before its callers: the renderer beside it
 * (`TimelineV2.tsx`) is a Storybook harness and says so, this is not.
 */

const COLLAPSE_THRESHOLD_RATIO = 0.05;
const COLLAPSED_GAP_WIDTH_PX = 28;
/** Reserve room next to a bar for its duration label, so labels never land in a gap. */
const DURATION_LABEL_BUFFER_PX = 48;
const MARKER_PADDING_RATIO = 0.01;
const MARKER_PADDING_MAX_MS = 500;

type Interval = [start: number, end: number];

type CompressedGap = {
  /** real ms offsets */
  start: number;
  end: number;
  durationMs: number;
  /** compressed ms offsets */
  compressedStart: number;
  compressedEnd: number;
};

export type TimeCompression = {
  enabled: boolean;
  /** ms, real */
  durationMs: number;
  /** ms, compressed — the width of compressed trace space */
  compressedDurationMs: number;
  gaps: readonly CompressedGap[];
  toCompressedMs: (realMs: number) => number;
  toRealMs: (compressedMs: number) => number;
};

export function identityCompression(durationMs: number): TimeCompression {
  const duration = Math.max(Number.isFinite(durationMs) ? durationMs : 0, 0);
  return {
    enabled: false,
    durationMs: duration,
    compressedDurationMs: duration,
    gaps: [],
    toCompressedMs: (realMs) => realMs,
    toRealMs: (compressedMs) => compressedMs,
  };
}

/**
 * @param spans ms offsets of every span that should keep its real width.
 *   Roots must be excluded: a root covers the whole trace by definition, so
 *   including it means no gap is ever idle.
 */
export function buildTimeCompression(options: {
  spans: readonly Interval[];
  durationMs: number;
  physicalWidth: number;
  enabled: boolean;
}): TimeCompression {
  const { spans, durationMs, physicalWidth } = options;

  if (
    !options.enabled ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(physicalWidth) ||
    physicalWidth <= 0
  ) {
    return identityCompression(durationMs);
  }

  // The label buffer is px, so converting it to ms needs a px-per-ms — and
  // that is what compression is about to change, by up to 100×. Sentry
  // converts at the UNCOMPRESSED scale, which in a 320px lane reserves ~5.4s
  // around each span of a 36s trace and makes compression a no-op exactly
  // where it is needed most. One fixed-point step fixes it: compress with no
  // buffer, then re-compress with the buffer priced at the resulting scale.
  const unbuffered = compressOnce(spans, durationMs, physicalWidth, 0);
  if (!unbuffered) return identityCompression(durationMs);

  const labelBufferMs =
    (unbuffered.compressedDurationMs / physicalWidth) *
    DURATION_LABEL_BUFFER_PX;

  return (
    compressOnce(spans, durationMs, physicalWidth, labelBufferMs) ?? unbuffered
  );
}

function compressOnce(
  spans: readonly Interval[],
  durationMs: number,
  physicalWidth: number,
  labelBufferMs: number,
): TimeCompression | null {
  const merged = mergeIntervals(padIntervals(spans, durationMs, labelBufferMs));
  const collapsible = collectCollapsibleGaps(merged, durationMs);
  if (collapsible.length === 0) return null;

  const collapsedGapPx = Math.min(
    COLLAPSED_GAP_WIDTH_PX,
    physicalWidth / (collapsible.length + 1),
  );
  const gapWidthRatio = collapsedGapPx / physicalWidth;
  const collapsedDuration = collapsible.reduce(
    (sum, [start, end]) => sum + (end - start),
    0,
  );
  const activeDuration = durationMs - collapsedDuration;
  const denominator = 1 - gapWidthRatio * collapsible.length;

  if (denominator <= 0 || activeDuration <= 0) return null;

  const compressedDurationMs = activeDuration / denominator;
  const retainedDuration = compressedDurationMs * gapWidthRatio;

  let removedBefore = 0;
  const gaps: CompressedGap[] = collapsible.map(([start, end]) => {
    const compressedStart = start - removedBefore;
    removedBefore += end - start - retainedDuration;
    return {
      start,
      end,
      durationMs: end - start,
      compressedStart,
      compressedEnd: compressedStart + retainedDuration,
    };
  });

  return {
    enabled: true,
    durationMs,
    compressedDurationMs,
    gaps,
    toCompressedMs: (realMs) => {
      let removed = 0;
      for (const gap of gaps) {
        if (realMs < gap.start) break;
        if (realMs <= gap.end) {
          const progress =
            gap.durationMs > 0 ? (realMs - gap.start) / gap.durationMs : 0;
          return gap.compressedStart + progress * retainedDuration;
        }
        removed += gap.durationMs - retainedDuration;
      }
      return realMs - removed;
    },
    toRealMs: (compressedMs) => {
      let restored = 0;
      for (const gap of gaps) {
        if (compressedMs < gap.compressedStart) break;
        if (compressedMs <= gap.compressedEnd) {
          const progress =
            retainedDuration > 0
              ? (compressedMs - gap.compressedStart) / retainedDuration
              : 0;
          return gap.start + progress * gap.durationMs;
        }
        restored += gap.durationMs - retainedDuration;
      }
      return compressedMs + restored;
    },
  };
}

function padIntervals(
  spans: readonly Interval[],
  durationMs: number,
  labelBufferMs: number,
): Interval[] {
  const markerPadding = Math.max(
    Math.min(durationMs * MARKER_PADDING_RATIO, MARKER_PADDING_MAX_MS),
    labelBufferMs,
  );
  const labelBuffer = labelBufferMs;
  const clampMs = (ms: number) => Math.min(Math.max(ms, 0), durationMs);

  return spans.flatMap(([start, end]) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const from = clampMs(start);
    const to = clampMs(end);
    return to > from
      ? ([
          [clampMs(from - labelBuffer), clampMs(to + labelBuffer)],
        ] as Interval[])
      : ([
          [clampMs(from - markerPadding), clampMs(from + markerPadding)],
        ] as Interval[]);
  });
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(([start, end]) => end >= start)
    .sort((a, b) => a[0] - b[0]);

  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push([current[0], current[1]]);
    }
  }
  return merged;
}

function collectCollapsibleGaps(
  intervals: readonly Interval[],
  durationMs: number,
): Interval[] {
  const threshold = durationMs * COLLAPSE_THRESHOLD_RATIO;
  const gaps: Interval[] = [];
  let previousEnd = 0;

  for (const [start, end] of intervals) {
    if (start - previousEnd >= threshold) gaps.push([previousEnd, start]);
    previousEnd = Math.max(previousEnd, end);
  }
  if (durationMs - previousEnd >= threshold) {
    gaps.push([previousEnd, durationMs]);
  }

  return gaps;
}
