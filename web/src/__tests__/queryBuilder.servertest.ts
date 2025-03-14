import { clickhouseClient } from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType } from "@/src/features/query/server/types";

describe("queryBuilder", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  it.each([
    [
      "simple trace query",
      {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "observationsCount", aggregation: "p95" },
        ],
        filters: [
          {
            field: "name",
            operator: "eq",
            value: "qa",
          },
        ],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-03-01T00:00:00.000Z",
        page: 0,
        limit: 50,
      } as QueryType,
    ],
    [
      "trace query without dimensions",
      {
        view: "traces",
        dimensions: [],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "observationsCount", aggregation: "p95" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-03-01T00:00:00.000Z",
        page: 0,
        limit: 50,
      } as QueryType,
    ],
    [
      "trace query without metrics",
      {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-03-01T00:00:00.000Z",
        page: 0,
        limit: 50,
      } as QueryType,
    ],
    [
      "trace query without filters",
      {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-03-01T00:00:00.000Z",
        page: 0,
        limit: 50,
      } as QueryType,
    ],
  ])(
    "should compile query to valid SQL: (%s)",
    async (_name, query: QueryType) => {
      // When
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );

      // Then
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();
      expect(result).toBeDefined();
    },
  );
});
