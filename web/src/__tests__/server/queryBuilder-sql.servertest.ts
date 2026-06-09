import { executeQuery, randomUUID } from "./queryBuilder.fixtures";
import type { QueryType } from "./queryBuilder.fixtures";

describe("queryBuilder", () => {
  describe("query builder creates executable SQL", () => {
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
              column: "name",
              operator: "=",
              value: "qa",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2025-03-01T00:00:00.000Z",
          orderBy: null,
        } as QueryType,
      ],
      // [
      //   "trace query with metric filter",
      //   {
      //     view: "traces",
      //     dimensions: [{ field: "name" }],
      //     metrics: [
      //       { measure: "count", aggregation: "count" },
      //       { measure: "observationsCount", aggregation: "p95" },
      //     ],
      //     filters: [
      //       {
      //         column: "observationsCount",
      //         operator: ">",
      //         value: 0,
      //         type: "number",
      //       },
      //     ],
      //     timeDimension: null,
      //     fromTimestamp: "2025-01-01T00:00:00.000Z",
      //     toTimestamp: "2025-03-01T00:00:00.000Z",
      //     orderBy: null,
      //   } as QueryType,
      // ],
      [
        "query with auto time dimension for month granularity",
        {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: {
            granularity: "auto",
          },
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2025-03-01T00:00:00.000Z", // 2 months difference
          orderBy: null,
        } as QueryType,
      ],
      [
        "query with specific time dimension granularity",
        {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: {
            granularity: "day",
          },
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2025-01-10T00:00:00.000Z", // 10 days difference
          orderBy: null,
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
          orderBy: null,
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
          orderBy: null,
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
          orderBy: null,
        } as QueryType,
      ],
      [
        "trace query with scores and observations",
        {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [
            {
              measure: "count",
              aggregation: "count",
            },
            {
              measure: "scoresCount",
              aggregation: "sum",
            },
            {
              measure: "observationsCount",
              aggregation: "sum",
            },
          ],
          filters: [],
          timeDimension: {
            granularity: "auto",
          },
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2025-03-01T00:00:00.000Z",
          orderBy: null,
        } as QueryType,
      ],
      [
        "scores-numeric query",
        {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [
            {
              measure: "count",
              aggregation: "count",
            },
            {
              measure: "value",
              aggregation: "avg",
            },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2025-03-01T00:00:00.000Z",
          orderBy: null,
        } as QueryType,
      ],
      [
        "scores-categorical query",
        {
          view: "scores-categorical",
          dimensions: [{ field: "name" }, { field: "stringValue" }],
          metrics: [
            {
              measure: "count",
              aggregation: "count",
            },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2025-01-01T00:00:00.000Z",
          toTimestamp: "2025-03-01T00:00:00.000Z",
          orderBy: null,
        } as QueryType,
      ],
      [
        "scores-numeric query with filters and time dimension",
        {
          view: "scores-numeric",
          dimensions: [],
          metrics: [
            {
              measure: "value",
              aggregation: "sum",
            },
          ],
          filters: [
            {
              column: "name",
              operator: "=",
              value: "Money-saved-eval-test",
              type: "string",
            },
            {
              column: "value",
              operator: ">",
              value: 0,
              type: "number",
            },
          ],
          timeDimension: {
            granularity: "auto",
          },
          fromTimestamp: "2025-07-02T12:39:49.089Z",
          toTimestamp: "2025-07-09T12:39:49.089Z",
          orderBy: null,
        } as QueryType,
      ],
    ])(
      "should compile query to valid SQL: (%s)",
      async (_name, query: QueryType) => {
        const projectId = randomUUID();

        const result = await executeQuery(projectId, query);
        expect(result).toBeDefined();
      },
    );
  });
});
