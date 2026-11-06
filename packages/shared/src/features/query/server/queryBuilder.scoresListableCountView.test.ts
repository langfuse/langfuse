import { describe, expect, it, vi } from "vitest";

import { LISTABLE_SCORE_TYPES } from "../../../domain/scores";
import { getViewDeclaration } from "../dataModel";
import {
  SCORES_LISTABLE_COUNT_VIEW,
  views,
  viewsV2,
  type QueryType,
} from "../types";
import { QueryBuilder } from "./queryBuilder";
import { shouldSkipScoresDedup } from "../../../server/queries/clickhouse-sql/query-options";
import { buildBillableUnitsQuery } from "./billableUnitsQuery";

// QueryBuilder.build checks the OTEL FINAL optimization before filter lowering.
// Mock it so this stays unit-level and does not need ClickHouse.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
}));

const baseQuery = {
  view: SCORES_LISTABLE_COUNT_VIEW,
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: { granularity: "hour" },
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-02T00:00:00.000Z",
  orderBy: null,
} as unknown as QueryType;

describe("scores-listable-count view (internal-only, powers ScoresOutlierStrip's Count mode)", () => {
  it("is not part of the public views enum", () => {
    expect(views.options).not.toContain(SCORES_LISTABLE_COUNT_VIEW);
    expect(viewsV2.options).not.toContain(SCORES_LISTABLE_COUNT_VIEW);
  });

  it("scopes its segment to every listable score type", () => {
    const view = getViewDeclaration(SCORES_LISTABLE_COUNT_VIEW, "v1");
    expect(view.segments).toEqual([
      {
        column: "data_type",
        operator: "any of",
        value: [...LISTABLE_SCORE_TYPES],
        type: "stringOptions",
      },
    ]);
    // CORRECTION scores are intentionally excluded — they aren't a listable type.
    expect(view.segments[0]?.value).not.toContain("CORRECTION");
  });

  it("exposes only a count measure — no value measure, on purpose", () => {
    const view = getViewDeclaration(SCORES_LISTABLE_COUNT_VIEW, "v1");
    expect(Object.keys(view.measures)).toEqual(["count"]);
  });

  it("compiles a query whose count is unguarded (covers every listable type)", async () => {
    const { query: compiledQuery, parameters } = await new QueryBuilder(
      undefined,
      "v1",
    ).build(baseQuery, "test-project");

    expect(compiledQuery).toMatch(/count\(\(1\)\) as count_count/);
    expect(compiledQuery).not.toContain("countIf");
    expect(compiledQuery).toContain("scores_listable_count.data_type IN");
    // The segment's data_type allow-list is a bound parameter, not inlined SQL.
    const dataTypeParam = Object.values(parameters).find(
      (value) =>
        Array.isArray(value) &&
        LISTABLE_SCORE_TYPES.every((t) => value.includes(t)),
    );
    expect(dataTypeParam).toEqual([...LISTABLE_SCORE_TYPES]);
    expect(dataTypeParam).not.toContain("CORRECTION");
  });
});

describe("scores views for projects that skip scores dedup", () => {
  it.each([
    ["v1", "scores-numeric", "scores_numeric"],
    ["v1", "scores-categorical", "scores_categorical"],
    ["v1", "scores-boolean", "scores_boolean"],
    ["v1", SCORES_LISTABLE_COUNT_VIEW, "scores_listable_count"],
    ["v2", "scores-numeric", "scores_numeric"],
    ["v2", "scores-categorical", "scores_categorical"],
    ["v2", "scores-boolean", "scores_boolean"],
  ] as const)(
    "%s %s reads the scores table without FINAL",
    async (version, view, alias) => {
      vi.mocked(shouldSkipScoresDedup).mockReturnValueOnce(true);

      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        version,
      ).build({ ...baseQuery, view }, "test-project");

      expect(compiledQuery).toContain(`FROM scores ${alias}`);
      expect(compiledQuery).not.toMatch(/\bFINAL\b/);
    },
  );
});

describe("scores views without relation joins", () => {
  // dataModel.ts declares a separate count measure for each of these views.
  it.each([
    "scores-numeric",
    "scores-categorical",
    "scores-boolean",
    SCORES_LISTABLE_COUNT_VIEW,
  ] as const)(
    "%s aggregates per time bucket without a per-id subquery",
    async (view) => {
      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        "v2",
      ).build({ ...baseQuery, view }, "test-project");

      expect(compiledQuery).not.toMatch(/FROM\s*\(/);
      expect(compiledQuery).not.toMatch(/GROUP BY\s+\w+\.project_id/);
      expect(compiledQuery).toContain("GROUP BY time_dimension");
    },
  );

  it.each(["v1", "v2"] as const)(
    "%s scores-numeric aggregates score values directly",
    async (version) => {
      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        version,
      ).build(
        {
          ...baseQuery,
          view: "scores-numeric",
          metrics: [
            { measure: "value", aggregation: "avg" },
            { measure: "value", aggregation: "min" },
            { measure: "value", aggregation: "max" },
          ],
        } as QueryType,
        "test-project",
      );

      expect(compiledQuery).not.toMatch(/FROM\s*\(/);
      expect(compiledQuery).not.toContain("any(");
      expect(compiledQuery).toMatch(/avg\(\(?value\)?\) as avg_value/);
      expect(compiledQuery).toMatch(/min\(\(?value\)?\) as min_value/);
      expect(compiledQuery).toMatch(/max\(\(?value\)?\) as max_value/);
    },
  );

  // A join can match several rows per score (events_core is read without
  // FINAL), so the per-id subquery has to stay to count each score once.
  it.each(["v1", "v2"] as const)(
    "%s keeps the per-id subquery when a dimension joins a trace table",
    async (version) => {
      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        version,
      ).build(
        {
          ...baseQuery,
          view: "scores-numeric",
          dimensions: [{ field: "traceName" }],
        } as QueryType,
        "test-project",
      );

      expect(compiledQuery).toContain("INNER JOIN");
      expect(compiledQuery).toMatch(/FROM\s*\(/);
      expect(compiledQuery).toMatch(/GROUP BY\s+\w+\.project_id, \w+\.id/);
    },
  );
});

describe("billable-units count composition", () => {
  const usageQuery = { ...baseQuery, view: "billable-units" } as QueryType;

  it.each(["v1", "v2"] as const)(
    "combines independent %s counts without truncating a component",
    async (version) => {
      const { query, parameters } = await buildBillableUnitsQuery({
        query: {
          ...usageQuery,
          filters: [
            {
              column: "environment",
              type: "string",
              operator: "=",
              value: "production'--",
            },
          ],
          orderBy: [{ field: "count_count", direction: "desc" }],
        },
        projectId: "project-a",
        version,
        chartConfig: { row_limit: 2 },
        enableSingleLevelOptimization: true,
      });
      expect(query.match(/UNION ALL/g)).toHaveLength(2);
      expect(query).toContain("sum(count_count) AS count_count");
      expect(query).toContain("GROUP BY time_dimension");
      expect(query.trim()).toMatch(/ORDER BY count_count desc\s+LIMIT 2$/);
      expect(query.match(/LIMIT 2/g)).toHaveLength(1);
      expect(query).not.toContain("production'--");
      expect(
        Object.values(parameters).filter((value) => value === "production'--"),
      ).toHaveLength(3);
      expect(Object.values(parameters)).toContainEqual([
        ...LISTABLE_SCORE_TYPES,
      ]);
      for (const match of query.matchAll(/\{(\w+)\s*:/g)) {
        expect(parameters).toHaveProperty(match[1]!);
      }
      expect(
        Object.keys(parameters).every((name) => /^units[012]_/.test(name)),
      ).toBe(true);
      if (version === "v2") {
        expect(query).toContain("events_core");
        expect(query).toContain(
          "GROUP BY events_core.project_id, events_traces.trace_id",
        );
        expect(query).toContain("ifNull(anyIf(toNullable(");
      } else {
        expect(query).toContain("traces FINAL");
      }
    },
  );

  it("returns one ordinary count column for an unbucketed total", async () => {
    const { query } = await buildBillableUnitsQuery({
      query: { ...usageQuery, timeDimension: null },
      projectId: "project-a",
      version: "v2",
    });
    expect(query.trim()).toMatch(/^SELECT sum\(count_count\) AS count_count/);
    expect(query).not.toContain("time_dimension");
  });

  it.each([
    { metrics: [{ measure: "count", aggregation: "sum" }] },
    { dimensions: [{ field: "environment" }] },
    { timeDimension: null, entityDimension: { field: "environment" } },
    {
      filters: [{ column: "name", type: "string", operator: "=", value: "x" }],
    },
    { orderBy: [{ field: "count_count; SELECT 1", direction: "asc" }] },
  ])("rejects unsupported shapes before compiling: %j", async (override) => {
    await expect(
      buildBillableUnitsQuery({
        query: { ...usageQuery, ...override } as QueryType,
        projectId: "project-a",
        version: "v2",
      }),
    ).rejects.toThrow();
  });
});
