// @vitest-environment node

import {
  mergeScoreOutlierRows,
  prepareScoreOutlierSeries,
  prepareScoreOutlierYTicks,
  resolveScoreOutlierAggregation,
  rowsToScoreOutlierBins,
  scoreOutlierCountQueryMetrics,
  scoreOutlierValueQueryMetrics,
} from "@/src/features/scores-chart-view/fns/binning/scoreOutlierBinning";
import { type ScoreOutlierBin } from "@/src/features/scores-chart-view/types";

describe("scoreOutlierCountQueryMetrics", () => {
  it("derives one query metric per registered Count aggregation", () => {
    const metrics = scoreOutlierCountQueryMetrics();
    expect(metrics).toEqual([{ measure: "count", aggregation: "count" }]);
  });
});

describe("scoreOutlierValueQueryMetrics", () => {
  it("derives one query metric per registered Value aggregation", () => {
    const metrics = scoreOutlierValueQueryMetrics();
    expect(metrics).toContainEqual({ measure: "value", aggregation: "avg" });
    expect(metrics).toContainEqual({ measure: "value", aggregation: "min" });
    expect(metrics).toContainEqual({ measure: "value", aggregation: "max" });
    expect(metrics).toHaveLength(3);
  });
});

describe("mergeScoreOutlierRows", () => {
  it("layers value columns from the value rows onto the count rows' true totals, without summing counts", () => {
    expect(
      mergeScoreOutlierRows(
        [{ time_dimension: "2026-06-25T10:00:00Z", count_count: 5 }],
        [
          {
            time_dimension: "2026-06-25T10:00:00Z",
            avg_value: 0.5,
            min_value: 0.1,
            max_value: 0.9,
          },
        ],
      ),
    ).toEqual([
      {
        time_dimension: "2026-06-25T10:00:00Z",
        count_count: 5,
        avg_value: 0.5,
        min_value: 0.1,
        max_value: 0.9,
      },
    ]);
  });

  it("keeps a count-only bucket when the value query has no matching row (e.g. all-categorical bucket)", () => {
    expect(
      mergeScoreOutlierRows(
        [{ time_dimension: "2026-06-25T10:00:00Z", count_count: 3 }],
        [],
      ),
    ).toEqual([{ time_dimension: "2026-06-25T10:00:00Z", count_count: 3 }]);
  });

  it("drops a value-only row with no matching count bucket rather than fabricating a count", () => {
    expect(
      mergeScoreOutlierRows(
        [],
        [{ time_dimension: "2026-06-25T10:00:00Z", avg_value: 0.5 }],
      ),
    ).toEqual([]);
  });
});

describe("resolveScoreOutlierAggregation", () => {
  it("resolves a known aggregation", () => {
    expect(resolveScoreOutlierAggregation("value", "max").key).toBe("max");
  });

  it("falls back to the metric's default when unknown or absent", () => {
    expect(resolveScoreOutlierAggregation("value", "bogus").key).toBe("avg");
    expect(resolveScoreOutlierAggregation("value", undefined).key).toBe("avg");
    expect(resolveScoreOutlierAggregation("count", undefined).key).toBe(
      "count",
    );
  });
});

describe("rowsToScoreOutlierBins", () => {
  it("maps a row with data into a bin, values keyed by result column", () => {
    const [bin] = rowsToScoreOutlierBins([
      {
        time_dimension: "2026-06-25T10:00:00Z",
        count_count: 5,
        avg_value: 0.72,
        min_value: 0.1,
        max_value: 0.9,
      },
    ]);
    expect(bin.count).toBe(5);
    expect(bin.bucketStart.toISOString()).toBe("2026-06-25T10:00:00.000Z");
    expect(bin.values).toMatchObject({
      count_count: 5,
      avg_value: 0.72,
      min_value: 0.1,
      max_value: 0.9,
    });
  });

  it("drops a WITH FILL row (count 0) rather than mapping a phantom bucket", () => {
    expect(
      rowsToScoreOutlierBins([
        { time_dimension: "2026-06-25T10:00:00Z", count_count: 0 },
      ]),
    ).toEqual([]);
  });

  it("drops a row with no parseable time dimension", () => {
    expect(
      rowsToScoreOutlierBins([{ time_dimension: undefined, count_count: 5 }]),
    ).toEqual([]);
  });

  it("maps a missing measure column to null", () => {
    const [bin] = rowsToScoreOutlierBins([
      { time_dimension: "2026-06-25T10:00:00Z", count_count: 3 },
    ]);
    expect(bin.values.avg_value).toBeNull();
  });
});

describe("prepareScoreOutlierSeries", () => {
  const FROM = new Date("2026-06-25T10:00:00Z").getTime();
  const TO = new Date("2026-06-25T10:03:00Z").getTime(); // 3 minute buckets

  const bin = (
    isoTime: string,
    values: Record<string, number | null>,
  ): ScoreOutlierBin => ({
    bucketStart: new Date(isoTime),
    count: 1,
    values,
  });

  it("densifies the grid, filling gaps with null", () => {
    const { dense, maxValue } = prepareScoreOutlierSeries({
      bins: [
        bin("2026-06-25T10:00:00Z", { count_count: 4 }),
        bin("2026-06-25T10:02:00Z", { count_count: 6 }),
      ],
      metric: "count",
      fromMs: FROM,
      toMs: TO,
      stepSeconds: 60,
    });
    expect(dense).toHaveLength(3);
    expect(dense[0].value).toBe(4);
    expect(dense[1].value).toBeNull(); // no bin at 10:01
    expect(dense[2].value).toBe(6);
    expect(maxValue).toBe(6);
  });

  it("extracts the requested aggregation for the value metric", () => {
    const { dense } = prepareScoreOutlierSeries({
      bins: [bin("2026-06-25T10:00:00Z", { avg_value: 0.5, max_value: 0.9 })],
      metric: "value",
      aggregation: "max",
      fromMs: FROM,
      toMs: FROM + 60_000,
      stepSeconds: 60,
    });
    expect(dense[0].value).toBe(0.9);
  });

  it("falls back to the metric's default aggregation for an unknown option", () => {
    const { dense } = prepareScoreOutlierSeries({
      bins: [bin("2026-06-25T10:00:00Z", { avg_value: 0.5 })],
      metric: "value",
      aggregation: "bogus",
      fromMs: FROM,
      toMs: FROM + 60_000,
      stepSeconds: 60,
    });
    expect(dense[0].value).toBe(0.5);
  });

  it("returns no ticks without a width", () => {
    const { ticks } = prepareScoreOutlierSeries({
      bins: [],
      metric: "count",
      fromMs: FROM,
      toMs: TO,
      stepSeconds: 60,
    });
    expect(ticks).toEqual([]);
  });

  it("caps the max value at 0 for an all-empty range", () => {
    const { maxValue } = prepareScoreOutlierSeries({
      bins: [],
      metric: "count",
      fromMs: FROM,
      toMs: TO,
      stepSeconds: 60,
    });
    expect(maxValue).toBe(0);
  });
});

describe("prepareScoreOutlierYTicks", () => {
  it("returns no ticks for a non-positive or non-finite max", () => {
    expect(
      prepareScoreOutlierYTicks({
        maxValue: 0,
        metric: "count",
        plotHeightPx: 50,
        scale: "sqrt",
      }),
    ).toEqual([]);
    expect(
      prepareScoreOutlierYTicks({
        maxValue: Number.POSITIVE_INFINITY,
        metric: "count",
        plotHeightPx: 50,
        scale: "sqrt",
      }),
    ).toEqual([]);
  });

  it("places nice descending values below the max", () => {
    const ticks = prepareScoreOutlierYTicks({
      maxValue: 42,
      metric: "count",
      plotHeightPx: 100,
      scale: "linear",
    });
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.value).toBeLessThanOrEqual(42);
    }
    // Strictly descending.
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].value).toBeLessThan(ticks[i - 1].value);
    }
  });

  it("caps at 3 ticks", () => {
    const ticks = prepareScoreOutlierYTicks({
      maxValue: 1_000_000,
      metric: "count",
      plotHeightPx: 500,
      scale: "linear",
    });
    expect(ticks.length).toBeLessThanOrEqual(3);
  });
});
