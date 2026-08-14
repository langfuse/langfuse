import { describe, expect, it } from "vitest";
import {
  COMFORTABLE_ROW_HEIGHT,
  HAIRLINE_ROW_HEIGHT,
  applyFocusLens,
  resolveVerticalFit,
  rowIndexAtY,
} from "./verticalFit";

describe("resolveVerticalFit", () => {
  it("shrinks rows to fit the box and never grows past comfortable", () => {
    // 3 rows in a tall box stay dense rather than filling the slack.
    expect(resolveVerticalFit({ rowCount: 3, boxHeight: 600 }).rowHeight).toBe(
      COMFORTABLE_ROW_HEIGHT,
    );
    // 40 rows in 400px: 10px each, so no text but still a type square.
    const compact = resolveVerticalFit({ rowCount: 40, boxHeight: 400 });
    expect(compact.rowHeight).toBe(10);
    expect(compact.presentation).toBe("compact");
    expect(compact.fitsWithoutScroll).toBe(true);
    // 120 rows in 600px: 5px each — already past text, still above the floor.
    const dense = resolveVerticalFit({ rowCount: 120, boxHeight: 600 });
    expect(dense.rowHeight).toBe(5);
    expect(dense.presentation).toBe("hairline");
    // 150 rows in 600px is exactly the floor: bar 3px + 1px gap, still no scroll.
    const hairline = resolveVerticalFit({ rowCount: 150, boxHeight: 600 });
    expect(hairline.rowHeight).toBe(HAIRLINE_ROW_HEIGHT);
    expect(hairline.barHeight).toBe(3);
    expect(hairline.fitsWithoutScroll).toBe(true);
  });

  it("reports where no-scroll breaks instead of pretending it holds", () => {
    // 1401 rows cannot fit a 600px box even at 4px: 150 is the capacity.
    const overflowing = resolveVerticalFit({ rowCount: 1401, boxHeight: 600 });
    expect(overflowing.rowHeight).toBe(HAIRLINE_ROW_HEIGHT);
    expect(overflowing.capacityAtFloor).toBe(150);
    expect(overflowing.overflowRows).toBe(1251);
    expect(overflowing.fitsWithoutScroll).toBe(false);
  });

  it("stays finite and sane on degenerate input", () => {
    for (const fit of [
      resolveVerticalFit({ rowCount: 0, boxHeight: 0 }),
      resolveVerticalFit({ rowCount: 10, boxHeight: 0 }),
      resolveVerticalFit({ rowCount: NaN, boxHeight: NaN }),
      resolveVerticalFit({ rowCount: -5, boxHeight: -100 }),
    ]) {
      expect(Number.isFinite(fit.rowHeight)).toBe(true);
      expect(fit.rowHeight).toBeGreaterThanOrEqual(HAIRLINE_ROW_HEIGHT);
      expect(Number.isFinite(fit.barHeight)).toBe(true);
      expect(fit.barHeight).toBeGreaterThanOrEqual(1);
      expect(fit.overflowRows).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("applyFocusLens", () => {
  const total = 600;
  const rowCount = 150;

  it("always sums to the height it was given, lens or no lens", () => {
    const sum = (rows: ReturnType<typeof applyFocusLens>) =>
      rows.reduce((acc, row) => acc + row.height, 0);

    const resting = applyFocusLens({
      rowCount,
      totalHeight: total,
      focusIndex: null,
      radius: 12,
      magnification: 8,
    });
    expect(sum(resting)).toBeCloseTo(total, 6);
    expect(resting.every((row) => row.height === total / rowCount)).toBe(true);

    for (const focusIndex of [0, 1, 74, 148, rowCount - 1]) {
      const lensed = applyFocusLens({
        rowCount,
        totalHeight: total,
        focusIndex,
        radius: 12,
        magnification: 8,
      });
      // This is the no-scroll invariant: magnified rows can only borrow.
      expect(sum(lensed)).toBeCloseTo(total, 6);
      expect(lensed[focusIndex]!.height).toBeGreaterThan(total / rowCount);
      expect(lensed[0]!.y).toBe(0);
      for (const row of lensed) expect(Number.isFinite(row.height)).toBe(true);
    }
  });

  it("tapers off with distance and leaves far rows untouched", () => {
    const rows = applyFocusLens({
      rowCount,
      totalHeight: total,
      focusIndex: 75,
      radius: 12,
      magnification: 8,
    });

    // Monotonically smaller as you walk away from the focus, then flat.
    expect(rows[75]!.height).toBeGreaterThan(rows[78]!.height);
    expect(rows[78]!.height).toBeGreaterThan(rows[84]!.height);
    expect(rows[87]!.magnification).toBe(1);
    expect(rows[10]!.height).toBeCloseTo(rows[140]!.height, 6);
  });

  it("is total on degenerate input", () => {
    expect(
      applyFocusLens({
        rowCount: 0,
        totalHeight: 600,
        focusIndex: 3,
        radius: 5,
        magnification: 4,
      }),
    ).toEqual([]);

    for (const rows of [
      applyFocusLens({
        rowCount: 5,
        totalHeight: 0,
        focusIndex: 2,
        radius: 2,
        magnification: 4,
      }),
      applyFocusLens({
        rowCount: 5,
        totalHeight: NaN,
        focusIndex: NaN,
        radius: NaN,
        magnification: NaN,
      }),
      // Out-of-range focus clamps rather than producing a hole.
      applyFocusLens({
        rowCount: 5,
        totalHeight: 100,
        focusIndex: 99,
        radius: 0,
        magnification: 4,
      }),
    ]) {
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(Number.isFinite(row.height)).toBe(true);
        expect(Number.isFinite(row.y)).toBe(true);
      }
    }
  });
});

describe("rowIndexAtY", () => {
  it("finds the row under a pointer through a distorted layout", () => {
    const rows = applyFocusLens({
      rowCount: 150,
      totalHeight: 600,
      focusIndex: 75,
      radius: 12,
      magnification: 8,
    });

    expect(rowIndexAtY(rows, -1)).toBeNull();
    expect(rowIndexAtY(rows, 0)).toBe(0);
    expect(rowIndexAtY(rows, 600.5)).toBeNull();
    // The row reported for its own midpoint is itself, magnified or not.
    for (const index of [0, 40, 75, 76, 149]) {
      const row = rows[index]!;
      expect(rowIndexAtY(rows, row.y + row.height / 2)).toBe(index);
    }
  });
});
