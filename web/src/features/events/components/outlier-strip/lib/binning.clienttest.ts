import { describe, it, expect } from "vitest";
import {
  OUTLIER_STRIP_METRICS,
  outlierStripQueryMetrics,
  outlierStripResultColumn,
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

describe("metric registry", () => {
  it("derives the query metrics from every registered aggregation", () => {
    const metrics = outlierStripQueryMetrics();
    expect(metrics).toContainEqual({ measure: "count", aggregation: "count" });
    // Every registry option maps to exactly one query metric — a new
    // aggregation option cannot exist without being fetched.
    for (const def of Object.values(OUTLIER_STRIP_METRICS)) {
      for (const agg of def.aggregations) {
        expect(metrics).toContainEqual({
          measure: def.measure,
          aggregation: agg.queryAggregation,
        });
      }
    }
    // count + 1 cost + 2 latency
    expect(metrics).toHaveLength(4);
  });
});

describe("rowsToOutlierBins", () => {
  it("drops WITH FILL rows so non-nullable zero-fills never become phantom bars", () => {
    const bins = rowsToOutlierBins([
      {
        time_dimension: "2025-03-10 10:00:00",
        count_count: "2",
        sum_totalCost: "2.5",
        p95_latency: "1000",
        avg_latency: "800",
      },
      // ClickHouse WITH FILL filler: count 0, nullable measures null, and the
      // non-nullable count fills with its type default 0.
      {
        time_dimension: "2025-03-10 10:01:00",
        count_count: "0",
        sum_totalCost: null,
        p95_latency: null,
      },
    ]);

    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(2);
    expect(bins[0].values).toEqual({
      sum_totalCost: 2.5,
      p95_latency: 1000,
      avg_latency: 800,
    });
  });
});

describe("prepareOutlierSeries", () => {
  // Raw query units (latency in ms); derived values scale off `value`.
  const bin = (
    bucketStartMs: number,
    value: number | null,
  ): OutlierStripBin => ({
    bucketStart: new Date(bucketStartMs),
    count: value === null ? 0 : 1,
    values: {
      sum_totalCost: value,
      p95_latency: value === null ? null : value * 500,
      avg_latency: value === null ? null : value * 250,
    },
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

  it("selects the aggregation's result column via the registry", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const run = (metric: "cost" | "latency", aggregation: string) =>
      prepareOutlierSeries({
        bins: [bin(t0, 8)],
        metric,
        aggregation,
        fromMs: t0,
        toMs: t0 + 60_000,
        stepSeconds: step,
      }).dense[0].value;

    expect(run("latency", "p95")).toBe(4); // 4000ms → 4s
    expect(run("latency", "avg")).toBe(2); // 2000ms → 2s
    expect(run("cost", "sum")).toBe(8);
    // Unknown/legacy options fall back to the metric's default (first
    // registry entry) — a stored legacy value can never plot the wrong column.
    expect(run("cost", "median")).toBe(8);
    expect(run("latency", "max")).toBe(4); // legacy "max" → default p95
  });

  it("places phase-aware ticks with presentation-ready labels", () => {
    const step = 86400;
    const utcMidnight = Date.UTC(2025, 2, 10);
    const offset = 2 * 3600 * 1000; // +02:00 server: phase-shifted buckets
    const bins = Array.from({ length: 30 }, (_, i) =>
      bin(utcMidnight - offset + i * 86400_000, 1 + i),
    );
    const { dense, ticks } = prepareOutlierSeries({
      bins,
      metric: "cost",
      fromMs: utcMidnight,
      toMs: utcMidnight + 30 * 86400_000,
      stepSeconds: step,
      widthPx: 600, // 20px slots → ticks every ≥110px
    });

    expect(dense.length).toBeGreaterThan(0);
    // The old epoch-modulo predicate produced ZERO ticks on shifted grids.
    expect(ticks.length).toBeGreaterThan(1);
    for (const tick of ticks) {
      expect(tick.index).toBeGreaterThan(0);
      expect(tick.index).toBeLessThan(dense.length);
      expect(tick.label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/); // "MMM d"
    }
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

describe("outlierStripResultColumn", () => {
  it("matches executeQuery's `${aggregation}_${measure}` naming", () => {
    expect(outlierStripResultColumn("totalCost", "sum")).toBe("sum_totalCost");
    expect(outlierStripResultColumn("latency", "p95")).toBe("p95_latency");
  });
});
