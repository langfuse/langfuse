import { describe, expect, it } from "vitest";
import { GreptimeQueryBuilder } from "./greptimeQueryBuilder";
import { type QueryType } from "../types";

const PROJECT = "p-test";
const base = {
  filters: [],
  fromTimestamp: "2026-06-01T00:00:00.000Z",
  toTimestamp: "2026-06-02T00:00:00.000Z",
  orderBy: null,
} as const;

const build = (q: Partial<QueryType> & Pick<QueryType, "view">) =>
  new GreptimeQueryBuilder().build(
    {
      ...base,
      dimensions: [],
      metrics: [],
      timeDimension: null,
      ...q,
    } as QueryType,
    PROJECT,
  );

describe("GreptimeQueryBuilder", () => {
  it("single-level count over time uses date bucketing + is_deleted + named project_id", () => {
    const { query, parameters, postProcess } = build({
      view: "observations",
      metrics: [{ measure: "count", aggregation: "count" }],
      timeDimension: { granularity: "day" },
    });
    expect(query).toMatch(/AS time_dimension/);
    expect(query).toMatch(/date_trunc/);
    expect(query).toMatch(/is_deleted`? = false/);
    expect(query).toMatch(/count\(\*\)/);
    expect(Object.values(parameters)).toContain(PROJECT);
    expect(postProcess.timeFill?.granularity).toBe("day");
  });

  it("leaf percentile uses uddsketch", () => {
    const { query } = build({
      view: "observations",
      metrics: [{ measure: "latency", aggregation: "p95" }],
    });
    expect(query).toMatch(/uddsketch_calc/);
    expect(query).toMatch(/AS .?p95_latency/);
  });

  it("relation-backed measure emits a two-level query", () => {
    const { query } = build({
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
    });
    // inner aggregates observations per trace, outer sums across traces
    expect(query).toMatch(/sum\(o\.total_cost\)/);
    expect(query).toMatch(/GROUP BY t\.project_id, t\.id/);
    expect(query).toMatch(/FROM \(/); // nested
    expect(query).toMatch(/INNER JOIN .*observations/);
  });

  it("by-type query is a per-entity raw fetch with a byType post-process", () => {
    const { query, postProcess } = build({
      view: "observations",
      dimensions: [{ field: "costType" }],
      metrics: [{ measure: "costByType", aggregation: "sum" }],
      timeDimension: { granularity: "hour" },
    });
    expect(query).toMatch(/json_to_string/);
    expect(query).not.toMatch(/GROUP BY/); // raw fetch, no aggregation
    expect(postProcess.byType?.jsonColumn).toBe("cost_details");
    expect(postProcess.byType?.keyDimensionAlias).toBe("costType");
    expect(postProcess.byType?.valueMetricAlias).toBe("sum_costByType");
  });

  it("throws on deferred experiment dimensions", () => {
    expect(() =>
      build({
        view: "scores-numeric",
        dimensions: [{ field: "experimentName" }],
        metrics: [{ measure: "count", aggregation: "count" }],
      }),
    ).toThrow(/not supported on GreptimeDB/i);
  });

  it("score segment + scores view builds with data_type filter", () => {
    const { query } = build({
      view: "scores-numeric",
      metrics: [{ measure: "value", aggregation: "avg" }],
    });
    expect(query).toMatch(/data_type/);
    expect(query).toMatch(/avg\(s\.value\)/);
  });
});
