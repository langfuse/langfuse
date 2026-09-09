import { describe, expect, it } from "vitest";
import { traceSpaceOf } from "./viewTransform";
import {
  HUMAN_ROW_HEIGHT,
  LABELLED_ROW_HEIGHT,
  anchorTimeToRows,
  canExpandRowsToReadable,
  expandRowsToReadable,
  MAX_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  clampViewport,
  fitViewport,
  focusViewport,
  isViewportFitted,
  panViewport,
  presentationForRowHeight,
  revealViewport,
  rowHeightOf,
  viewportsEqual,
  interpolateViewport,
  visibleRowRange,
  zoomToBox,
  zoomViewport,
  zoomViewportRevealLabels,
  type Viewport,
} from "./viewport";

// 600px of rows over a 24s trace, one row per span. More spans than the box has
// pixels, so the floor and the panning both get exercised.
const limits = {
  traceSpace: traceSpaceOf(24_000),
  rowCount: 2_000,
  boxHeight: 600,
};
const BOX_WIDTH = 340;

describe("viewport", () => {
  it("fits to the densest row window the height allows", () => {
    const fitted = fitViewport(limits);
    // 600px at the 1px floor shows 600 of the 2000 rows; the rest is panned to.
    expect(fitted.rows.count).toBe(limits.boxHeight / MIN_ROW_HEIGHT);
    expect(fitted.rows.start).toBe(0);
    expect(rowHeightOf(fitted, limits.boxHeight)).toBe(MIN_ROW_HEIGHT);
    expect(fitted.time).toEqual(limits.traceSpace);
    expect(isViewportFitted(fitted, limits)).toBe(true);

    // A trace that fits entirely shows every row, floor or no floor.
    const forty = { ...limits, rowCount: 40 };
    expect(fitViewport(forty).rows.count).toBe(40);
    expect(rowHeightOf(fitViewport(forty), 600)).toBe(15);

    // A SHORT trace must not stretch its rows to fill the box: the window
    // over-hangs the content instead, so the rows cap at the human height and
    // the leftover space stays empty. Three rows in 600px are 26px, not 200px.
    for (const rowCount of [1, 3, 12]) {
      const short = { ...limits, rowCount };
      const height = rowHeightOf(fitViewport(short), 600);
      expect(height).toBeLessThanOrEqual(HUMAN_ROW_HEIGHT + 0.001);
      expect(height).toBeCloseTo(HUMAN_ROW_HEIGHT, 6);
      // Nothing to pan to when the whole trace is on screen.
      expect(fitViewport(short).rows.start).toBe(0);
    }

    // Zooming in can still take rows past the resting cap, up to the ceiling.
    const short = { ...limits, rowCount: 3 };
    const zoomedIn = zoomViewport(fitViewport(short), short, {
      factor: 100,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(rowHeightOf(zoomedIn, 600)).toBeCloseTo(MAX_ROW_HEIGHT, 6);
  });

  it("expands rows to a readable height without narrowing the clock", () => {
    const fitted = fitViewport(limits);
    expect(rowHeightOf(fitted, limits.boxHeight)).toBe(MIN_ROW_HEIGHT);
    expect(canExpandRowsToReadable(fitted, limits)).toBe(true);
    expect(presentationForRowHeight(MIN_ROW_HEIGHT)).toBe("hairline");

    const expanded = expandRowsToReadable(fitted, limits);
    expect(rowHeightOf(expanded, limits.boxHeight)).toBeCloseTo(
      HUMAN_ROW_HEIGHT,
      6,
    );
    expect(expanded.time).toEqual(limits.traceSpace);
    expect(expanded.rows.start).toBe(0);
    expect(isViewportFitted(expanded, limits)).toBe(false);
    expect(canExpandRowsToReadable(expanded, limits)).toBe(false);
    expect(
      presentationForRowHeight(rowHeightOf(expanded, limits.boxHeight)),
    ).toBe("labelled");

    // A window that has been panned keeps that slice at the top.
    const panned = {
      ...fitted,
      rows: { start: 800, count: fitted.rows.count },
    };
    const fromThere = expandRowsToReadable(panned, limits);
    expect(fromThere.rows.start).toBeCloseTo(800, 6);
    expect(fromThere.time).toEqual(panned.time);

    // A clock that has already been sliced stays sliced; only the rows grow.
    const narrowed = zoomViewport(fitted, limits, {
      factor: 2,
      xRatio: 0.5,
      yRatio: 0.5,
      axes: "x",
    });
    expect(canExpandRowsToReadable(narrowed, limits)).toBe(true);
    const expandedClock = expandRowsToReadable(narrowed, limits);
    expect(expandedClock.time).toEqual(narrowed.time);
    expect(rowHeightOf(expandedClock, limits.boxHeight)).toBeCloseTo(
      HUMAN_ROW_HEIGHT,
      6,
    );

    // A short trace already sits at the human height — nothing to grow.
    const short = { ...limits, rowCount: 12 };
    const shortFit = fitViewport(short);
    expect(canExpandRowsToReadable(shortFit, short)).toBe(false);
    expect(expandRowsToReadable(shortFit, short)).toEqual(shortFit);
  });

  it("zooms only the rows when labels are still hidden", () => {
    const fitted = fitViewport(limits);
    const yOnly = zoomViewport(fitted, limits, {
      factor: 2,
      xRatio: 0.5,
      yRatio: 0.5,
      axes: "y",
    });
    expect(yOnly.time).toEqual(fitted.time);
    expect(yOnly.rows.count).toBeCloseTo(300, 6);
    expect(rowHeightOf(yOnly, limits.boxHeight)).toBeCloseTo(2, 6);

    // Incremental zoom-in stays on Y until a label would fit.
    const reveal = zoomViewportRevealLabels(fitted, limits, {
      factor: 2,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(reveal.time).toEqual(fitted.time);
    expect(rowHeightOf(reveal, limits.boxHeight)).toBeCloseTo(2, 6);

    // A factor large enough to cross the labelled threshold spends the rest
    // on both axes — otherwise a batched pinch would leave the clock full.
    const crossing = zoomViewportRevealLabels(fitted, limits, {
      factor: LABELLED_ROW_HEIGHT * 1.2,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(rowHeightOf(crossing, limits.boxHeight)).toBeGreaterThanOrEqual(
      LABELLED_ROW_HEIGHT,
    );
    expect(crossing.time.duration).toBeCloseTo(fitted.time.duration / 1.2, 6);

    const labelled = expandRowsToReadable(fitted, limits);
    const both = zoomViewportRevealLabels(labelled, limits, {
      factor: 1.2,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(both.time.duration).toBeCloseTo(labelled.time.duration / 1.2, 6);
    expect(both.rows.count).toBeCloseTo(labelled.rows.count / 1.2, 6);

    // Zooming out from the hairline is a no-op on time (already full) and
    // cannot shrink the rows below the floor.
    const out = zoomViewportRevealLabels(fitted, limits, {
      factor: 0.5,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(out.time).toEqual(fitted.time);
    expect(rowHeightOf(out, limits.boxHeight)).toBeCloseTo(MIN_ROW_HEIGHT, 6);
    expect(LABELLED_ROW_HEIGHT).toBe(20);
  });

  it("zooms both axes about the anchor and holds the content under it", () => {
    const zoomed = zoomViewport(fitViewport(limits), limits, {
      factor: 2,
      xRatio: 0.5,
      yRatio: 0.5,
    });

    // Time halves about the midpoint...
    expect(zoomed.time.duration).toBeCloseTo(12_000, 6);
    expect(zoomed.time.start).toBeCloseTo(6_000, 6);
    // ...and so does the row window, so the rows get twice as tall.
    expect(zoomed.rows.count).toBeCloseTo(300, 6);
    expect(rowHeightOf(zoomed, limits.boxHeight)).toBeCloseTo(2, 6);
    expect(isViewportFitted(zoomed, limits)).toBe(false);

    // The row under the anchor stays under the anchor.
    const before = fitViewport(limits);
    const anchorRowBefore = before.rows.start + before.rows.count * 0.25;
    const anchored = zoomViewport(before, limits, {
      factor: 3,
      xRatio: 0.25,
      yRatio: 0.25,
    });
    expect(anchored.rows.start + anchored.rows.count * 0.25).toBeCloseTo(
      anchorRowBefore,
      6,
    );
  });

  it("clamps row height between the floor and the ceiling", () => {
    const deep = zoomViewport(fitViewport(limits), limits, {
      factor: 1_000,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(rowHeightOf(deep, limits.boxHeight)).toBeCloseTo(MAX_ROW_HEIGHT, 6);

    const out = zoomViewport(deep, limits, {
      factor: 0.0001,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(rowHeightOf(out, limits.boxHeight)).toBeCloseTo(MIN_ROW_HEIGHT, 6);
    expect(out.time.duration).toBeCloseTo(limits.traceSpace.duration, 6);
  });

  it("pans both axes and cannot leave the content", () => {
    const zoomed = zoomViewport(fitViewport(limits), limits, {
      factor: 4,
      xRatio: 0.5,
      yRatio: 0.5,
    });

    const panned = panViewport(zoomed, limits, {
      dxPx: -50,
      dyPx: -80,
      boxWidth: BOX_WIDTH,
    });
    expect(panned.time.start).toBeGreaterThan(zoomed.time.start);
    expect(panned.rows.start).toBeGreaterThan(zoomed.rows.start);
    // Zoom is untouched by a pan.
    expect(panned.time.duration).toBeCloseTo(zoomed.time.duration, 6);
    expect(panned.rows.count).toBeCloseTo(zoomed.rows.count, 6);

    // Dragging past either end stops at the end rather than running off.
    const overshot = panViewport(zoomed, limits, {
      dxPx: -100_000,
      dyPx: -100_000,
      boxWidth: BOX_WIDTH,
    });
    expect(overshot.rows.start + overshot.rows.count).toBeCloseTo(
      limits.rowCount,
      6,
    );
    expect(overshot.time.start + overshot.time.duration).toBeCloseTo(
      limits.traceSpace.duration,
      6,
    );
    const backAtStart = panViewport(zoomed, limits, {
      dxPx: 100_000,
      dyPx: 100_000,
      boxWidth: BOX_WIDTH,
    });
    expect(backAtStart.rows.start).toBe(0);
    expect(backAtStart.time.start).toBe(0);
  });

  it("focuses one element on both axes at a readable row height", () => {
    const focused = focusViewport(limits, {
      rowIndex: 300,
      startMs: 10_000,
      durationMs: 400,
    });

    // Rows land at the human height, with the target centred.
    expect(rowHeightOf(focused, limits.boxHeight)).toBeCloseTo(
      HUMAN_ROW_HEIGHT,
      6,
    );
    expect(focused.rows.start + focused.rows.count / 2).toBeCloseTo(300.5, 6);
    // And the time window is the span plus breathing room, not the whole trace.
    expect(focused.time.start).toBeCloseTo(9_900, 6);
    expect(focused.time.duration).toBeCloseTo(600, 6);

    // A zero-duration span still gets a usable window instead of a collapse.
    const instant = focusViewport(limits, {
      rowIndex: 0,
      startMs: 5_000,
      durationMs: 0,
    });
    expect(instant.time.duration).toBeGreaterThan(0);
    expect(instant.rows.start).toBe(0);

    // Focusing the last row keeps the window inside the content.
    const last = focusViewport(limits, {
      rowIndex: limits.rowCount - 1,
      startMs: 23_000,
      durationMs: 100,
    });
    expect(last.rows.start + last.rows.count).toBeLessThanOrEqual(
      limits.rowCount + 0.001,
    );
  });

  it("slides the clock to the rows when a zoom lands on empty air", () => {
    // The rows of this trace all live in its first third — a chain that finishes
    // early inside a trace whose duration one long root sets.
    const extentOf = (rowIndex: number) => ({
      startMs: rowIndex * 4,
      endMs: rowIndex * 4 + 3,
    });
    const zoomed = zoomViewport(fitViewport(limits), limits, {
      factor: 4,
      xRatio: 0.5,
      yRatio: 0,
    });
    // Rows 0-150ish, in a window centred on the middle of the trace: carets only.
    expect(zoomed.time.start).toBeGreaterThan(600 * 4);

    const anchored = anchorTimeToRows(zoomed, limits, extentOf);
    expect(anchored.time.duration).toBeCloseTo(zoomed.time.duration, 6);
    expect(anchored.rows).toEqual(zoomed.rows);
    // The window now covers the rows on screen.
    const range = visibleRowRange(anchored, limits.rowCount, 0);
    const first = extentOf(range.startIndex);
    const last = extentOf(range.endIndex);
    expect(anchored.time.start).toBeLessThanOrEqual(last.endMs);
    expect(anchored.time.start + anchored.time.duration).toBeGreaterThanOrEqual(
      first.startMs,
    );

    // Idempotent, and a no-op whenever there is anything to look at — it must
    // never move the ground under someone reading a span.
    expect(
      viewportsEqual(anchorTimeToRows(anchored, limits, extentOf), anchored),
    ).toBe(true);
    expect(anchorTimeToRows(fitViewport(limits), limits, extentOf)).toEqual(
      fitViewport(limits),
    );
    // No extents at all (an empty or unknown trace) leaves it untouched.
    expect(anchorTimeToRows(zoomed, limits, () => null)).toEqual(zoomed);
  });

  it("zooms to a drawn box on both axes", () => {
    const fitted = fitViewport(limits);
    // The right half of the width, the second quarter of the height.
    const boxed = zoomToBox(fitted, limits, {
      xStartRatio: 0.5,
      xEndRatio: 1,
      yStartRatio: 0.25,
      yEndRatio: 0.5,
    });
    expect(boxed.time.start).toBeCloseTo(12_000, 6);
    expect(boxed.time.duration).toBeCloseTo(12_000, 6);
    expect(boxed.rows.start).toBeCloseTo(150, 6);
    expect(boxed.rows.count).toBeCloseTo(150, 6);

    // Drawn right-to-left and bottom-to-top is the same box.
    expect(
      zoomToBox(fitted, limits, {
        xStartRatio: 1,
        xEndRatio: 0.5,
        yStartRatio: 0.5,
        yEndRatio: 0.25,
      }),
    ).toEqual(boxed);

    // A flat box keeps that axis rather than asking for an infinite zoom.
    const flat = zoomToBox(fitted, limits, {
      xStartRatio: 0.5,
      xEndRatio: 0.5,
      yStartRatio: 0.25,
      yEndRatio: 0.5,
    });
    expect(flat.time.duration).toBeCloseTo(fitted.time.duration, 6);
    expect(flat.rows.count).toBeCloseTo(150, 6);

    // And a pinhole box still cannot take the rows past the height ceiling.
    const tiny = zoomToBox(fitted, limits, {
      xStartRatio: 0.5,
      xEndRatio: 0.5001,
      yStartRatio: 0.5,
      yEndRatio: 0.5001,
    });
    expect(rowHeightOf(tiny, limits.boxHeight)).toBeCloseTo(MAX_ROW_HEIGHT, 6);
    expect(Number.isFinite(tiny.time.start)).toBe(true);

    for (const degenerate of [
      { xStartRatio: NaN, xEndRatio: NaN, yStartRatio: NaN, yEndRatio: NaN },
      { xStartRatio: -3, xEndRatio: 9, yStartRatio: -1, yEndRatio: 4 },
    ]) {
      const result = zoomToBox(fitted, limits, degenerate);
      expect(Number.isFinite(result.time.start)).toBe(true);
      expect(Number.isFinite(result.rows.count)).toBe(true);
    }
  });

  it("reveals a row without changing the zoom", () => {
    const zoomed = zoomViewport(fitViewport(limits), limits, {
      factor: 16,
      xRatio: 0,
      yRatio: 0,
    });
    expect(zoomed.rows.start).toBe(0);

    // A selection from the tree, a search or a deep link lands on row 900 —
    // nowhere near the window — and it has to become visible.
    const revealed = revealViewport(zoomed, limits, {
      rowIndex: 900,
      startMs: 18_000,
      endMs: 18_100,
    });
    expect(revealed.rows.start).toBeLessThanOrEqual(900);
    expect(revealed.rows.start + revealed.rows.count).toBeGreaterThan(900);
    expect(revealed.time.start).toBeLessThanOrEqual(18_000);
    expect(revealed.time.start + revealed.time.duration).toBeGreaterThanOrEqual(
      18_100,
    );
    // But NOT by zooming: how far in you are looking is the user's business.
    expect(revealed.rows.count).toBeCloseTo(zoomed.rows.count, 6);
    expect(revealed.time.duration).toBeCloseTo(zoomed.time.duration, 6);

    // A row already comfortably inside the window is left exactly alone, which
    // is what keeps a click on a visible row from moving the ground under it.
    const inside = revealViewport(revealed, limits, {
      rowIndex: Math.round(revealed.rows.start + revealed.rows.count / 2),
      startMs: revealed.time.start + revealed.time.duration / 2,
      endMs: revealed.time.start + revealed.time.duration / 2 + 1,
    });
    expect(viewportsEqual(inside, revealed)).toBe(true);

    // A span wider than the window cannot be contained, so it is centred.
    const wide = revealViewport(zoomed, limits, {
      rowIndex: 10,
      startMs: 0,
      endMs: 24_000,
    });
    expect(wide.time.start + wide.time.duration / 2).toBeCloseTo(12_000, 6);

    for (const viewport of [
      revealViewport(zoomed, limits, {
        rowIndex: NaN,
        startMs: NaN,
        endMs: NaN,
      }),
      revealViewport(
        zoomed,
        { ...limits, rowCount: 0 },
        {
          rowIndex: 5,
          startMs: 0,
          endMs: 1,
        },
      ),
    ]) {
      expect(Number.isFinite(viewport.rows.start)).toBe(true);
      expect(Number.isFinite(viewport.time.start)).toBe(true);
    }
  });

  it("windows the rows it renders", () => {
    const zoomed = zoomViewport(fitViewport(limits), limits, {
      factor: 64,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    const range = visibleRowRange(zoomed, limits.rowCount);
    expect(range.endIndex - range.startIndex + 1).toBeLessThan(30);
    expect(range.startIndex).toBeGreaterThanOrEqual(0);
    expect(range.endIndex).toBeLessThan(limits.rowCount);

    expect(visibleRowRange(fitViewport(limits), 0)).toEqual({
      startIndex: 0,
      endIndex: -1,
    });
  });

  it("reports whether a gesture actually moved the window", () => {
    const fitted = fitViewport(limits);
    expect(viewportsEqual(fitted, fitViewport(limits))).toBe(true);

    // Panning up at the very top is clamped away, so nothing moved — that is
    // what lets the surface hand the scroll back to the page instead of eating it.
    const pinnedTop = panViewport(fitted, limits, {
      dxPx: 0,
      dyPx: 200,
      boxWidth: BOX_WIDTH,
    });
    expect(viewportsEqual(pinnedTop, fitted)).toBe(true);

    const zoomed = zoomViewport(fitted, limits, {
      factor: 2,
      xRatio: 0.5,
      yRatio: 0.5,
    });
    expect(viewportsEqual(zoomed, fitted)).toBe(false);
    const moved = panViewport(zoomed, limits, {
      dxPx: 0,
      dyPx: -40,
      boxWidth: BOX_WIDTH,
    });
    expect(viewportsEqual(moved, zoomed)).toBe(false);
  });

  it("interpolates a focus geometrically on the scales", () => {
    const from = fitViewport(limits);
    const to = focusViewport(limits, {
      rowIndex: 300,
      startMs: 10_000,
      durationMs: 400,
    });

    expect(interpolateViewport(from, to, 0)).toEqual(from);
    const landed = interpolateViewport(from, to, 1);
    expect(landed.time.duration).toBeCloseTo(to.time.duration, 3);
    expect(landed.rows.count).toBeCloseTo(to.rows.count, 3);

    // Halfway is the geometric mean of the two scales, not the arithmetic one —
    // a linear tween crawls at the wide end and then lurches.
    const half = interpolateViewport(from, to, 0.5);
    expect(half.time.duration).toBeCloseTo(
      Math.sqrt(from.time.duration * to.time.duration),
      3,
    );
    expect(half.rows.count).toBeCloseTo(
      Math.sqrt(from.rows.count * to.rows.count),
      3,
    );

    // Monotone, so the animation never doubles back on itself.
    let previous = from.time.duration;
    for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
      const step = interpolateViewport(from, to, t).time.duration;
      expect(step).toBeLessThan(previous);
      previous = step;
    }

    for (const t of [NaN, -1, 2]) {
      const step = interpolateViewport(from, to, t);
      expect(Number.isFinite(step.time.duration)).toBe(true);
      expect(Number.isFinite(step.rows.count)).toBe(true);
    }
  });

  it("is total on degenerate input", () => {
    const degenerate = [
      { traceSpace: traceSpaceOf(0), rowCount: 0, boxHeight: 0 },
      { traceSpace: traceSpaceOf(NaN), rowCount: NaN, boxHeight: NaN },
      { traceSpace: traceSpaceOf(1_000), rowCount: 1, boxHeight: 0 },
    ];

    for (const limit of degenerate) {
      const fitted = fitViewport(limit);
      const nan: Viewport = {
        time: { start: NaN, duration: NaN },
        rows: { start: NaN, count: NaN },
      };
      for (const viewport of [
        fitted,
        clampViewport(nan, limit),
        zoomViewport(fitted, limit, { factor: NaN, xRatio: NaN, yRatio: NaN }),
        panViewport(fitted, limit, { dxPx: NaN, dyPx: NaN, boxWidth: NaN }),
        focusViewport(limit, { rowIndex: NaN, startMs: NaN, durationMs: NaN }),
      ]) {
        expect(Number.isFinite(viewport.time.start)).toBe(true);
        expect(Number.isFinite(viewport.time.duration)).toBe(true);
        expect(Number.isFinite(viewport.rows.start)).toBe(true);
        expect(Number.isFinite(viewport.rows.count)).toBe(true);
        expect(Number.isFinite(rowHeightOf(viewport, limit.boxHeight))).toBe(
          true,
        );
      }
    }
  });
});
