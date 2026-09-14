import { describe, expect, test } from "vitest";

import {
  calculateGrandTotals,
  calculateSubtotals,
  transformToPivotTable,
} from "@/src/features/widgets/utils/pivot-table-utils";

describe("calculateSubtotals percentile aggregation", () => {
  const rows = [
    { model: "a", p75_latency: 100, p90_latency: 1000, p95_latency: 500 },
    { model: "b", p75_latency: 200, p90_latency: 2000, p95_latency: 700 },
    { model: "c", p75_latency: 300, p90_latency: 3000, p95_latency: 900 },
  ];

  test("p50/p95/p99 subtotals average the percentile values (documented approximation)", () => {
    expect(calculateSubtotals(rows, ["p95_latency"]).p95_latency).toBe(700);
  });

  test("p75 subtotals average the percentile values instead of summing them", () => {
    expect(calculateSubtotals(rows, ["p75_latency"]).p75_latency).toBe(200);
  });

  test("p90 subtotals average the percentile values instead of summing them", () => {
    expect(calculateSubtotals(rows, ["p90_latency"]).p90_latency).toBe(2000);
  });

  test("grand totals treat p75/p90 the same way", () => {
    const totals = calculateGrandTotals(rows, ["p75_latency", "p90_latency"]);
    expect(totals.p75_latency).toBe(200);
    expect(totals.p90_latency).toBe(2000);
  });

  test("transformToPivotTable Total and Subtotal rows average p75 metrics", () => {
    const data = [
      { model: "a", env: "prod", p75_latency: 100 },
      { model: "a", env: "dev", p75_latency: 200 },
      { model: "b", env: "prod", p75_latency: 300 },
      { model: "b", env: "dev", p75_latency: 400 },
    ];
    const out = transformToPivotTable(data, {
      dimensions: ["model", "env"],
      metrics: ["p75_latency"],
    });
    const total = out.find((row) => row.type === "total");
    const subtotalA = out.find(
      (row) => row.type === "subtotal" && row.label.startsWith("a "),
    );
    expect(total?.values.p75_latency).toBe(250);
    expect(subtotalA?.values.p75_latency).toBe(150);
  });
});
