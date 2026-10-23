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
  const scoreViews = [
    ["v1", "scores-numeric"],
    ["v1", "scores-categorical"],
    ["v1", "scores-boolean"],
    ["v1", SCORES_LISTABLE_COUNT_VIEW],
    ["v2", "scores-numeric"],
    ["v2", "scores-categorical"],
    ["v2", "scores-boolean"],
    ["v2", SCORES_LISTABLE_COUNT_VIEW],
  ] as const;

  it.each(
    scoreViews.flatMap(([version, view]) =>
      [true, false].map((skipDedup) => [version, view, skipDedup] as const),
    ),
  )(
    "%s %s (skip dedup: %s) aggregates per time bucket without a per-id subquery",
    async (version, view, skipDedup) => {
      vi.mocked(shouldSkipScoresDedup).mockReturnValueOnce(skipDedup);

      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        version,
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
