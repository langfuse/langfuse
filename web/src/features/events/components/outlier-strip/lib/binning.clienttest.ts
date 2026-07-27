import { describe, it, expect } from "vitest";
import {
  pickChartGranularity,
  prepareOutlierSeries,
  type OutlierStripBin,
} from "./binning";

describe("pickChartGranularity", () => {
  it("picks the finest preset that fits the width", () => {
    // 24h into 200 slots (1000px / 5px): 10m (144 bars) fits, 5m (288) not.
    expect(
      pickChartGranularity({
        rangeMs: 24 * 3600 * 1000,
        widthPx: 1000,
        barSlotPx: 5,
      }),
    ).toEqual({ granularity: "10m", stepSeconds: 600 });
  });

  it("adapts to narrower widths with coarser presets", () => {
    // 24h into 60 slots: 30m (48 bars) fits, 15m (96) not.
    expect(
      pickChartGranularity({
        rangeMs: 24 * 3600 * 1000,
        widthPx: 300,
        barSlotPx: 5,
      }).granularity,
    ).toBe("30m");
  });

  it("falls back to the coarsest preset for extreme ranges", () => {
    // 2 years into 100 slots: even 1w gives 105 bars — accept the overflow.
    expect(
      pickChartGranularity({
        rangeMs: 730 * 86400 * 1000,
        widthPx: 500,
        barSlotPx: 5,
      }).granularity,
    ).toBe("1w");
  });

  it("caps requested buckets even on huge widths", () => {
    const { stepSeconds } = pickChartGranularity({
      rangeMs: 90 * 86400 * 1000,
      widthPx: 100_000,
      barSlotPx: 1,
    });
    expect((90 * 86400) / stepSeconds).toBeLessThanOrEqual(2000);
  });
});

describe("prepareOutlierSeries", () => {
  const bin = (
    bucketStartMs: number,
    value: number | null,
  ): OutlierStripBin => ({
    bucketStart: new Date(bucketStartMs),
    count: value === null ? 0 : 1,
    maxTotalCost: value,
    maxLatencySeconds: value,
    maxTotalTokens: value,
  });

  it("densifies onto the epoch grid with nulls for empty buckets", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const { dense, maxValue } = prepareOutlierSeries({
      bins: [bin(t0, 3), bin(t0 + 120_000, 7)],
      metric: "cost",
      fromMs: t0,
      toMs: t0 + 179_000, // covers three buckets
      stepSeconds: step,
    });

    expect(dense.map((d) => d.value)).toEqual([3, null, 7]);
    expect(maxValue).toBe(7);
  });

  it("aligns the grid to the epoch, not to `from`", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const { dense } = prepareOutlierSeries({
      bins: [bin(t0, 5)],
      metric: "cost",
      fromMs: t0 + 30_000, // mid-bucket start
      toMs: t0 + 90_000,
      stepSeconds: step,
    });

    // First grid bucket is the epoch-aligned one containing `from`.
    expect(dense[0].bucketStartMs).toBe(t0);
    expect(dense[0].value).toBe(5);
  });
});
