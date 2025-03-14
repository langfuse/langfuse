import { clickhouseClient } from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType } from "@/src/features/query/server/types";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

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
        const projectId = randomUUID();

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

  describe("query result correctness", () => {
    // Helper function to create test traces with specific properties
    const setupTracesWithObservations = async (
      projectId: string,
      tracesData: Array<{
        name: string;
        environment?: string;
        userId?: string;
        sessionId?: string;
        observationCount?: number;
      }>,
    ) => {
      const traces = [];

      for (const data of tracesData) {
        const trace = createTrace({
          project_id: projectId,
          name: data.name,
          environment: data.environment || "default",
          user_id: data.userId,
          session_id: data.sessionId,
          timestamp: new Date().getTime(),
        });

        traces.push(trace);

        // Create observations for this trace if specified
        if (data.observationCount && data.observationCount > 0) {
          const observations = [];

          for (let i = 0; i < data.observationCount; i++) {
            observations.push(
              createObservation({
                project_id: projectId,
                trace_id: trace.id,
                environment: data.environment || "default",
                start_time: new Date().getTime(),
              }),
            );
          }

          await createObservationsCh(observations);
        }
      }

      await createTracesCh(traces);
      return traces;
    };

    it("should count traces correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "trace-1" },
        { name: "trace-2" },
        { name: "trace-3" },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(), // yesterday
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(), // tomorrow
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].count_count).toBe("3");
    });

    it("should group traces by name and count correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "chat-completion" },
        { name: "chat-completion" },
        { name: "embeddings" },
        { name: "embeddings" },
        { name: "embeddings" },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(2);

      // Find and verify each name group
      const chatCompletionRow = result.data.find(
        (row: any) => row.name === "chat-completion",
      );
      expect(chatCompletionRow.count_count).toBe("2");

      const embeddingsRow = result.data.find(
        (row: any) => row.name === "embeddings",
      );
      expect(embeddingsRow.count_count).toBe("3");
    });

    it("should filter traces by name correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "qa-bot" },
        { name: "assistant" },
        { name: "qa-bot" },
        { name: "summarizer" },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query with a filter
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            field: "name",
            operator: "eq",
            value: "qa-bot",
          },
        ],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert - should only return traces with name "qa-bot"
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("qa-bot");
      expect(result.data[0].count_count).toBe("2");
    });

    it("should count observations per trace correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "trace-with-many-obs", observationCount: 5 },
        { name: "trace-with-few-obs", observationCount: 2 },
        { name: "trace-with-no-obs", observationCount: 0 },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query to count observations
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "observationsCount", aggregation: "sum" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(2);

      // Find each trace by name and verify observation count
      const manyObsTrace = result.data.find(
        (row: any) => row.name === "trace-with-many-obs",
      );
      expect(manyObsTrace.sum_observations_count).toBe("5");

      const fewObsTrace = result.data.find(
        (row: any) => row.name === "trace-with-few-obs",
      );
      expect(fewObsTrace.sum_observations_count).toBe("2");
    });

    it("should group by environment and calculate metrics correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        {
          name: "trace-prod-1",
          environment: "production",
          observationCount: 3,
        },
        {
          name: "trace-prod-2",
          environment: "production",
          observationCount: 4,
        },
        {
          name: "trace-dev-1",
          environment: "development",
          observationCount: 2,
        },
        {
          name: "trace-dev-2",
          environment: "development",
          observationCount: 1,
        },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query to group by environment
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "environment" }],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "observationsCount", aggregation: "sum" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(2);

      // Verify production environment data
      const prodEnv = result.data.find(
        (row: any) => row.environment === "production",
      );
      expect(prodEnv.count_count).toBe("2"); // 2 traces
      expect(prodEnv.sum_observations_count).toBe("7"); // 3+4 observations

      // Verify development environment data
      const devEnv = result.data.find(
        (row: any) => row.environment === "development",
      );
      expect(devEnv.count_count).toBe("2"); // 2 traces
      expect(devEnv.sum_observations_count).toBe("3"); // 2+1 observations
    });

    it("should handle multiple dimensions (name and environment) correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "chat", environment: "production", observationCount: 2 },
        { name: "chat", environment: "development", observationCount: 1 },
        { name: "embeddings", environment: "production", observationCount: 3 },
        { name: "embeddings", environment: "development", observationCount: 2 },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query with multiple dimensions
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }, { field: "environment" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(4); // 2 names × 2 environments = 4 combinations

      // Verify each combination
      const chatProd = result.data.find(
        (row: any) => row.name === "chat" && row.environment === "production",
      );
      expect(chatProd.count_count).toBe("1");

      const chatDev = result.data.find(
        (row: any) => row.name === "chat" && row.environment === "development",
      );
      expect(chatDev.count_count).toBe("1");

      const embeddingsProd = result.data.find(
        (row: any) =>
          row.name === "embeddings" && row.environment === "production",
      );
      expect(embeddingsProd.count_count).toBe("1");

      const embeddingsDev = result.data.find(
        (row: any) =>
          row.name === "embeddings" && row.environment === "development",
      );
      expect(embeddingsDev.count_count).toBe("1");
    });

    it("should handle multiple metrics correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "multi-metric-test", observationCount: 10 },
        { name: "multi-metric-test", observationCount: 20 },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query with multiple metrics
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "observationsCount", aggregation: "sum" },
          { measure: "observationsCount", aggregation: "avg" },
          { measure: "observationsCount", aggregation: "max" },
          { measure: "observationsCount", aggregation: "min" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(1);

      const row = result.data[0];
      expect(row.name).toBe("multi-metric-test");
      expect(row.count_count).toBe("2"); // 2 traces
      expect(row.sum_observations_count).toBe("30"); // 10+20 observations
      expect(row.avg_observations_count).toBe(15); // (10+20)/2 average
      expect(row.max_observations_count).toBe("20"); // max is 20
      expect(row.min_observations_count).toBe("10"); // min is 10
    });

    it("should filter with the LIKE operator correctly", async () => {
      // Setup
      const projectId = randomUUID();
      const tracesData = [
        { name: "prefix-value-1" },
        { name: "prefix-value-2" },
        { name: "different-name" },
      ];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query with LIKE filter
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            field: "name",
            operator: "like",
            value: "prefix-%",
          },
        ],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(2);
      expect(
        result.data.every((row: any) => row.name.startsWith("prefix-")),
      ).toBe(true);
      expect(result.data.map((row: any) => row.name).sort()).toEqual([
        "prefix-value-1",
        "prefix-value-2",
      ]);
    });

    it("should handle queries with zero dimensions and zero metrics", async () => {
      // Setup - just create a few traces
      const projectId = randomUUID();
      const tracesData = [{ name: "trace-1" }, { name: "trace-2" }];

      await setupTracesWithObservations(projectId, tracesData);

      // Define query with no dimensions and no metrics
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(
          new Date().setDate(new Date().getDate() - 1),
        ).toISOString(),
        toTimestamp: new Date(
          new Date().setDate(new Date().getDate() + 1),
        ).toISOString(),
        page: 0,
        limit: 50,
      };

      // Execute query
      const queryBuilder = new QueryBuilder(clickhouseClient());
      const { query: compiledQuery, parameters } = queryBuilder.build(
        query,
        projectId,
      );
      const result = await (
        await clickhouseClient().query({
          query: compiledQuery,
          query_params: parameters,
        })
      ).json();

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].count).toBe("2"); // default count metric should be used
    });
  });
});
