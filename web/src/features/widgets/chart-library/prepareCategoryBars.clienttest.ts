import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLOR_LIMIT,
  prepareCategoryBars,
} from "@/src/features/widgets/chart-library/prepareCategoryBars";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

const bars = (count: number): DataPoint[] =>
  Array.from({ length: count }, (_, index) => ({
    time_dimension: `run-${index}`,
    dimension: `run-${index}`,
    metric: index,
  }));

describe("prepareCategoryBars", () => {
  it("colours every bar and names it while the palette can identify", () => {
    const prepared = prepareCategoryBars(bars(CATEGORY_COLOR_LIMIT));

    expect(prepared.legend).toHaveLength(CATEGORY_COLOR_LIMIT);
    expect(new Set(prepared.legend.map((item) => item.color)).size).toBe(
      CATEGORY_COLOR_LIMIT,
    );
    // The swatch is the bar's fill, not a parallel lookup.
    expect(prepared.rows.map((row) => row.fill)).toEqual(
      prepared.legend.map((item) => item.color),
    );
  });

  it("drops the legend once the palette would repeat a colour", () => {
    const prepared = prepareCategoryBars(bars(CATEGORY_COLOR_LIMIT + 1));

    expect(prepared.legend).toEqual([]);
    expect(prepared.total).toBe(CATEGORY_COLOR_LIMIT + 1);
    expect(prepared.rows.every((row) => row.fill === undefined)).toBe(true);
  });

  it("keys colour by category, so repeated categories match", () => {
    const prepared = prepareCategoryBars([
      { time_dimension: "a", dimension: "a", metric: 1 },
      { time_dimension: "b", dimension: "b", metric: 2 },
      { time_dimension: "a", dimension: "a", metric: 3 },
    ]);

    expect(prepared.total).toBe(2);
    expect(prepared.rows[0].fill).toBe(prepared.rows[2].fill);
    expect(prepared.rows[0].fill).not.toBe(prepared.rows[1].fill);
  });
});
