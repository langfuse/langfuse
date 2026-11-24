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
      metrics: [{ measure: "cost", agg: "sum" }],
      dimensions: [{ field: "model" }],
    });

    expect(summary).toMatchObject({
      buckets: { count: 30, first: "2026-10-01", last: "2026-10-30" },
      total: 30 + 29 * 2 + 50,
      peakBucket: { time: "2026-10-22", value: 51 },
      series: [
        { name: "b", total: 29 * 2 + 50 },
        { name: "a", total: 30 },
        { name: "n/a", total: 0 },
      ],
    });
  });

  it("gives no total when the rows hit the limit or repeat source rows", () => {
    const breakdown = (params: {
      rowLimit?: number;
      dimensionRepeatsRows?: boolean;
    }) =>
      summarizeWidget({
        rows: [
          { tags: "a", count_count: 3 },
          { tags: "b", count_count: 2 },
        ],
        chartType: "HORIZONTAL_BAR",
        metrics: [{ measure: "count", agg: "count" }],
        dimensions: [{ field: "tags" }],
        ...params,
      });

    expect(breakdown({ rowLimit: 10 })).toMatchObject({ total: 5 });
    expect(breakdown({ rowLimit: 2 })).not.toHaveProperty("total");
    expect(breakdown({ rowLimit: 2 })).toMatchObject({ rowsLimited: true });
    expect(breakdown({ dimensionRepeatsRows: true })).not.toHaveProperty(
      "total",
    );
  });

  it("keeps histogram bins and every pivot column", () => {
    expect(
      summarizeWidget({
        rows: [
          {
            count_count: [
              [0, 1, 5],
              [1, 2, 3],
            ],
          },
        ],
        chartType: "HISTOGRAM",
        metrics: [{ measure: "count", agg: "count" }],
        dimensions: [],
      }),
    ).toEqual({
      bins: [
        { from: 0, to: 1, count: 5 },
        { from: 1, to: 2, count: 3 },
      ],
    });
    expect(
      summarizeWidget({
        rows: [
          { model: "a", environment: "prod", count_count: 2, sum_cost: 1.5 },
        ],
        chartType: "PIVOT_TABLE",
        metrics: [
          { measure: "count", agg: "count" },
          { measure: "cost", agg: "sum" },
        ],
        dimensions: [{ field: "model" }, { field: "environment" }],
      }),
    ).toEqual({
      rows: [
        { model: "a", environment: "prod", count_count: 2, sum_cost: 1.5 },
      ],
    });
  });
});
