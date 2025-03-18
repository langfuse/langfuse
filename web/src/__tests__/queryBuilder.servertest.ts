import { clickhouseClient } from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType } from "@/src/features/query/server/types";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createScore,
  createScoresCh,
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
          orderBy: null,
          page: 0,
          limit: 50,
        } as QueryType,
      ],
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
          page: 0,
          limit: 50,
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
          orderBy: null,
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
          orderBy: null,
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
          orderBy: null,
          page: 0,
          limit: 50,
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
          page: 0,
          limit: 50,
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
          page: 0,
          limit: 50,
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
    // Helper functions
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

    // Helper function to create scores for testing
    const setupScores = async (
      projectId: string,
      scoresData: Array<{
        name: string;
        traceId: string;
        observationId?: string;
        value?: number;
        stringValue?: string;
        dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
        source?: string;
        environment?: string;
      }>,
    ) => {
      const scores = [];

      for (const data of scoresData) {
        scores.push(
          createScore({
            project_id: projectId,
            trace_id: data.traceId,
            observation_id: data.observationId,
            name: data.name,
            value: data.dataType === "NUMERIC" ? data.value || 0 : null,
            string_value: ["CATEGORICAL", "BOOLEAN"].includes(data.dataType)
              ? data.stringValue || ""
              : null,
            environment: data.environment || "default",
            source: data.source || "API",
            data_type: data.dataType,
          }),
        );
      }

      await createScoresCh(scores);
      return scores;
    };

    describe("traces view", () => {
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
          orderBy: null,
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
          orderBy: null,
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
          orderBy: null,
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
          orderBy: null,
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
          orderBy: null,
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
          {
            name: "embeddings",
            environment: "production",
            observationCount: 3,
          },
          {
            name: "embeddings",
            environment: "development",
            observationCount: 2,
          },
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
          orderBy: null,
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
          (row: any) =>
            row.name === "chat" && row.environment === "development",
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
          orderBy: null,
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

      it("should order by a dimension field correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-c", environment: "staging" },
          { name: "trace-a", environment: "production" },
          { name: "trace-b", environment: "development" },
        ];

        await setupTracesWithObservations(projectId, tracesData);

        // Define query with orderBy on a dimension
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
          orderBy: [{ field: "name", direction: "asc" }],
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause is present in the query
        expect(compiledQuery).toContain("ORDER BY name asc");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Assert - results should be ordered by name alphabetically
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe("trace-a");
        expect(result.data[1].name).toBe("trace-b");
        expect(result.data[2].name).toBe("trace-c");
      });

      it("should order by a metric field correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-low", observationCount: 2 },
          { name: "trace-high", observationCount: 10 },
          { name: "trace-medium", observationCount: 5 },
        ];

        await setupTracesWithObservations(projectId, tracesData);

        // Define query with orderBy on a metric
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
          orderBy: [{ field: "sum_observations_count", direction: "desc" }],
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause is present in the query
        expect(compiledQuery).toContain("ORDER BY sum_observations_count desc");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Assert - results should be ordered by observation count descending
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe("trace-high"); // 10 observations
        expect(result.data[1].name).toBe("trace-medium"); // 5 observations
        expect(result.data[2].name).toBe("trace-low"); // 2 observations
      });

      it("should order by multiple fields correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-a", environment: "production", observationCount: 5 },
          { name: "trace-b", environment: "production", observationCount: 2 },
          { name: "trace-c", environment: "development", observationCount: 7 },
          { name: "trace-d", environment: "development", observationCount: 3 },
        ];

        await setupTracesWithObservations(projectId, tracesData);

        // Define query with multiple orderBy fields
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "environment" }, { field: "name" }],
          metrics: [{ measure: "observationsCount", aggregation: "sum" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: [
            { field: "environment", direction: "asc" },
            { field: "sum_observations_count", direction: "desc" },
          ],
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause is present in the query with both fields
        expect(compiledQuery).toContain(
          "ORDER BY environment asc, sum_observations_count desc",
        );

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Assert - results should be ordered by environment (asc) and then by observation count (desc)
        expect(result.data).toHaveLength(4);

        // Development environment should come first (alphabetically)
        expect(result.data[0].environment).toBe("development");
        expect(result.data[1].environment).toBe("development");
        // Within development, higher observation count first
        expect(result.data[0].name).toBe("trace-c"); // 7 observations
        expect(result.data[1].name).toBe("trace-d"); // 3 observations

        // Production environment should come second
        expect(result.data[2].environment).toBe("production");
        expect(result.data[3].environment).toBe("production");
        // Within production, higher observation count first
        expect(result.data[2].name).toBe("trace-a"); // 5 observations
        expect(result.data[3].name).toBe("trace-b"); // 2 observations
      });

      it("should handle default ordering when no orderBy is specified", async () => {
        // Setup
        const projectId = randomUUID();
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        // Create traces with time dimension
        const traces = [
          createTrace({
            project_id: projectId,
            name: "trace-day2",
            environment: "default",
            timestamp: now.getTime(),
          }),
          createTrace({
            project_id: projectId,
            name: "trace-day1",
            environment: "default",
            timestamp: yesterday.getTime(),
          }),
        ];

        await createTracesCh(traces);

        // Define query with time dimension but no explicit orderBy
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: {
            granularity: "day",
          },
          fromTimestamp: yesterday.toISOString(),
          toTimestamp: new Date(now.getTime() + 86400000).toISOString(),
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause includes default time dimension ordering
        expect(compiledQuery).toContain("ORDER BY time_dimension asc");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Results should be ordered by time dimension (ascending)
        expect(result.data.length).toBeGreaterThan(0);

        // Convert time_dimension strings to Date objects for comparison
        const dates = result.data.map(
          (row: any) => new Date(row.time_dimension),
        );

        // Check that dates are in ascending order
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i].getTime()).toBeGreaterThanOrEqual(
            dates[i - 1].getTime(),
          );
        }
      });

      it("should use first metric for default ordering when no time dimension", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-low", observationCount: 2 },
          { name: "trace-high", observationCount: 10 },
          { name: "trace-medium", observationCount: 5 },
        ];

        await setupTracesWithObservations(projectId, tracesData);

        // Define query with metrics but no explicit orderBy and no time dimension
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
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause includes default metric ordering (descending)
        expect(compiledQuery).toContain("ORDER BY sum_observations_count desc");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Results should be ordered by observation count descending (default for metrics)
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe("trace-high"); // 10 observations
        expect(result.data[1].name).toBe("trace-medium"); // 5 observations
        expect(result.data[2].name).toBe("trace-low"); // 2 observations
      });

      it("should use first dimension for default ordering when no metrics and no time dimension", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-c", environment: "production" },
          { name: "trace-a", environment: "production" },
          { name: "trace-b", environment: "production" },
        ];

        await setupTracesWithObservations(projectId, tracesData);

        // Define query with dimensions but no metrics, no time dimension, and no explicit orderBy
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause includes default dimension ordering (ascending)
        expect(compiledQuery).toContain("ORDER BY name asc");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Results should be ordered by name ascending (default for dimensions)
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe("trace-a");
        expect(result.data[1].name).toBe("trace-b");
        expect(result.data[2].name).toBe("trace-c");
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
          orderBy: null,
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
          orderBy: null,
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

      it("should group traces by name and time dimension correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with specific timestamps and names
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const dayBeforeYesterday = new Date(now);
        dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

        const traces = [];
        // Today's traces - two different names
        traces.push(
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "default",
            timestamp: now.getTime(),
          }),
        );
        traces.push(
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "default",
            timestamp: now.getTime(),
          }),
        );
        traces.push(
          createTrace({
            project_id: projectId,
            name: "embeddings",
            environment: "default",
            timestamp: now.getTime(),
          }),
        );

        // Yesterday's traces
        traces.push(
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "default",
            timestamp: yesterday.getTime(),
          }),
        );
        traces.push(
          createTrace({
            project_id: projectId,
            name: "embeddings",
            environment: "default",
            timestamp: yesterday.getTime(),
          }),
        );

        // Day before yesterday's traces
        traces.push(
          createTrace({
            project_id: projectId,
            name: "embeddings",
            environment: "default",
            timestamp: dayBeforeYesterday.getTime(),
          }),
        );

        await createTracesCh(traces);

        // Define query with time dimension and name dimension
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: {
            granularity: "day", // Group by day
          },
          fromTimestamp: dayBeforeYesterday.toISOString(),
          toTimestamp: new Date(now.getTime() + 86400000).toISOString(), // Include tomorrow
          orderBy: null,
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

        // Assert - should have 5 combinations (chat-today, chat-yesterday, embeddings-today, embeddings-yesterday, embeddings-dayBefore)
        expect(result.data).toHaveLength(5);

        // Check chat-completion counts by day
        const chatCompletionToday = result.data.find((row: any) => {
          const rowDate = new Date(row.time_dimension);
          const today = new Date(now);
          return (
            row.name === "chat-completion" &&
            rowDate.getDate() === today.getDate() &&
            rowDate.getMonth() === today.getMonth() &&
            rowDate.getFullYear() === today.getFullYear()
          );
        });
        expect(chatCompletionToday?.count_count).toBe("2"); // 2 chat-completion traces today

        const chatCompletionYesterday = result.data.find((row: any) => {
          const rowDate = new Date(row.time_dimension);
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          return (
            row.name === "chat-completion" &&
            rowDate.getDate() === yesterday.getDate() &&
            rowDate.getMonth() === yesterday.getMonth() &&
            rowDate.getFullYear() === yesterday.getFullYear()
          );
        });
        expect(chatCompletionYesterday?.count_count).toBe("1"); // 1 chat-completion trace yesterday

        // Check embeddings counts by day
        const embeddingsToday = result.data.find((row: any) => {
          const rowDate = new Date(row.time_dimension);
          const today = new Date(now);
          return (
            row.name === "embeddings" &&
            rowDate.getDate() === today.getDate() &&
            rowDate.getMonth() === today.getMonth() &&
            rowDate.getFullYear() === today.getFullYear()
          );
        });
        expect(embeddingsToday?.count_count).toBe("1"); // 1 embeddings trace today

        const embeddingsYesterday = result.data.find((row: any) => {
          const rowDate = new Date(row.time_dimension);
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          return (
            row.name === "embeddings" &&
            rowDate.getDate() === yesterday.getDate() &&
            rowDate.getMonth() === yesterday.getMonth() &&
            rowDate.getFullYear() === yesterday.getFullYear()
          );
        });
        expect(embeddingsYesterday?.count_count).toBe("1"); // 1 embeddings trace yesterday

        const embeddingsDayBefore = result.data.find((row: any) => {
          const rowDate = new Date(row.time_dimension);
          const dayBefore = new Date(now);
          dayBefore.setDate(dayBefore.getDate() - 2);
          return (
            row.name === "embeddings" &&
            rowDate.getDate() === dayBefore.getDate() &&
            rowDate.getMonth() === dayBefore.getMonth() &&
            rowDate.getFullYear() === dayBefore.getFullYear()
          );
        });
        expect(embeddingsDayBefore?.count_count).toBe("1"); // 1 embeddings trace day before yesterday
      });
    });

    describe("scores-numeric view", () => {
      it("should aggregate numeric scores correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces
        const traces = [
          createTrace({
            project_id: projectId,
            name: "qa-trace-1",
            environment: "production",
          }),
          createTrace({
            project_id: projectId,
            name: "qa-trace-2",
            environment: "production",
          }),
          createTrace({
            project_id: projectId,
            name: "summarization-trace",
            environment: "production",
          }),
        ];
        await createTracesCh(traces);

        // Create observations
        const observations = [
          createObservation({
            project_id: projectId,
            trace_id: traces[0].id,
            name: "qa-observation-1",
            environment: "production",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[1].id,
            name: "qa-observation-2",
            environment: "production",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[2].id,
            name: "summarization-observation",
            environment: "production",
          }),
        ];
        await createObservationsCh(observations);

        // Create scores
        const scores = [
          // Accuracy scores for QA traces - different values
          {
            name: "accuracy",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.85,
            dataType: "NUMERIC" as const,
            source: "human",
          },
          {
            name: "accuracy",
            traceId: traces[1].id,
            observationId: observations[1].id,
            value: 0.92,
            dataType: "NUMERIC" as const,
            source: "human",
          },

          // Relevance scores for QA traces
          {
            name: "relevance",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.75,
            dataType: "NUMERIC" as const,
            source: "auto",
          },
          {
            name: "relevance",
            traceId: traces[1].id,
            observationId: observations[1].id,
            value: 0.8,
            dataType: "NUMERIC" as const,
            source: "auto",
          },

          // Coherence score for summarization trace
          {
            name: "coherence",
            traceId: traces[2].id,
            observationId: observations[2].id,
            value: 0.95,
            dataType: "NUMERIC" as const,
            source: "human",
          },

          // Adding a CATEGORICAL score that should be excluded by the segments filter
          {
            name: "evaluation",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "good",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
        ];

        await setupScores(projectId, scores);

        // Define query for numeric scores
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "value", aggregation: "avg" },
            { measure: "value", aggregation: "min" },
            { measure: "value", aggregation: "max" },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify SQL includes segment filter for NUMERIC types
        expect(compiledQuery).toContain(
          "data_type = {filter_data_type_1: String}",
        );
        expect(parameters.filter_data_type_1).toBe("NUMERIC");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Assert
        expect(result.data).toHaveLength(3); // accuracy, relevance, coherence

        // Check each score type
        const accuracyRow = result.data.find(
          (row: any) => row.name === "accuracy",
        );
        expect(accuracyRow.count_count).toBe("2");
        expect(parseFloat(accuracyRow.avg_value)).toBeCloseTo(0.885, 2); // (0.85 + 0.92) / 2
        expect(parseFloat(accuracyRow.min_value)).toBeCloseTo(0.85, 2);
        expect(parseFloat(accuracyRow.max_value)).toBeCloseTo(0.92, 2);

        const relevanceRow = result.data.find(
          (row: any) => row.name === "relevance",
        );
        expect(relevanceRow.count_count).toBe("2");
        expect(parseFloat(relevanceRow.avg_value)).toBeCloseTo(0.775, 2); // (0.75 + 0.80) / 2
        expect(parseFloat(relevanceRow.min_value)).toBeCloseTo(0.75, 2);
        expect(parseFloat(relevanceRow.max_value)).toBeCloseTo(0.8, 2);

        const coherenceRow = result.data.find(
          (row: any) => row.name === "coherence",
        );
        expect(coherenceRow.count_count).toBe("1");
        expect(parseFloat(coherenceRow.avg_value)).toBeCloseTo(0.95, 2);
      });

      it("should filter numeric scores by source", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "qa-trace",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create observation
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          name: "qa-observation",
          environment: "production",
        });
        await createObservationsCh([observation]);

        // Create scores with different sources
        const scores = [
          {
            name: "quality",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.95,
            dataType: "NUMERIC" as const,
            source: "human",
          },
          {
            name: "quality",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.88,
            dataType: "NUMERIC" as const,
            source: "auto",
          },
          {
            name: "quality",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.92,
            dataType: "NUMERIC" as const,
            source: "external",
          },
        ];

        await setupScores(projectId, scores);

        // Define query with filter for human-source scores
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "source" }],
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "value", aggregation: "avg" },
          ],
          filters: [
            {
              field: "source",
              operator: "eq",
              value: "human",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
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

        // Assert - should only return human scores
        expect(result.data).toHaveLength(1);
        expect(result.data[0].source).toBe("human");
        expect(result.data[0].count_count).toBe("1");
        expect(parseFloat(result.data[0].avg_value)).toBeCloseTo(0.95, 2);
      });

      it("should join with traces and observations to get related dimensions", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with different names
        const traces = [
          createTrace({
            project_id: projectId,
            name: "qa-trace",
            environment: "production",
            user_id: "user-1",
          }),
          createTrace({
            project_id: projectId,
            name: "summarization-trace",
            environment: "production",
            user_id: "user-2",
          }),
        ];
        await createTracesCh(traces);

        // Create observations with different model names
        const observations = [
          createObservation({
            project_id: projectId,
            trace_id: traces[0].id,
            name: "qa-observation",
            environment: "production",
            provided_model_name: "gpt-4",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[1].id,
            name: "summarization-observation",
            environment: "production",
            provided_model_name: "claude-3",
          }),
        ];
        await createObservationsCh(observations);

        // Create numeric scores
        const scores = [
          {
            name: "accuracy",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.9,
            dataType: "NUMERIC" as const,
          },
          {
            name: "relevance",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.85,
            dataType: "NUMERIC" as const,
          },
          {
            name: "accuracy",
            traceId: traces[1].id,
            observationId: observations[1].id,
            value: 0.95,
            dataType: "NUMERIC" as const,
          },
        ];

        await setupScores(projectId, scores);

        // Define query to group by trace name and observation model
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [
            { field: "traceName" },
            { field: "observationModelName" },
          ],
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "value", aggregation: "avg" },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify joins included
        expect(compiledQuery).toContain("LEFT JOIN traces");
        expect(compiledQuery).toContain("LEFT JOIN observations");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Assert - should have 2 rows (1 for each trace/model combination)
        expect(result.data).toHaveLength(2);

        // Check qa trace with gpt-4
        const qaTraceRow = result.data.find(
          (row: any) =>
            row.trace_name === "qa-trace" &&
            row.observation_model_name === "gpt-4",
        );
        expect(qaTraceRow.count_count).toBe("2"); // 2 scores (accuracy + relevance)
        expect(parseFloat(qaTraceRow.avg_value)).toBeCloseTo(0.875, 2); // (0.90 + 0.85) / 2

        // Check summarization trace with claude-3
        const summaryTraceRow = result.data.find(
          (row: any) =>
            row.trace_name === "summarization-trace" &&
            row.observation_model_name === "claude-3",
        );
        expect(summaryTraceRow.count_count).toBe("1"); // 1 score (accuracy)
        expect(parseFloat(summaryTraceRow.avg_value)).toBeCloseTo(0.95, 2);
      });
    });

    describe("scores-categorical view", () => {
      it("should group categorical scores by value correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "trace-with-categorical-scores",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create observation
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          name: "observation",
          environment: "production",
        });
        await createObservationsCh([observation]);

        // Create categorical and boolean scores
        const scores = [
          // Categorical scores
          {
            name: "evaluation",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "excellent",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "evaluation",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "good",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "evaluation",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "good",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "category",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "question",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },
          {
            name: "category",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "factual",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },

          // Boolean scores
          {
            name: "is_correct",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "true",
            dataType: "BOOLEAN" as const,
            source: "auto",
          },
          {
            name: "is_correct",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "false",
            dataType: "BOOLEAN" as const,
            source: "auto",
          },

          // Adding a NUMERIC score that should be excluded by the segments filter
          {
            name: "numeric_score",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.95,
            dataType: "NUMERIC" as const,
            source: "human",
          },
        ];

        await setupScores(projectId, scores);

        // Define query to count by score name and string value
        const query: QueryType = {
          view: "scores-categorical",
          dimensions: [{ field: "name" }, { field: "stringValue" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
          page: 0,
          limit: 50,
        };

        // Execute query
        const queryBuilder = new QueryBuilder(clickhouseClient());
        const { query: compiledQuery, parameters } = queryBuilder.build(
          query,
          projectId,
        );

        // Verify SQL includes segment filter for non-NUMERIC types
        expect(compiledQuery).toContain(
          "data_type != {filter_data_type_1: String}",
        );
        expect(parameters.filter_data_type_1).toBe("NUMERIC");

        const result = await (
          await clickhouseClient().query({
            query: compiledQuery,
            query_params: parameters,
          })
        ).json();

        // Assert - should have 6 rows for different name+value combinations
        expect(result.data).toHaveLength(6);

        // Check each combination
        const evaluationExcellent = result.data.find(
          (row: any) =>
            row.name === "evaluation" && row.string_value === "excellent",
        );
        expect(evaluationExcellent.count_count).toBe("1");

        const evaluationGood = result.data.find(
          (row: any) =>
            row.name === "evaluation" && row.string_value === "good",
        );
        expect(evaluationGood.count_count).toBe("2");

        const categoryQuestion = result.data.find(
          (row: any) =>
            row.name === "category" && row.string_value === "question",
        );
        expect(categoryQuestion.count_count).toBe("1");

        const categoryFactual = result.data.find(
          (row: any) =>
            row.name === "category" && row.string_value === "factual",
        );
        expect(categoryFactual.count_count).toBe("1");

        // Check boolean scores
        const isCorrectTrue = result.data.find(
          (row: any) =>
            row.name === "is_correct" && row.string_value === "true",
        );
        expect(isCorrectTrue.count_count).toBe("1");

        const isCorrectFalse = result.data.find(
          (row: any) =>
            row.name === "is_correct" && row.string_value === "false",
        );
        expect(isCorrectFalse.count_count).toBe("1");
      });

      it("should filter categorical scores by source", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "trace",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create observation
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          name: "observation",
          environment: "production",
        });
        await createObservationsCh([observation]);

        // Create categorical scores with different sources
        const scores = [
          {
            name: "classification",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "question",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "classification",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "statement",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },
          {
            name: "classification",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "command",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },
        ];

        await setupScores(projectId, scores);

        // Define query with filter for auto-source scores only
        const query: QueryType = {
          view: "scores-categorical",
          dimensions: [{ field: "stringValue" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              field: "source",
              operator: "eq",
              value: "auto",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
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

        // Assert - should only return auto-source scores
        expect(result.data).toHaveLength(2);
        expect(result.data.every((row: any) => row.count_count === "1")).toBe(
          true,
        );

        // Check specific values
        const stringValues = result.data
          .map((row: any) => row.string_value)
          .sort();
        expect(stringValues).toEqual(["command", "statement"]);
      });

      it("should filter boolean scores correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces
        const traces = [
          createTrace({
            project_id: projectId,
            name: "trace-1",
            environment: "production",
          }),
          createTrace({
            project_id: projectId,
            name: "trace-2",
            environment: "production",
          }),
        ];
        await createTracesCh(traces);

        // Create observations
        const observations = [
          createObservation({
            project_id: projectId,
            trace_id: traces[0].id,
            name: "observation-1",
            environment: "production",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[1].id,
            name: "observation-2",
            environment: "production",
          }),
        ];
        await createObservationsCh(observations);

        // Create boolean scores
        const scores = [
          {
            name: "is_hallucination",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "true",
            dataType: "BOOLEAN" as const,
          },
          {
            name: "is_hallucination",
            traceId: traces[1].id,
            observationId: observations[1].id,
            stringValue: "false",
            dataType: "BOOLEAN" as const,
          },
          {
            name: "is_helpful",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "false",
            dataType: "BOOLEAN" as const,
          },
          {
            name: "is_helpful",
            traceId: traces[1].id,
            observationId: observations[1].id,
            stringValue: "true",
            dataType: "BOOLEAN" as const,
          },
        ];

        await setupScores(projectId, scores);

        // Define query to filter for true Boolean scores only
        const query: QueryType = {
          view: "scores-categorical",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              field: "stringValue",
              operator: "eq",
              value: "true",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
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

        // Assert - should only return true scores
        expect(result.data).toHaveLength(2);

        // Check which scores were true
        const isHallucination = result.data.find(
          (row: any) => row.name === "is_hallucination",
        );
        const isHelpful = result.data.find(
          (row: any) => row.name === "is_helpful",
        );

        expect(isHallucination.count_count).toBe("1");
        expect(isHelpful.count_count).toBe("1");
      });
    });

    describe("observations view", () => {
      it("should calculate p95 timeToFirstToken for each trace name using observations view", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with observations that have different start/completion start times
        const traces = [];
        const observations = [];

        // Create trace for "gpt-4-turbo" model
        const traceGpt4 = createTrace({
          project_id: projectId,
          name: "gpt-4-completion",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(traceGpt4);

        // Create observations for GPT-4-turbo with different time to first token values
        // Add 10 observations with time to first token ranging from 500ms to 1400ms
        for (let i = 0; i < 10; i++) {
          const startTime = new Date();
          // Create increasing TTFT values (500ms to 1400ms)
          const ttft = 500 + i * 100;
          const completionStartTime = new Date(startTime.getTime() + ttft);
          const endTime = new Date(completionStartTime.getTime() + 500); // Add another 500ms for generation

          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: traceGpt4.id,
              type: "generation",
              name: "gpt-4-turbo",
              provided_model_name: "gpt-4-turbo",
              environment: "default",
              start_time: startTime.getTime(),
              completion_start_time: completionStartTime.getTime(),
              end_time: endTime.getTime(),
            }),
          );
        }

        // Create trace for "gpt-3.5-turbo" model
        const traceGpt35 = createTrace({
          project_id: projectId,
          name: "gpt-3.5-completion",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(traceGpt35);

        // Create observations for GPT-3.5-turbo with different time to first token values
        // Add 10 observations with time to first token ranging from 200ms to 650ms
        for (let i = 0; i < 10; i++) {
          const startTime = new Date();
          // Create increasing TTFT values (200ms to 650ms)
          const ttft = 200 + i * 50;
          const completionStartTime = new Date(startTime.getTime() + ttft);
          const endTime = new Date(completionStartTime.getTime() + 300); // Add another 300ms for generation

          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: traceGpt35.id,
              type: "generation",
              name: "gpt-3.5-turbo",
              provided_model_name: "gpt-3.5-turbo",
              environment: "default",
              start_time: startTime.getTime(),
              completion_start_time: completionStartTime.getTime(),
              end_time: endTime.getTime(),
            }),
          );
        }

        // Create trace for "claude-3-opus" model
        const traceClaude = createTrace({
          project_id: projectId,
          name: "claude-completion",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(traceClaude);

        // Create observations for Claude with different time to first token values
        // Add 10 observations with time to first token ranging from 300ms to 1200ms
        for (let i = 0; i < 10; i++) {
          const startTime = new Date();
          // Create increasing TTFT values (300ms to 1200ms)
          const ttft = 300 + i * 100;
          const completionStartTime = new Date(startTime.getTime() + ttft);
          const endTime = new Date(completionStartTime.getTime() + 400); // Add another 400ms for generation

          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: traceClaude.id,
              type: "generation",
              name: "claude-3-opus",
              provided_model_name: "claude-3-opus",
              environment: "default",
              start_time: startTime.getTime(),
              completion_start_time: completionStartTime.getTime(),
              end_time: endTime.getTime(),
            }),
          );
        }

        await createTracesCh(traces);
        await createObservationsCh(observations);

        // Define query to test p95 timeToFirstToken calculation for each trace using observations view
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "traceName" }],
          metrics: [{ measure: "timeToFirstToken", aggregation: "p95" }],
          filters: [
            {
              field: "type",
              operator: "eq",
              value: "generation",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
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
        expect(result.data).toHaveLength(3);

        // Get results for each trace
        const gpt4Result = result.data.find(
          (row: any) => row.trace_name === "gpt-4-completion",
        );
        const gpt35Result = result.data.find(
          (row: any) => row.trace_name === "gpt-3.5-completion",
        );
        const claudeResult = result.data.find(
          (row: any) => row.trace_name === "claude-completion",
        );

        // The p95 should be close to the 95th percentile value we generated
        // For GPT-4: the 95th percentile of values from 500-1400 would be around 1350ms
        expect(
          parseInt(gpt4Result.p95_time_to_first_token),
        ).toBeGreaterThanOrEqual(1300);
        expect(
          parseInt(gpt4Result.p95_time_to_first_token),
        ).toBeLessThanOrEqual(1400);

        // For GPT-3.5: the 95th percentile of values from 200-650 would be around 625ms
        expect(
          parseInt(gpt35Result.p95_time_to_first_token),
        ).toBeGreaterThanOrEqual(600);
        expect(
          parseInt(gpt35Result.p95_time_to_first_token),
        ).toBeLessThanOrEqual(650);

        // For Claude: the 95th percentile of values from 300-1200 would be around 1150ms
        expect(
          parseInt(claudeResult.p95_time_to_first_token),
        ).toBeGreaterThanOrEqual(1100);
        expect(
          parseInt(claudeResult.p95_time_to_first_token),
        ).toBeLessThanOrEqual(1200);
      });
    });
  });
});
