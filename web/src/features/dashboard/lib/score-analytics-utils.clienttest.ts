import { describe, expect, it } from "vitest";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { createHistogramData } from "@/src/features/dashboard/lib/score-analytics-utils";

const rows = (values: number[]): DatabaseRow[] =>
  values.map((value) => ({ value }) as unknown as DatabaseRow);

describe("createHistogramData", () => {
  it("bins values by their raw magnitude, not a 2-decimal rounding of them", () => {
    // 0.146 belongs in [0.14, 0.15). The previous implementation rounded values
    // to 2 decimals before binning, so 0.146 -> 0.15 landed in the next bin.
    const { chartData } = createHistogramData(rows([0.14, 0.146, 0.16]), 2, 10);

    expect(chartData).toHaveLength(2);
    expect(chartData[0]).toMatchObject({ binLabel: "[0.14, 0.15]", count: 2 });
    expect(chartData[1]).toMatchObject({ binLabel: "[0.15, 0.16]", count: 1 });
  });

  it("does not push a value into a bucket whose range excludes it", () => {
    // Regression for the reported symptom: a score of 0.857 was counted in the
    // "[0.86, 1]" bucket. It must land in the bucket that actually contains it.
    const { chartData } = createHistogramData(
      rows([0, 0.857, 0.86, 1]),
      7,
      7,
    );

    const topBin = chartData[chartData.length - 1];
    expect(topBin.binLabel).toBe("[0.86, 1]");
    expect(topBin.count).toBe(2); // 0.86 and 1.0 — NOT 0.857

    const bin = chartData[5];
    expect(bin.binLabel).toBe("[0.71, 0.86]");
    expect(bin.count).toBe(1); // 0.857
  });

  it("preserves the total count across all bins", () => {
    const values = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.99, 0.05, 0.5, 0.95];
    const { chartData } = createHistogramData(rows(values));
    const total = chartData.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(values.length);
  });

  it("does not emit degenerate zero-width labels for narrow ranges", () => {
    const { chartData } = createHistogramData(
      rows([0.801, 0.803, 0.811, 0.822, 0.828, 0.834, 0.841, 0.849]),
    );
    for (const bin of chartData) {
      const [lo, hi] = bin.binLabel
        .replace(/[[\]]/g, "")
        .split(",")
        .map((s) => parseFloat(s));
      expect(hi).toBeGreaterThan(lo); // never "[0.85, 0.85]"
    }
  });

  it("handles identical values as a single populated bin", () => {
    const { chartData } = createHistogramData(rows([0.5, 0.5, 0.5]));
    expect(chartData).toHaveLength(1);
    expect(chartData[0].count).toBe(3);
  });

  it("returns empty data for no values", () => {
    expect(createHistogramData(rows([]))).toEqual({
      chartData: [],
      chartLabels: [],
    });
  });
});
