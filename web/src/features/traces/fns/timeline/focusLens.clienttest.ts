import { describe, expect, it } from "vitest";
import { applyFocusLens, rowIndexAtY } from "./focusLens";

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
