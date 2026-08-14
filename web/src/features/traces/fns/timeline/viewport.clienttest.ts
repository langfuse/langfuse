import { describe, expect, it } from "vitest";
import { traceSpaceOf } from "./viewTransform";
import {
  HUMAN_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  clampViewport,
  fitViewport,
  focusViewport,
  isViewportFitted,
  panViewport,
  rowHeightOf,
  viewportsEqual,
  visibleRowRange,
  zoomViewport,
  type Viewport,
} from "./viewport";

// 600px of rows over a 24s trace, one row per span.
const limits = {
  traceSpace: traceSpaceOf(24_000),
  rowCount: 500,
  boxHeight: 600,
};
const BOX_WIDTH = 340;

describe("viewport", () => {
  it("fits to the densest row window the height allows", () => {
    const fitted = fitViewport(limits);
    // 600px at the 4px floor shows 150 of the 500 rows; the rest is panned to.
    expect(fitted.rows.count).toBe(limits.boxHeight / MIN_ROW_HEIGHT);
    expect(fitted.rows.start).toBe(0);
    expect(rowHeightOf(fitted, limits.boxHeight)).toBe(MIN_ROW_HEIGHT);
    expect(fitted.time).toEqual(limits.traceSpace);
    expect(isViewportFitted(fitted, limits)).toBe(true);

    // A trace that fits entirely shows every row and still floors at 4px.
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
    expect(zoomed.rows.count).toBeCloseTo(75, 6);
    expect(rowHeightOf(zoomed, limits.boxHeight)).toBeCloseTo(8, 6);
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
      rowIndex: 499,
      startMs: 23_000,
      durationMs: 100,
    });
    expect(last.rows.start + last.rows.count).toBeLessThanOrEqual(
      limits.rowCount + 0.001,
    );
  });

  it("windows the rows it renders", () => {
    const zoomed = zoomViewport(fitViewport(limits), limits, {
      factor: 8,
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
