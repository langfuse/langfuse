import { describe, expect, it, vi } from "vitest";

import type { FilterCondition } from "../../../types";
import type { QueryType, ViewVersion } from "../types";
import { QueryBuilder } from "./queryBuilder";

// QueryBuilder.build checks the OTEL FINAL optimization before filter lowering.
// Mock it so these validation tests stay unit-level and do not need ClickHouse.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

const baseQuery = {
  view: "observations",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-02T00:00:00.000Z",
  orderBy: null,
} as QueryType;

const buildQueryWithFilter = (
  filter: FilterCondition,
  queryOverrides: Partial<QueryType> = {},
  version: ViewVersion = "v1",
) =>
  new QueryBuilder(undefined, version).build(
    {
      ...baseQuery,
      ...queryOverrides,
      filters: [filter],
    } as QueryType,
    "test-project",
  );

describe("queryBuilder filter type validation", () => {
  it.each([
    {
      name: "arrayOptions on scalar string dimension",
      filter: {
        column: "sessionId",
        operator: "any of",
        value: ["session-a"],
        type: "arrayOptions",
      },
      expectedMessage:
        "Filter type 'arrayOptions' is not supported for dimension type 'string'",
    },
    {
      name: "number on scalar string dimension",
      filter: {
        column: "name",
        operator: ">",
        value: 1,
        type: "number",
      },
      expectedMessage:
        "Filter type 'number' is not supported for dimension type 'string'",
    },
    {
      name: "string on numeric dimension",
      filter: {
        column: "value",
        operator: "contains",
        value: "1",
        type: "string",
      },
      queryOverrides: {
        view: "scores-numeric",
      },
      expectedMessage:
        "Filter type 'string' is not supported for dimension type 'number'",
    },
    {
      name: "string on time dimension",
      filter: {
        column: "start_time",
        operator: "=",
        value: "2025-01-01",
        type: "string",
      },
      expectedMessage:
        "Filter type 'string' is not supported for time dimension 'start_time'",
    },
    {
      name: "stringOptions on query array dimension",
      filter: {
        column: "tags",
        operator: "any of",
        value: ["tag-a"],
        type: "stringOptions",
      },
      expectedMessage:
        "Filter type 'stringOptions' is not supported for dimension type 'string[]'. Expected 'arrayOptions'.",
    },
  ])(
    "rejects incompatible filter type: $name",
    async ({ filter, queryOverrides, expectedMessage }) => {
      await expect(
        buildQueryWithFilter(
          filter as FilterCondition,
          queryOverrides as Partial<QueryType> | undefined,
        ),
      ).rejects.toThrow(expectedMessage);
    },
  );

  it.each([
    {
      name: "arrayOptions on string array dimension",
      filter: {
        column: "tags",
        operator: "all of",
        value: ["tag-a", "tag-b"],
        type: "arrayOptions",
      },
    },
    {
      name: "arrayOptions on arrayString dimension",
      filter: {
        column: "toolNames",
        operator: "any of",
        value: ["search"],
        type: "arrayOptions",
      },
    },
  ])("allows compatible filter type: $name", async ({ filter }) => {
    const { query } = await buildQueryWithFilter(filter as FilterCondition);

    expect(query).toContain("has");
  });
});
