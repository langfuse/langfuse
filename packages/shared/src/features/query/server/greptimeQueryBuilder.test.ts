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

  it("joins relation tables required only by filters", () => {
    const { query } = build({
      view: "observations",
      filters: [
        {
          column: "userId",
          type: "string",
          operator: "=",
          value: "user-1",
        },
      ],
      metrics: [{ measure: "count", aggregation: "count" }],
    });

    expect(query).toMatch(/INNER JOIN .*traces.* AS t/);
    expect(query).toMatch(/t\.`user_id`/);
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

  it("projects entityDimension as entity_dimension", () => {
    const { query } = build({
      view: "observations",
      entityDimension: { field: "name" },
      filters: [
        {
          column: "name",
          type: "string",
          operator: "=",
          value: "generation-a",
        },
      ],
      metrics: [{ measure: "count", aggregation: "count" }],
    });

    expect(query).toMatch(/o\.name AS `entity_dimension`/);
    expect(query).toMatch(/GROUP BY o\.name/);
  });

  it("score segment + scores view builds with data_type filter", () => {
    const { query } = build({
      view: "scores-numeric",
      metrics: [{ measure: "value", aggregation: "avg" }],
    });
    expect(query).toMatch(/data_type/);
    expect(query).toMatch(/avg\(s\.value\)/);
  });

  it("honors public metrics config.row_limit", () => {
    const { query } = build({
      view: "observations",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      config: { row_limit: 7 },
    } as unknown as Partial<QueryType> & Pick<QueryType, "view">);

    expect(query).toMatch(/LIMIT 7\b/);
  });

  it("auto-includes the by-type dimension when costByType is requested alone", () => {
    const { query, postProcess } = build({
      view: "observations",
      metrics: [{ measure: "costByType", aggregation: "sum" }],
    });
    expect(query).toMatch(/json_to_string/);
    expect(postProcess.byType?.keyDimensionAlias).toBe("costType");
  });

  it("rejects non-sum aggregation for a by-type measure", () => {
    expect(() =>
      build({
        view: "observations",
        dimensions: [{ field: "costType" }],
        metrics: [{ measure: "costByType", aggregation: "avg" }],
      }),
    ).toThrow(/only 'sum'/i);
  });

  it("counts unique users via count(distinct) without nesting, rejects sum", () => {
    const { query } = build({
      view: "traces",
      metrics: [{ measure: "uniqueUserIds", aggregation: "uniq" }],
    });
    expect(query).toMatch(/count\(distinct t\.user_id\)/);
    expect(query).not.toMatch(/count\(distinct count\(distinct/);

    expect(() =>
      build({
        view: "traces",
        metrics: [{ measure: "uniqueUserIds", aggregation: "sum" }],
      }),
    ).toThrow(/not valid for measure/i);
  });

  it("normalizes a bare measure name in orderBy to its aggregated alias", () => {
    const { query } = build({
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      orderBy: [{ field: "totalCost", direction: "desc" }],
    });
    expect(query).toMatch(/ORDER BY `sum_totalCost` DESC/);
  });
});
