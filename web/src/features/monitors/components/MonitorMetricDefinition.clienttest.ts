import { describe, expect, it } from "vitest";

import { __test } from "./MonitorMetricDefinition";

const { getMeasuresByAggregation } = __test;

describe("getMeasuresByAggregation", () => {
  it("offers count first, with the row count as its first measure", () => {
    const byAggregation = getMeasuresByAggregation("observations");

    expect([...byAggregation.keys()][0]).toBe("count");
    expect(byAggregation.get("count")?.[0]).toBe("count");
  });

  it("only pairs numeric measures with numeric aggregations", () => {
    const sumMeasures = getMeasuresByAggregation("observations").get("sum");

    expect(sumMeasures).toContain("latency");
    expect(sumMeasures).not.toContain("traceId");
  });

  it("keeps the row count to the count aggregation in every view", () => {
    const byAggregation = getMeasuresByAggregation("scores-numeric");

    expect(byAggregation.get("count")).toEqual(["count", "value"]);
    expect(byAggregation.get("sum")).toEqual(["value"]);
  });
});
