import { describe, it, expect } from "vitest";
import {
  canReuseOutlierPlaceholder,
  formatCompoundDuration,
  OUTLIER_STRIP_METRICS,
  outlierStripQueryMetrics,
  outlierStripResultColumn,
  pickChartGranularity,
  prepareOutlierSeries,
  prepareOutlierYTicks,
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
        p50_latency: "800",
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
      p50_latency: 800,
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
      p50_latency: value === null ? null : value * 250,
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
    expect(run("latency", "p50")).toBe(2); // 2000ms → 2s
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

describe("prepareOutlierYTicks", () => {
  it("returns no ticks when the range has no data", () => {
    expect(
      prepareOutlierYTicks({
        maxValue: 0,
        metric: "cost",
        plotHeightPx: 49,
        scale: "sqrt",
      }),
    ).toEqual([]);
  });

  it("walks nice values top-down and drops sqrt-compressed ones", () => {
    // max 7.3s on a 49px sqrt plot: 5 → 40.5px, 2 → 25.7px (gap 14.9, fits);
    // 1 → 18.1px and 0.5 → 12.8px are within 14px of the last tick (skipped);
    // 0.2 → 8.1px is inside the 10px baseline guard (walk ends).
    const ticks = prepareOutlierYTicks({
      maxValue: 7.3,
      metric: "latency",
      plotHeightPx: 49,
      scale: "sqrt",
    });
    expect(ticks.map((t) => t.value)).toEqual([5, 2]);
  });

  it("maps offsets through the same scale as the bars", () => {
    const [top] = prepareOutlierYTicks({
      maxValue: 7.3,
      metric: "latency",
      plotHeightPx: 49,
      scale: "sqrt",
    });
    expect(top.offsetPx).toBeCloseTo(Math.sqrt(5 / 7.3) * 49, 6);
  });

  it("keeps a tick exactly at the max when the max is a nice value", () => {
    // Cost has no ladder → plain 1-2-5. Linear 49px plot, max 100:
    // 100 → 49px, 50 → 24.5px, 20 → 9.8px is inside the baseline guard.
    const ticks = prepareOutlierYTicks({
      maxValue: 100,
      metric: "cost",
      plotHeightPx: 49,
      scale: "linear",
    });
    expect(ticks.map((t) => t.value)).toEqual([100, 50]);
    expect(ticks[0].offsetPx).toBeCloseTo(49, 6);
  });

  it("ticks latency on time-native ladder steps, labeled compound", () => {
    // Duration ladder, not 1-2-5: max 100s picks 60 ("1m") and 30 ("30s"),
    // never 100/50. Linear 49px: 60 → 29.4px, 30 → 14.7px (gap 14.7, fits),
    // 15 → 7.35px is inside the baseline guard.
    const ticks = prepareOutlierYTicks({
      maxValue: 100,
      metric: "latency",
      plotHeightPx: 49,
      scale: "linear",
    });
    expect(ticks.map((t) => t.value)).toEqual([60, 30]);
    expect(ticks.map((t) => t.label)).toEqual(["1m", "30s"]);
  });

  it("caps the tick count", () => {
    // Sqrt spreads the ladder's 900/300/60 far enough apart for three labels.
    const ticks = prepareOutlierYTicks({
      maxValue: 1000,
      metric: "latency",
      plotHeightPx: 49,
      scale: "sqrt",
    });
    expect(ticks.map((t) => t.value)).toEqual([900, 300, 60]);
    expect(ticks.map((t) => t.label)).toEqual(["15m", "5m", "1m"]);
  });

  it("falls through to 1-2-5 decades below the ladder floor", () => {
    // All-sub-second latencies: the 1s ladder floor yields nothing, so the
    // walk continues on 1-2-5. Max 0.4s sqrt: 0.2 → 34.6px, 0.1 → 24.5px
    // (gap 10.2, skipped), 0.05 → 17.3px (gap 17.3, fits).
    const ticks = prepareOutlierYTicks({
      maxValue: 0.4,
      metric: "latency",
      plotHeightPx: 49,
      scale: "sqrt",
    });
    expect(ticks.map((t) => t.value)).toEqual([0.2, 0.05]);
    expect(ticks.map((t) => t.label)).toEqual(["200ms", "50ms"]);
  });

  it("labels cost ticks without trailing zeros", () => {
    const ticks = prepareOutlierYTicks({
      maxValue: 0.8,
      metric: "cost",
      plotHeightPx: 49,
      scale: "sqrt",
    });
    expect(ticks.map((t) => t.value)).toEqual([0.5, 0.2]);
    expect(ticks.map((t) => t.label)).toEqual(["$0.5", "$0.2"]);
  });

  it("labels whole-dollar cost ticks bare", () => {
    // Max $23 sqrt 49px: $20 → 45.7px, $10 → 32.3px (gap 13.4, skipped),
    // $5 → 22.9px (gap 22.8, fits), $2 → 14.5px (gap 8.4, skipped),
    // $1 → 10.2px (gap 12.7, skipped), $0.5 → 7.2px ends the walk.
    const ticks = prepareOutlierYTicks({
      maxValue: 23,
      metric: "cost",
      plotHeightPx: 49,
      scale: "sqrt",
    });
    expect(ticks.map((t) => t.label)).toEqual(["$20", "$5"]);
  });

  it("returns nothing on a plot too short for a label", () => {
    expect(
      prepareOutlierYTicks({
        maxValue: 7.3,
        metric: "latency",
        plotHeightPx: 8,
        scale: "sqrt",
      }),
    ).toEqual([]);
  });
});

describe("formatCompoundDuration", () => {
  it("splits minute-plus durations into two units", () => {
    expect(formatCompoundDuration(90_600)).toBe("1m 31s");
    expect(formatCompoundDuration(5_400_000)).toBe("1h 30m");
    expect(formatCompoundDuration(93_600_000)).toBe("1d 2h");
  });

  it("drops a zero sub-unit", () => {
    expect(formatCompoundDuration(120_000)).toBe("2m");
    expect(formatCompoundDuration(3_600_000)).toBe("1h");
  });

  it("carries a sub-unit that rounds up to a full primary", () => {
    // 1m 59.7s must not render "1m 60s".
    expect(formatCompoundDuration(119_700)).toBe("2m");
  });

  it("keeps the shared single-unit format below a minute", () => {
    expect(formatCompoundDuration(30_000)).toBe("30s");
    expect(formatCompoundDuration(450)).toBe("450ms");
  });

  it("is the latency metric's registry format", () => {
    // Plotted unit is seconds.
    expect(OUTLIER_STRIP_METRICS.latency.format(90.6)).toBe("1m 31s");
  });
});

describe("outlierStripResultColumn", () => {
  it("matches executeQuery's `${aggregation}_${measure}` naming", () => {
    expect(outlierStripResultColumn("totalCost", "sum")).toBe("sum_totalCost");
    expect(outlierStripResultColumn("latency", "p95")).toBe("p95_latency");
  });
});

describe("canReuseOutlierPlaceholder (LFE-14575)", () => {
  // The bucket grid is epoch-aligned, so same-granularity bins are
  // positionally correct on ANY window slide — granularity equality is the
  // whole rule. A ratio-based overlap gate regressed short-window +
  // long-interval auto-refresh (30m preset sliding 15m = 50% overlap).
  it("keeps held-over bins across any same-granularity slide, however large", () => {
    expect(
      canReuseOutlierPlaceholder({ granularity: "5m" }, { granularity: "5m" }),
    ).toBe(true);
  });

  it("rejects a granularity change (drill-in / Back / preset hop)", () => {
    expect(
      canReuseOutlierPlaceholder(
        { granularity: "1d" },
        { granularity: "hour" },
      ),
    ).toBe(false);
  });
});
