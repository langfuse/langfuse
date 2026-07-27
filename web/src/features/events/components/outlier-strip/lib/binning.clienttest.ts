import { describe, it, expect } from "vitest";
import {
  pickChartGranularity,
  prepareOutlierSeries,
  rowsToOutlierBins,
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

describe("rowsToOutlierBins", () => {
  it("drops WITH FILL rows so non-nullable zero-fills never become phantom bars", () => {
    const bins = rowsToOutlierBins([
      {
        time_dimension: "2025-03-10 10:00:00",
        count_count: "2",
        max_totalCost: "0.5",
        sum_totalCost: "2.5",
        max_latency: "1500",
        p95_latency: "1000",
        avg_latency: "800",
        max_totalTokens: "300",
      },
      // ClickHouse WITH FILL filler: count 0, nullable measures null, but the
      // non-nullable tokens measure fills with its type default 0.
      {
        time_dimension: "2025-03-10 10:01:00",
        count_count: "0",
        max_totalCost: null,
        max_latency: null,
        max_totalTokens: "0",
      },
    ]);

    expect(bins).toHaveLength(1);
    expect(bins[0]).toEqual({
      bucketStart: expect.any(Date),
      count: 2,
      maxTotalCost: 0.5,
      sumTotalCost: 2.5,
      maxLatencySeconds: 1.5, // ms → s
      p95LatencySeconds: 1,
      avgLatencySeconds: 0.8,
      maxTotalTokens: 300,
    });
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
    sumTotalCost: value === null ? null : value * 10,
    maxLatencySeconds: value,
    p95LatencySeconds: value === null ? null : value * 0.5,
    avgLatencySeconds: value === null ? null : value * 0.25,
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

  it("snaps the grid phase to the server's buckets (non-UTC ClickHouse)", () => {
    const step = 86400; // 1d buckets aligned to a +02:00 server timezone
    const utcMidnight = Date.UTC(2025, 2, 10);
    const offset = 2 * 3600 * 1000;
    const serverBucket = utcMidnight - offset;
    const { dense } = prepareOutlierSeries({
      bins: [bin(serverBucket, 4)],
      metric: "cost",
      fromMs: utcMidnight,
      toMs: utcMidnight + 86400_000,
      stepSeconds: step,
    });

    // A phase-0 UTC grid would miss the bucket entirely and blank the chart.
    expect(dense.some((d) => d.value === 4)).toBe(true);
    expect(
      dense.every(
        (d) => d.bucketStartMs % 86400_000 === serverBucket % 86400_000,
      ),
    ).toBe(true);
  });

  it("excludes a zero-width trailing bucket when `to` sits on a boundary", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const { dense } = prepareOutlierSeries({
      bins: [bin(t0, 1)],
      metric: "cost",
      fromMs: t0,
      toMs: t0 + 120_000, // exactly two buckets
      stepSeconds: step,
    });

    expect(dense).toHaveLength(2);
  });

  it("plots the p95 latency series when latencyAgg is p95", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const { dense } = prepareOutlierSeries({
      bins: [bin(t0, 8)], // helper sets p95 = 0.5 × max
      metric: "latency",
      latencyAgg: "p95",
      fromMs: t0,
      toMs: t0 + 60_000,
      stepSeconds: step,
    });

    expect(dense[0].value).toBe(4);

    const avg = prepareOutlierSeries({
      bins: [bin(t0, 8)], // helper sets avg = 0.25 × max
      metric: "latency",
      latencyAgg: "avg",
      fromMs: t0,
      toMs: t0 + 60_000,
      stepSeconds: step,
    });
    expect(avg.dense[0].value).toBe(2);

    const total = prepareOutlierSeries({
      bins: [bin(t0, 8)], // helper sets sum = 10 × max
      metric: "cost",
      costAgg: "total",
      fromMs: t0,
      toMs: t0 + 60_000,
      stepSeconds: step,
    });
    expect(total.dense[0].value).toBe(80);
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
