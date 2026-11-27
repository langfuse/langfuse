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
import type { RowExtent, Viewport, ViewportLimits } from "../types";
import { clampViewport } from "./clampViewport";
import { visibleRowRange } from "./visibleRowRange";

function intervalsOf(
  extent: RowExtent | readonly RowExtent[] | null,
): readonly RowExtent[] {
  if (extent == null) return [];
  if ("startMs" in extent) return [extent];
  return extent;
}

export function anchorTimeToRows(
  viewport: Viewport,
  limits: ViewportLimits,
  extentOf: (rowIndex: number) => RowExtent | readonly RowExtent[] | null,
): Viewport {
  const range = visibleRowRange(viewport, limits.rowCount, 0);
  const windowStart = viewport.time.start;
  const windowEnd = windowStart + viewport.time.duration;
  let nearest: RowExtent | null = null;
  let nearestDistance = Infinity;

  for (let index = range.startIndex; index <= range.endIndex; index++) {
    const intervals = intervalsOf(extentOf(index));
    for (const interval of intervals) {
      // Anything at all inside the window means there is something to look at.
      // A shared lane reports each span, so a gap between them still counts
      // as empty.
      if (interval.endMs >= windowStart && interval.startMs <= windowEnd) {
        return viewport;
      }
      const distance =
        interval.endMs < windowStart
          ? windowStart - interval.endMs
          : interval.startMs - windowEnd;
      if (distance < nearestDistance) {
        nearest = interval;
        nearestDistance = distance;
      }
    }
  }
  if (!nearest) return viewport;

  const centre = (nearest.startMs + nearest.endMs) / 2;
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
