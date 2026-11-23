import { describe, expect, it } from "vitest";
import { summarizeWidget } from "@/src/features/mcp/server/apps/tools/widgetSummary";

describe("summarizeWidget", () => {
  it("summarizes every bucket and series of a daily breakdown", () => {
    const days = Array.from(
      { length: 30 },
      (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
    );
    const rows = days.flatMap((day, i) => [
      { time_dimension: day, model: "a", sum_cost: 1 },
      { time_dimension: day, model: "b", sum_cost: i === 21 ? 50 : 2 },
      { time_dimension: day, model: null, sum_cost: 0 },
    ]);

    const summary = summarizeWidget({
      rows,
      chartType: "LINE_TIME_SERIES",
      metricField: "sum_cost",
      metricFields: ["sum_cost"],
      aggregation: "sum",
      dimensionField: "model",
      dimensionFields: ["model"],
      isTimeSeries: true,
    });

    expect(summary).toMatchObject({
      buckets: { count: 30, first: "2026-10-01", last: "2026-10-30" },
      total: 30 + 29 * 2 + 50,
      peakBucket: { time: "2026-10-22", value: 51 },
      series: [
        { name: "b", total: 29 * 2 + 50 },
        { name: "a", total: 30 },
        { name: "(none)", total: 0 },
      ],
    });
  });

  it("keeps histogram bins and every pivot column", () => {
    const base = {
      metricField: "count_count",
      aggregation: "count",
      dimensionField: "model",
      isTimeSeries: false,
    };
    expect(
      summarizeWidget({
        ...base,
        rows: [
          {
            count_count: [
              [0, 1, 5],
              [1, 2, 3],
            ],
          },
        ],
        chartType: "HISTOGRAM",
        metricFields: ["count_count"],
        dimensionFields: [],
      }),
    ).toEqual({
      bins: [
        { from: 0, to: 1, count: 5 },
        { from: 1, to: 2, count: 3 },
      ],
    });
    expect(
      summarizeWidget({
        ...base,
        rows: [
          { model: "a", environment: "prod", count_count: 2, sum_cost: 1.5 },
        ],
        chartType: "PIVOT_TABLE",
        metricFields: ["count_count", "sum_cost"],
        dimensionFields: ["model", "environment"],
      }),
    ).toEqual({
      rows: [
        { model: "a", environment: "prod", count_count: 2, sum_cost: 1.5 },
      ],
    });
  });
});
