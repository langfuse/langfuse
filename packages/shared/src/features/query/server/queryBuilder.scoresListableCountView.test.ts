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

// QueryBuilder.build checks the OTEL FINAL optimization before filter lowering.
// Mock it so this stays unit-level and does not need ClickHouse.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
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

  it("compiles a query whose count(*) is unguarded (covers every listable type)", async () => {
    const { query: compiledQuery, parameters } = await new QueryBuilder(
      undefined,
      "v1",
    ).build(baseQuery, "test-project");

    expect(compiledQuery).toContain("count(*)");
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
