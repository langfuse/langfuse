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
      metricField: "sum_cost",
      aggregation: "sum",
      dimensionField: "model",
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
});
