import { describe, expect, it } from "vitest";

import { getDimensionAggregateValue } from "./dataModel";

const costByTypeSum = {
  view: "observations",
  version: "v2",
  dimension: "costType",
  measure: "costByType",
  aggregation: "sum",
} as const;

describe("getDimensionAggregateValue", () => {
  it("names the aggregate of a cost breakdown summed over its paired value", () => {
    expect(getDimensionAggregateValue(costByTypeSum)).toBe("total");
    expect(
      getDimensionAggregateValue({
        ...costByTypeSum,
        dimension: "usageType",
        measure: "usageByType",
      }),
    ).toBe("total");
  });

  it("reports none for a measure the dimension is not expanded alongside", () => {
    // The ARRAY JOIN emits one row per cost key whatever the measure, so a count
    // broken down by Cost Type reports how many observations carry each key.
    // Its "total" is a peer category, not the sum of the others.
    for (const measure of ["count", "totalCost", "latency"]) {
      expect(getDimensionAggregateValue({ ...costByTypeSum, measure })).toBe(
        undefined,
      );
    }
  });

  it("reports none for an aggregation that does not add the members up", () => {
    for (const aggregation of ["max", "min", "p95", "avg", "count", "uniq"]) {
      expect(
        getDimensionAggregateValue({ ...costByTypeSum, aggregation }),
      ).toBe(undefined);
    }
  });

  it("reports none for a dimension that declares no aggregate", () => {
    expect(
      getDimensionAggregateValue({
        ...costByTypeSum,
        dimension: "providedModelName",
      }),
    ).toBe(undefined);
  });

  it("reports none when there is no breakdown, view or measure to go on", () => {
    expect(
      getDimensionAggregateValue({ ...costByTypeSum, dimension: undefined }),
    ).toBe(undefined);
    expect(
      getDimensionAggregateValue({ ...costByTypeSum, measure: undefined }),
    ).toBe(undefined);
    expect(
      getDimensionAggregateValue({ ...costByTypeSum, view: "traces" }),
    ).toBe(undefined);
    // costType exists only on the events-backed v2 declaration.
    expect(
      getDimensionAggregateValue({ ...costByTypeSum, version: "v1" }),
    ).toBe(undefined);
  });
});
