// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { prepareFormulaChart } from "@/src/features/widgets/lib/widgetFormula";

const count = { measure: "count", agg: "count" };
const operandFormatter = formatMetric;

describe("prepareFormulaChart", () => {
  it("divides per time bucket without inventing a value where B is zero", () => {
    const chart = prepareFormulaChart({
      chartType: "LINE_TIME_SERIES",
      operator: "divide",
      aMetric: count,
      bMetric: count,
      aRows: [
        { time_dimension: "2026-07-03T00:00:00.000Z", count_count: 0 },
        { time_dimension: "2026-07-01T00:00:00.000Z", count_count: "5" },
      ],
      bRows: [
        { time_dimension: "2026-07-01 00:00:00", count_count: 100 },
        { time_dimension: "2026-07-02 00:00:00", count_count: 50 },
        { time_dimension: "2026-07-03 00:00:00", count_count: 0 },
      ],
      dimensionField: undefined,
      seriesLabel: "Error rate",
      operandFormatter,
    });

    expect(chart.missingValue).toBe("gap");
    expect(chart.data).toEqual([
      {
        time_dimension: "2026-07-01T00:00:00.000Z",
        dimension: "Error rate",
        metric: 0.05,
      },
      // No A row: zero errors out of 50 is a real 0%.
      {
        time_dimension: "2026-07-02 00:00:00",
        dimension: "Error rate",
        metric: 0,
      },
      {
        time_dimension: "2026-07-03T00:00:00.000Z",
        dimension: "Error rate",
        metric: null,
      },
    ]);

    const tile = (a: number, b: number) =>
      prepareFormulaChart({
        chartType: "NUMBER",
        operator: "divide",
        aMetric: count,
        bMetric: count,
        aRows: [{ count_count: a }],
        bRows: [{ count_count: b }],
        dimensionField: undefined,
        seriesLabel: "Acceptance rate",
        operandFormatter,
      });
    const accepted = tile(12, 40);
    expect(accepted.data).toEqual([
      {
        time_dimension: undefined,
        dimension: "Acceptance rate",
        metric: 0.3,
      },
    ]);
    expect(
      toFullMetricString(accepted.metricFormatter(0.3, { style: "compact" })),
    ).toBe("12 of 40 · 30%");
    expect(tile(0, 0).data[0]?.metric).toBeNull();
  });

  it("joins breakdown values across buckets that one side has no row for", () => {
    const additive = prepareFormulaChart({
      chartType: "BAR_TIME_SERIES",
      operator: "subtract",
      aMetric: count,
      bMetric: count,
      aRows: [
        {
          time_dimension: "2026-07-01",
          providedModelName: "gpt",
          count_count: 10,
        },
        // A gap-filled empty bucket: it only holds the bucket on the axis.
        { time_dimension: "2026-07-02", providedModelName: "", count_count: 0 },
      ],
      bRows: [
        {
          time_dimension: "2026-07-01",
          providedModelName: "gpt",
          count_count: 4,
        },
        {
          time_dimension: "2026-07-01",
          providedModelName: "claude",
          count_count: 3,
        },
        {
          time_dimension: "2026-07-03",
          providedModelName: "claude",
          count_count: 5,
        },
      ],
      dimensionField: "providedModelName",
      seriesLabel: "Successful",
      operandFormatter,
    });

    expect(additive.missingValue).toBe("zero");
    expect(additive.data).toEqual([
      { time_dimension: "2026-07-01", dimension: "gpt", metric: 6 },
      { time_dimension: "2026-07-01", dimension: "claude", metric: -3 },
      { time_dimension: "2026-07-02", dimension: undefined, metric: null },
      { time_dimension: "2026-07-03", dimension: "claude", metric: -5 },
    ]);

    const percentiles = prepareFormulaChart({
      chartType: "LINE_TIME_SERIES",
      operator: "subtract",
      aMetric: { measure: "latency", agg: "p95" },
      bMetric: { measure: "latency", agg: "p50" },
      aRows: [
        {
          time_dimension: "2026-07-01",
          providedModelName: "gpt",
          p95_latency: 900,
        },
        {
          time_dimension: "2026-07-01",
          providedModelName: "claude",
          p95_latency: 700,
        },
      ],
      bRows: [
        {
          time_dimension: "2026-07-01",
          providedModelName: "gpt",
          p50_latency: 400,
        },
      ],
      dimensionField: "providedModelName",
      seriesLabel: "Spread",
      operandFormatter,
    });

    expect(percentiles.missingValue).toBe("gap");
    expect(percentiles.data).toEqual([
      { time_dimension: "2026-07-01", dimension: "gpt", metric: 500 },
      { time_dimension: "2026-07-01", dimension: "claude", metric: null },
    ]);
  });
});
