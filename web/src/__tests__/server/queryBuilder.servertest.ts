import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType } from "@/src/features/query/types";
import {
  executeQuery,
  validateQuery,
} from "@/src/features/query/server/queryExecutor";
import { env } from "@/src/env.mjs";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  createEvent,
  createEventsCh,
  clickhouseClient,
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
          createTraceScore({
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(1);
        expect(Number(result.data[0].count_count)).toBe(3);
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(2);

        // Find and verify each name group
        const chatCompletionRow = result.data.find(
          (row: any) => row.name === "chat-completion",
        );
        expect(Number(chatCompletionRow.count_count)).toBe(2);

        const embeddingsRow = result.data.find(
          (row: any) => row.name === "embeddings",
        );
        expect(Number(embeddingsRow.count_count)).toBe(3);
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
              column: "name",
              operator: "=",
              value: "qa-bot",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return traces with name "qa-bot"
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("qa-bot");
        expect(Number(result.data[0].count_count)).toBe(2);
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(2);

        // Find each trace by name and verify observation count
        const manyObsTrace = result.data.find(
          (row: any) => row.name === "trace-with-many-obs",
        );
        expect(Number(manyObsTrace.sum_observationsCount)).toBe(5);

        const fewObsTrace = result.data.find(
          (row: any) => row.name === "trace-with-few-obs",
        );
        expect(Number(fewObsTrace.sum_observationsCount)).toBe(2);
      });

      it("should use tags as dimension", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-with-tag-a", tags: ["tag-a", "common-tag"] },
          { name: "trace-with-tag-b", tags: ["tag-b", "common-tag"] },
          { name: "trace-with-tag-c", tags: ["tag-c"] },
          { name: "trace-with-no-tags", tags: [] },
        ];

        // Create traces with custom tags
        const traces = [];
        for (const data of tracesData) {
          traces.push(
            createTrace({
              project_id: projectId,
              name: data.name,
              tags: data.tags,
              timestamp: new Date().getTime(),
            }),
          );
        }
        await createTracesCh(traces);

        // Define query with a filter for tags using "any of" operator
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "tags" }],
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(4);
        // Expect one entry for all so index order does not matter
        expect(Number(result.data[0].count_count)).toBe(1);
      });

      it("should filter traces by tags using 'any of' operator", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-with-tag-a", tags: ["tag-a", "common-tag"] },
          { name: "trace-with-tag-b", tags: ["tag-b", "common-tag"] },
          { name: "trace-with-tag-c", tags: ["tag-c"] },
          { name: "trace-with-no-tags", tags: [] },
        ];

        // Create traces with custom tags
        const traces = [];
        for (const data of tracesData) {
          traces.push(
            createTrace({
              project_id: projectId,
              name: data.name,
              tags: data.tags,
              timestamp: new Date().getTime(),
            }),
          );
        }
        await createTracesCh(traces);

        // Define query with a filter for tags using "any of" operator
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "tags",
              operator: "any of",
              value: ["tag-a", "tag-b"],
              type: "arrayOptions",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return traces with tag-a or tag-b
        expect(result.data).toHaveLength(2);

        // Find and verify each trace
        const traceWithTagA = result.data.find(
          (row: any) => row.name === "trace-with-tag-a",
        );
        expect(traceWithTagA).toBeDefined();
        expect(Number(traceWithTagA.count_count)).toBe(1);

        const traceWithTagB = result.data.find(
          (row: any) => row.name === "trace-with-tag-b",
        );
        expect(traceWithTagB).toBeDefined();
        expect(Number(traceWithTagB.count_count)).toBe(1);
      });

      it("should filter traces by tags using 'all of' operator", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          {
            name: "trace-with-multiple-tags",
            tags: ["tag-a", "tag-b", "common-tag"],
          },
          { name: "trace-with-tag-a-only", tags: ["tag-a", "common-tag"] },
          { name: "trace-with-tag-b-only", tags: ["tag-b", "common-tag"] },
          { name: "trace-with-other-tags", tags: ["tag-c", "common-tag"] },
        ];

        // Create traces with custom tags
        const traces = [];
        for (const data of tracesData) {
          traces.push(
            createTrace({
              project_id: projectId,
              name: data.name,
              tags: data.tags,
              timestamp: new Date().getTime(),
            }),
          );
        }
        await createTracesCh(traces);

        // Define query with a filter for tags using "all of" operator
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "tags",
              operator: "all of",
              value: ["tag-a", "tag-b"],
              type: "arrayOptions",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return traces with both tag-a and tag-b
        expect(result.data).toHaveLength(1);

        // Verify the trace has both tags
        expect(result.data[0].name).toBe("trace-with-multiple-tags");
        expect(Number(result.data[0].count_count)).toBe(1);
      });

      it("should filter traces by tags using 'none of' operator", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          { name: "trace-with-tag-a", tags: ["tag-a", "common-tag"] },
          { name: "trace-with-tag-b", tags: ["tag-b", "common-tag"] },
          {
            name: "trace-with-other-tags",
            tags: ["tag-c", "tag-d", "common-tag"],
          },
          { name: "trace-with-no-tags", tags: [] },
        ];

        // Create traces with custom tags
        const traces = [];
        for (const data of tracesData) {
          traces.push(
            createTrace({
              project_id: projectId,
              name: data.name,
              tags: data.tags,
              timestamp: new Date().getTime(),
            }),
          );
        }
        await createTracesCh(traces);

        // Define query with a filter for tags using "none of" operator
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "tags",
              operator: "none of",
              value: ["tag-a", "tag-b"],
              type: "arrayOptions",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return traces without tag-a or tag-b
        expect(result.data).toHaveLength(2);

        // Find and verify each trace
        const traceWithOtherTags = result.data.find(
          (row: any) => row.name === "trace-with-other-tags",
        );
        expect(traceWithOtherTags).toBeDefined();
        expect(Number(traceWithOtherTags.count_count)).toBe(1);

        const traceWithNoTags = result.data.find(
          (row: any) => row.name === "trace-with-no-tags",
        );
        expect(traceWithNoTags).toBeDefined();
        expect(Number(traceWithNoTags.count_count)).toBe(1);
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(2);

        // Verify production environment data
        const prodEnv = result.data.find(
          (row: any) => row.environment === "production",
        );
        expect(Number(prodEnv.count_count)).toBe(2); // 2 traces
        expect(Number(prodEnv.sum_observationsCount)).toBe(7); // 3+4 observations

        // Verify development environment data
        const devEnv = result.data.find(
          (row: any) => row.environment === "development",
        );
        expect(Number(devEnv.count_count)).toBe(2); // 2 traces
        expect(Number(devEnv.sum_observationsCount)).toBe(3); // 2+1 observations
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(4); // 2 names × 2 environments = 4 combinations

        // Verify each combination
        const chatProd = result.data.find(
          (row: any) => row.name === "chat" && row.environment === "production",
        );
        expect(Number(chatProd.count_count)).toBe(1);

        const chatDev = result.data.find(
          (row: any) =>
            row.name === "chat" && row.environment === "development",
        );
        expect(Number(chatDev.count_count)).toBe(1);

        const embeddingsProd = result.data.find(
          (row: any) =>
            row.name === "embeddings" && row.environment === "production",
        );
        expect(Number(embeddingsProd.count_count)).toBe(1);

        const embeddingsDev = result.data.find(
          (row: any) =>
            row.name === "embeddings" && row.environment === "development",
        );
        expect(Number(embeddingsDev.count_count)).toBe(1);
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(1);

        const row = result.data[0];
        expect(row.name).toBe("multi-metric-test");
        expect(Number(row.count_count)).toBe(2); // 2 traces
        expect(Number(row.sum_observationsCount)).toBe(30); // 10+20 observations
        expect(row.avg_observationsCount).toBe(15); // (10+20)/2 average
        expect(Number(row.max_observationsCount)).toBe(20); // max is 20
        expect(Number(row.min_observationsCount)).toBe(10); // min is 10
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
        };

        // Execute query
        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause is present in the query
        expect(compiledQuery).toContain("ORDER BY name asc");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

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
          orderBy: [{ field: "sum_observationsCount", direction: "desc" }],
        };

        // Execute query
        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause is present in the query
        expect(compiledQuery).toContain("ORDER BY sum_observationsCount desc");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

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
            { field: "sum_observationsCount", direction: "desc" },
          ],
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause is present in the query with both fields
        expect(compiledQuery).toContain(
          "ORDER BY environment asc, sum_observationsCount desc",
        );

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);
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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause includes default time dimension ordering
        expect(compiledQuery).toContain("ORDER BY time_dimension asc");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Results should be ordered by time dimension (ascending)
        expect(result.data.length).toBeGreaterThan(0);

        // Convert time_dimension strings to Date objects for easier testing
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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause includes default metric ordering (descending)
        expect(compiledQuery).toContain("ORDER BY sum_observationsCount desc");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify ORDER BY clause includes default dimension ordering (ascending)
        expect(compiledQuery).toContain("ORDER BY name asc");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

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
              column: "name",
              operator: "starts with",
              value: "prefix-",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(1);
        expect(Number(result.data[0].count)).toBe(2); // default count metric should be used
      });

      it("should fill gaps in time series data with WITH FILL", async () => {
        // Setup
        const projectId = randomUUID();
        const now = new Date();

        // Create traces at specific dates with intentional gaps
        const day1 = new Date(now);
        day1.setDate(day1.getDate() - 3);
        day1.setHours(12, 0, 0, 0);

        const day3 = new Date(now);
        day3.setDate(day3.getDate() - 1);
        day3.setHours(12, 0, 0, 0);

        // Skip day2 to create a gap

        const traces = [
          // Day 1 trace
          createTrace({
            project_id: projectId,
            name: "trace-test",
            environment: "default",
            timestamp: day1.getTime(),
          }),
          // Day 3 trace
          createTrace({
            project_id: projectId,
            name: "trace-test",
            environment: "default",
            timestamp: day3.getTime(),
          }),
        ];

        await createTracesCh(traces);

        // Set from timestamp to day before day1 and to timestamp to day after day3
        const fromDate = new Date(day1);
        fromDate.setDate(fromDate.getDate() - 1);

        const toDate = new Date(day3);
        toDate.setDate(toDate.getDate() + 1);

        // Define query with time dimension and daily granularity
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "name",
              operator: "=",
              value: "trace-test",
              type: "string",
            },
          ],
          timeDimension: {
            granularity: "day", // Use day granularity for clear gap visibility
          },
          fromTimestamp: fromDate.toISOString(),
          toTimestamp: toDate.toISOString(),
          orderBy: null,
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify WITH FILL clause is present in the query
        expect(compiledQuery).toContain("WITH FILL");
        expect(compiledQuery).toContain("STEP INTERVAL 1 DAY");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Expected to have 3 days in the result (including the filled gap)
        expect(result.data.length).toBeGreaterThanOrEqual(3);

        // Convert time_dimension strings to Date objects for easier testing
        const resultDates = result.data.map((row: any) => {
          return {
            date: new Date(row.time_dimension),
            count: row.count_count ? parseInt(row.count_count) : 0,
          };
        });

        // Find day1 and day3 (where we have actual traces)
        const day1Row = resultDates.find(
          (row: any) =>
            row.date.getDate() === day1.getDate() &&
            row.date.getMonth() === day1.getMonth(),
        );

        const day3Row = resultDates.find(
          (row: any) =>
            row.date.getDate() === day3.getDate() &&
            row.date.getMonth() === day3.getMonth(),
        );

        // Find day2 (gap day that should be filled with zeros)
        const day2 = new Date(day1);
        day2.setDate(day2.getDate() + 1);

        const day2Row = resultDates.find(
          (row: any) =>
            row.date.getDate() === day2.getDate() &&
            row.date.getMonth() === day2.getMonth(),
        );

        // Assert actual data and filled gaps
        expect(day1Row?.count).toBe(1); // Actual trace for day 1
        expect(day3Row?.count).toBe(1); // Actual trace for day 3
        expect(day2Row).toBeDefined(); // Day 2 should exist (filled)
        expect(day2Row?.count).toBe(0); // Day 2 should be filled with 0

        // Check that all dates form a continuous sequence
        for (let i = 1; i < resultDates.length; i++) {
          const prevDate = resultDates[i - 1].date;
          const currDate = resultDates[i].date;

          // Difference should be approximately 1 day (86400000 ms)
          const diffMs = currDate.getTime() - prevDate.getTime();
          expect(diffMs).toBeGreaterThanOrEqual(86000000); // ~1 day with some tolerance
          expect(diffMs).toBeLessThanOrEqual(86800000); // ~1 day with some tolerance
        }
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

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
        expect(Number(chatCompletionToday?.count_count)).toBe(2); // 2 chat-completion traces today

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
        expect(Number(chatCompletionYesterday?.count_count)).toBe(1); // 1 chat-completion trace yesterday

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
        expect(Number(embeddingsToday?.count_count)).toBe(1); // 1 embeddings trace today

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
        expect(Number(embeddingsYesterday?.count_count)).toBe(1); // 1 embeddings trace yesterday

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
        expect(Number(embeddingsDayBefore?.count_count)).toBe(1); // 1 embeddings trace day before yesterday
      });

      it("should ensure time_dimension adheres to ISO8601 date format", async () => {
        // Setup
        const projectId = randomUUID();
        const now = new Date();

        // Create traces with specific timestamps
        const traces = [
          createTrace({
            project_id: projectId,
            name: "test-trace-1",
            environment: "production",
            timestamp: now.getTime(),
          }),
          createTrace({
            project_id: projectId,
            name: "test-trace-2",
            environment: "production",
            timestamp: now.getTime() - 86400000, // 1 day ago
          }),
        ];
        await createTracesCh(traces);

        // Define query with time dimension
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: {
            granularity: "hour",
          },
          fromTimestamp: new Date(now.getTime() - 172800000).toISOString(), // 2 days ago
          toTimestamp: now.toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Verify we have results
        expect(result.data.length).toBeGreaterThan(0);

        // Check that time_dimension values adhere to ISO8601 format
        for (const row of result.data) {
          expect(row).toHaveProperty("time_dimension");

          // ISO8601 regex pattern
          // This pattern matches ISO8601 dates in format: YYYY-MM-DD or YYYY-MM-DDThh:mm:ss.sssZ
          const iso8601Pattern =
            /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

          expect(row.time_dimension).toMatch(iso8601Pattern);

          // Verify that JavaScript Date constructor can parse the time_dimension
          const date = new Date(row.time_dimension);
          expect(date).toBeInstanceOf(Date);
          expect(date.toString()).not.toBe("Invalid Date");
        }
      });

      it("should filter traces by metadata correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const tracesData = [
          {
            name: "trace-with-metadata-1",
            metadata: { customer: "test1" },
          },
          {
            name: "trace-with-metadata-2",
            metadata: { customer: "test2" },
          },
          {
            name: "trace-without-metadata",
            metadata: undefined,
          },
        ];

        // Create traces with metadata
        const traces = [];
        for (const data of tracesData) {
          const trace = await createTrace({
            id: randomUUID(),
            name: data.name,
            project_id: projectId,
            metadata: data.metadata,
          });
          traces.push(trace);
        }

        await createTracesCh(traces);

        // Define query with metadata filter
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "metadata",
              operator: "contains",
              key: "customer",
              value: "test",
              type: "stringObject",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe("trace-with-metadata-1");
        expect(Number(result.data[0].count_count)).toBe(1);
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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery, parameters } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify SQL includes segment filter for NUMERIC types
        // Verify SQL includes segment filter for non-NUMERIC types
        expect(compiledQuery).toContain("position(scores_numeric.data_type, {");
        expect(compiledQuery).toContain(": String}) = 0");
        expect(Object.values(parameters)).toContain("CATEGORICAL");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(3); // accuracy, relevance, coherence

        // Check each score type
        const accuracyRow = result.data.find(
          (row: any) => row.name === "accuracy",
        );
        expect(Number(accuracyRow.count_count)).toBe(2);
        expect(parseFloat(accuracyRow.avg_value)).toBeCloseTo(0.885, 2); // (0.85 + 0.92) / 2
        expect(parseFloat(accuracyRow.min_value)).toBeCloseTo(0.85, 2);
        expect(parseFloat(accuracyRow.max_value)).toBeCloseTo(0.92, 2);

        const relevanceRow = result.data.find(
          (row: any) => row.name === "relevance",
        );
        expect(Number(relevanceRow.count_count)).toBe(2);
        expect(parseFloat(relevanceRow.avg_value)).toBeCloseTo(0.775, 2); // (0.75 + 0.80) / 2
        expect(parseFloat(relevanceRow.min_value)).toBeCloseTo(0.75, 2);
        expect(parseFloat(relevanceRow.max_value)).toBeCloseTo(0.8, 2);

        const coherenceRow = result.data.find(
          (row: any) => row.name === "coherence",
        );
        expect(Number(coherenceRow.count_count)).toBe(1);
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
              column: "source",
              operator: "=",
              value: "human",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return human scores
        expect(result.data).toHaveLength(1);
        expect(result.data[0].source).toBe("human");
        expect(Number(result.data[0].count_count)).toBe(1);
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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify joins included
        expect(compiledQuery).toContain("LEFT JOIN traces");
        expect(compiledQuery).toContain("LEFT JOIN observations");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should have 2 rows (1 for each trace/model combination)
        expect(result.data).toHaveLength(2);

        // Check qa trace with gpt-4
        const qaTraceRow = result.data.find(
          (row: any) =>
            row.traceName === "qa-trace" &&
            row.observationModelName === "gpt-4",
        );
        expect(Number(qaTraceRow.count_count)).toBe(2); // 2 scores (accuracy + relevance)
        expect(parseFloat(qaTraceRow.avg_value)).toBeCloseTo(0.875, 2); // (0.90 + 0.85) / 2

        // Check summarization trace with claude-3
        const summaryTraceRow = result.data.find(
          (row: any) =>
            row.traceName === "summarization-trace" &&
            row.observationModelName === "claude-3",
        );
        expect(Number(summaryTraceRow.count_count)).toBe(1); // 1 score (accuracy)
        expect(parseFloat(summaryTraceRow.avg_value)).toBeCloseTo(0.95, 2);
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
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "name",
              operator: "any of",
              value: ["is_hallucination", "is_helpful"],
              type: "stringOptions",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return true scores
        expect(result.data).toHaveLength(2);

        // Check which scores were true
        const isHallucination = result.data.find(
          (row: any) => row.name === "is_hallucination",
        );
        const isHelpful = result.data.find(
          (row: any) => row.name === "is_helpful",
        );

        expect(Number(isHallucination.count_count)).toBe(2);
        expect(Number(isHelpful.count_count)).toBe(2);
      });

      it("should filter scores-numeric by metadata correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const traceId = randomUUID();

        // Create a trace
        const trace = await createTrace({
          id: traceId,
          name: "trace-for-scores",
          project_id: projectId,
        });
        await createTracesCh([trace]);

        // Create scores with different metadata
        const scores = [
          await createTraceScore({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "score-premium",
            value: 0.95,
            metadata: { customer: "test1" },
          }),
          await createTraceScore({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "score-basic",
            value: 0.75,
            metadata: { customer: "test2" },
          }),
          await createTraceScore({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "score-no-metadata",
            value: 0.5,
            metadata: undefined,
          }),
        ];

        await createScoresCh(scores);

        // Define query with metadata filter for scores-numeric
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "value", aggregation: "avg" }],
          filters: [
            {
              column: "metadata",
              operator: "contains",
              key: "customer",
              value: "test",
              type: "stringObject",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe("score-premium");
        expect(parseFloat(result.data[0].avg_value)).toBeCloseTo(0.95);
      });

      it("LFE-4838: should filter scores-numeric by scoreName (fallback handling) without errors", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "score-name-test-trace",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create scores with different names
        const scores = [
          {
            name: "accuracy",
            traceId: trace.id,
            value: 0.9,
            dataType: "NUMERIC" as const,
          },
          {
            name: "relevance",
            traceId: trace.id,
            value: 0.85,
            dataType: "NUMERIC" as const,
          },
        ];

        await setupScores(projectId, scores);

        // Define query with filter using "scoreName" instead of "name"
        // This tests the fallback handling in queryBuilder.ts that handles column names ending with "Name"
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "scoreName", // Using scoreName instead of name to test the fallback logic
              operator: "=",
              value: "accuracy",
              type: "string",
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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify the compiled query contains filtering on name
        expect(compiledQuery).toContain("scores_numeric.name");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return scores with name "accuracy"
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("accuracy");
        expect(Number(result.data[0].count_count)).toBe(1);
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
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery, parameters } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify SQL includes segment filter for CATEGORICAL type
        expect(compiledQuery).toContain("data_type = {");
        expect(Object.values(parameters)).toContain("CATEGORICAL");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should have 4 rows for different name+value combinations
        expect(result.data).toHaveLength(4);

        // Check each combination
        const evaluationExcellent = result.data.find(
          (row: any) =>
            row.name === "evaluation" && row.stringValue === "excellent",
        );
        expect(Number(evaluationExcellent.count_count)).toBe(1);

        const evaluationGood = result.data.find(
          (row: any) => row.name === "evaluation" && row.stringValue === "good",
        );
        expect(Number(evaluationGood.count_count)).toBe(2);

        const categoryQuestion = result.data.find(
          (row: any) =>
            row.name === "category" && row.stringValue === "question",
        );
        expect(Number(categoryQuestion.count_count)).toBe(1);

        const categoryFactual = result.data.find(
          (row: any) =>
            row.name === "category" && row.stringValue === "factual",
        );
        expect(Number(categoryFactual.count_count)).toBe(1);
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
              column: "source",
              operator: "=",
              value: "auto",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return auto-source scores
        expect(result.data).toHaveLength(2);
        expect(
          result.data.every((row: any) => Number(row.count_count) === 1),
        ).toBe(true);

        // Check specific values
        const stringValues = result.data
          .map((row: any) => row.stringValue)
          .sort();
        expect(stringValues).toEqual(["command", "statement"]);
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
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(3);

        // Get results for each trace
        const gpt4Result = result.data.find(
          (row: any) => row.traceName === "gpt-4-completion",
        );
        const gpt35Result = result.data.find(
          (row: any) => row.traceName === "gpt-3.5-completion",
        );
        const claudeResult = result.data.find(
          (row: any) => row.traceName === "claude-completion",
        );

        // The p95 should be close to the 95th percentile value we generated
        // For GPT-4: the 95th percentile of values from 500-1400 would be around 1350ms
        expect(
          parseInt(gpt4Result.p95_timeToFirstToken),
        ).toBeGreaterThanOrEqual(1300);
        expect(parseInt(gpt4Result.p95_timeToFirstToken)).toBeLessThanOrEqual(
          1400,
        );

        // For GPT-3.5: the 95th percentile of values from 200-650 would be around 625ms
        expect(
          parseInt(gpt35Result.p95_timeToFirstToken),
        ).toBeGreaterThanOrEqual(600);
        expect(parseInt(gpt35Result.p95_timeToFirstToken)).toBeLessThanOrEqual(
          650,
        );

        // For Claude: the 95th percentile of values from 300-1200 would be around 1150ms
        expect(
          parseInt(claudeResult.p95_timeToFirstToken),
        ).toBeGreaterThanOrEqual(1100);
        expect(parseInt(claudeResult.p95_timeToFirstToken)).toBeLessThanOrEqual(
          1200,
        );
      });

      it("should return null streamingLatency and timeToFirstToken when completion_start_time is null", async () => {
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "null-completion-start-time-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        await createTracesCh([trace]);

        // Create observation with NULL completion_start_time
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 1000);
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "model-x",
          provided_model_name: "model-x",
          environment: "default",
          start_time: startTime.getTime(),
          completion_start_time: null, // explicitly null
          end_time: endTime.getTime(),
        });
        await createObservationsCh([observation]);

        // Build query selecting metrics per observation
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "timeToFirstToken", aggregation: "max" },
            { measure: "streamingLatency", aggregation: "max" },
          ],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(1);
        const row = result.data[0];
        expect(row.max_timeToFirstToken).toBeNull();
        expect(row.max_streamingLatency).toBeNull();
      });

      it("should return streamingLatency and timeToFirstToken when completion_start_time is present", async () => {
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "null-completion-start-time-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        await createTracesCh([trace]);

        // Create observation with NULL completion_start_time
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 1000);
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "model-x",
          provided_model_name: "model-x",
          environment: "default",
          start_time: startTime.getTime(),
          completion_start_time: startTime.getTime() + 200,
          end_time: endTime.getTime(),
        });
        await createObservationsCh([observation]);

        // Build query selecting metrics per observation
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "timeToFirstToken", aggregation: "max" },
            { measure: "streamingLatency", aggregation: "max" },
          ],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(1);
        const row = result.data[0];
        expect(Number(row.max_timeToFirstToken)).toBe(200);
        expect(Number(row.max_streamingLatency)).toBe(800);
      });

      it("should calculate tokens correctly", async () => {
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "null-completion-start-time-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        await createTracesCh([trace]);

        // Create observation with NULL completion_start_time
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 1000);
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "model-x",
          provided_model_name: "model-x",
          environment: "default",
          start_time: startTime.getTime(),
          completion_start_time: startTime.getTime() + 200,
          end_time: endTime.getTime(),
          usage_details: {
            input_tokens: 100,
            input_cache_tokens: 200,
            output_tokens: 300,
            output_cache_tokens: 400,
            total: 1000,
          },
        });
        await createObservationsCh([observation]);

        // Build query selecting metrics per observation
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "inputTokens", aggregation: "sum" },
            { measure: "outputTokens", aggregation: "sum" },
            { measure: "totalTokens", aggregation: "sum" },
            { measure: "outputTokensPerSecond", aggregation: "avg" },
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(1);
        const row = result.data[0];
        expect(Number(row.sum_inputTokens)).toBe(300);
        expect(Number(row.sum_outputTokens)).toBe(700);
        expect(Number(row.sum_totalTokens)).toBe(1000);
      });

      it("should filter observations by metadata correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const traceId = randomUUID();

        // Create a trace
        const trace = await createTrace({
          id: traceId,
          name: "trace-for-observations",
          project_id: projectId,
        });
        await createTracesCh([trace]);

        // Create observations with different metadata
        const observations = [
          await createObservation({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "observation-premium",
            metadata: { customer: "test1" },
          }),
          await createObservation({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "observation-basic",
            metadata: { customer: "test2" },
          }),
          await createObservation({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "observation-no-metadata",
            metadata: undefined,
          }),
        ];

        await createObservationsCh(observations);

        // Define query with metadata filter for observations
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "metadata",
              operator: "contains",
              key: "customer",
              value: "test",
              type: "stringObject",
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
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe("observation-basic");
        expect(Number(result.data[0].count_count)).toBe(1);
      });

      it("should generate histogram with custom bin count for cost distribution", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with observations that have different costs
        const traces = [];
        const observations = [];

        // Create trace for cost distribution test
        const trace = createTrace({
          project_id: projectId,
          name: "cost-distribution-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(trace);

        // Create observations with varying costs to test histogram with custom bins
        // Generate 30 observations with costs ranging from $0.001 to $1.00
        const costValues = [
          // Low cost cluster ($0.001-$0.01) - 10 observations
          ...Array.from({ length: 10 }, (_, i) => 0.001 + i * 0.001),
          // Medium cost cluster ($0.05-$0.20) - 10 observations
          ...Array.from({ length: 10 }, (_, i) => 0.05 + i * 0.015),
          // High cost cluster ($0.50-$1.00) - 10 observations
          ...Array.from({ length: 10 }, (_, i) => 0.5 + i * 0.05),
        ];

        costValues.forEach((cost, index) => {
          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: trace.id,
              type: "generation",
              name: `cost-observation-${index}`,
              provided_model_name: "gpt-4",
              environment: "default",
              start_time: new Date().getTime(),
              end_time: new Date().getTime() + 1000,
              total_cost: cost,
            }),
          );
        });

        await createTracesCh(traces);
        await createObservationsCh(observations);

        // Test histogram with custom bin count (20 bins)
        const customBinHistogramQuery: QueryType = {
          view: "observations",
          dimensions: [],
          metrics: [
            {
              measure: "totalCost",
              aggregation: "histogram",
            },
          ],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
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
          chartConfig: { type: "HISTOGRAM", bins: 20 }, // Custom bin count
        };

        // Execute histogram query with custom bins
        const queryBuilder = new QueryBuilder(
          customBinHistogramQuery.chartConfig,
        );
        const { query: compiledQuery } = await queryBuilder.build(
          customBinHistogramQuery,
          projectId,
        );

        // Verify the generated SQL contains histogram function with custom bins
        expect(compiledQuery).toContain("histogram(20)");
        expect(compiledQuery).toContain("total_cost");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, customBinHistogramQuery);

        // Assert histogram results with custom bins
        expect(result.data).toHaveLength(1);
        const histogramData = result.data[0].histogram_totalCost;

        // ClickHouse histogram returns array of tuples [lower, upper, height]
        expect(Array.isArray(histogramData)).toBe(true);
        expect(histogramData.length).toBeGreaterThan(0);
        expect(histogramData.length).toBeLessThanOrEqual(20); // Should not exceed requested bins

        // Verify histogram tuple structure and cost ranges
        histogramData.forEach((bin: [number, number, number]) => {
          expect(Array.isArray(bin)).toBe(true);
          expect(bin).toHaveLength(3);
          const [lower, upper, height] = bin;
          expect(typeof lower).toBe("number");
          expect(typeof upper).toBe("number");
          expect(typeof height).toBe("number");
          expect(lower).toBeLessThan(upper);
          expect(height).toBeGreaterThan(0);
          // Cost values should be in expected range
          expect(lower).toBeGreaterThanOrEqual(0);
          expect(upper).toBeLessThanOrEqual(1.1); // Allow some margin for ClickHouse binning
        });

        // Verify total count matches our data
        const totalCount = histogramData.reduce(
          (sum: number, bin: [number, number, number]) => sum + bin[2],
          0,
        );
        expect(totalCount).toBe(30); // Should match our 30 observations
      });

      it("should apply row_limit to query results", async () => {
        // Setup
        const projectId = randomUUID();

        // Create a trace with multiple observations
        const trace = createTrace({
          project_id: projectId,
          name: "test-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });

        // Create 10 observations with different names to test row limiting
        const observations = Array.from({ length: 10 }, (_, i) =>
          createObservation({
            project_id: projectId,
            trace_id: trace.id,
            type: "generation",
            name: `observation-${i}`,
            environment: "default",
            start_time: new Date().getTime() + i * 1000,
          }),
        );

        await createTracesCh([trace]);
        await createObservationsCh(observations);

        // Query with row_limit
        const query: QueryType = {
          view: "observations",
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
          orderBy: [{ field: "name", direction: "asc" }],
          chartConfig: { type: "TABLE", row_limit: 5 },
        };

        // Verify the generated SQL contains LIMIT clause
        const queryBuilder = new QueryBuilder(query.chartConfig);
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );
        expect(compiledQuery).toContain("LIMIT 5");

        // Execute query and verify row limit is applied
        const result = await executeQuery(projectId, query);

        // Should return only 5 rows despite having 10 observations
        expect(result).toHaveLength(5);
      });

      it("should format startTimeMonth dimension correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const trace = createTrace({
          project_id: projectId,
          name: "test-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });

        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "test-observation",
          environment: "default",
          start_time: new Date("2024-03-15T10:00:00Z").getTime(),
        });

        await createTracesCh([trace]);
        await createObservationsCh([observation]);

        // Query with startTimeMonth dimension
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "startTimeMonth" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2024-03-01T00:00:00.000Z",
          toTimestamp: "2024-03-31T23:59:59.999Z",
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Verify the month is formatted as YYYY-MM
        expect(result.data).toHaveLength(1);
        expect(result.data[0].startTimeMonth).toBe("2024-03");
      });
    });
  });

  describe("single-level SELECT optimization", () => {
    it("should produce same results with and without optimization for observations view", async () => {
      const projectId = randomUUID();

      // Create test data
      const traces = [
        createTrace({
          project_id: projectId,
          name: "test-trace-1",
          timestamp: new Date().getTime(),
        }),
        createTrace({
          project_id: projectId,
          name: "test-trace-2",
          timestamp: new Date().getTime(),
        }),
      ];
      await createTracesCh(traces);

      const observations = [
        createObservation({
          project_id: projectId,
          trace_id: traces[0].id,
          name: "obs-1",
          start_time: new Date().getTime(),
          end_time: new Date().getTime() + 1000,
        }),
        createObservation({
          project_id: projectId,
          trace_id: traces[1].id,
          name: "obs-2",
          start_time: new Date().getTime(),
          end_time: new Date().getTime() + 2000,
        }),
      ];
      await createObservationsCh(observations);

      // Query with measures that support optimization (all have aggs)
      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "latency", aggregation: "avg" },
          { measure: "latency", aggregation: "max" },
          { measure: "totalCost", aggregation: "sum" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: [{ field: "name", direction: "asc" }],
      };

      // Execute without optimization
      const resultWithoutOpt = await executeQuery(
        projectId,
        query,
        "v1",
        false,
      );

      // Execute with optimization
      const resultWithOpt = await executeQuery(projectId, query, "v1", true);

      // Results should be identical
      expect(resultWithOpt).toHaveLength(resultWithoutOpt.length);
      expect(resultWithOpt).toEqual(resultWithoutOpt);
    });

    it("should NOT optimize when measure without aggs is included (countScores)", async () => {
      const projectId = randomUUID();

      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "latency", aggregation: "avg" }, // Has aggs
          { measure: "countScores", aggregation: "sum" }, // NO aggs - relation table measure
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      };

      // Build query with optimization enabled
      const builder = new QueryBuilder(undefined, "v1");
      const { query: compiledQuery } = await builder.build(
        query,
        projectId,
        true,
      );

      // Should use two-level query (because countScores doesn't have aggs)
      expect(compiledQuery).toContain("FROM (");
      expect(compiledQuery.match(/GROUP BY/g)?.length).toBe(2); // Two GROUP BY clauses

      // Should have the JOIN
      expect(compiledQuery).toContain("LEFT JOIN scores");
    });

    it("should handle complex multi-aggregation measure (tokensPerSecond)", async () => {
      const projectId = randomUUID();

      // Create observation with token usage
      const observations = [
        createObservation({
          project_id: projectId,
          trace_id: randomUUID(),
          name: "test-obs",
          start_time: new Date().getTime(),
          end_time: new Date().getTime() + 1000,
          usage_details: { total: 100 },
        }),
      ];
      await createObservationsCh(observations);

      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "tokensPerSecond", aggregation: "avg" }, // Uses BOTH sumMap AND any
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      };

      const builder = new QueryBuilder(undefined, "v1");
      const { query: compiledQuery } = await builder.build(
        query,
        projectId,
        true,
      );

      // Verify template substitution for multiple aggs was stripped
      expect(compiledQuery).not.toContain("${agg"); // No templates left

      // Verify results match
      const resultWithOpt = await executeQuery(projectId, query, "v1", true);
      const resultWithoutOpt = await executeQuery(
        projectId,
        query,
        "v1",
        false,
      );
      expect(resultWithOpt).toEqual(resultWithoutOpt);
    });

    it("should verify SQL query structure with optimization enabled", async () => {
      const projectId = randomUUID();

      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "latency", aggregation: "avg" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      };

      const builder = new QueryBuilder(undefined, "v1");
      const { query: compiledQuery } = await builder.build(
        query,
        projectId,
        true,
      );

      // Verify single-level structure
      expect(compiledQuery).not.toContain("FROM ("); // No subquery
      expect(compiledQuery.match(/GROUP BY/g)?.length).toBe(1); // Only one GROUP BY

      // Verify @@AGG1@@, @@AGG2@@, etc. templates were substituted or removed
      expect(compiledQuery).not.toContain("@@AGG");

      // Verify direct aggregation (should have date_diff without template wrappers)
      expect(compiledQuery).toContain("date_diff");
    });

    it("should handle totalCost measure correctly in both modes", async () => {
      const projectId = randomUUID();

      // Create observations with cost data
      const observations = [
        createObservation({
          project_id: projectId,
          trace_id: randomUUID(),
          name: "obs-1",
          start_time: new Date().getTime(),
          total_cost: 0.05,
        }),
        createObservation({
          project_id: projectId,
          trace_id: randomUUID(),
          name: "obs-2",
          start_time: new Date().getTime(),
          total_cost: 0.15,
        }),
      ];
      await createObservationsCh(observations);

      const query: QueryType = {
        view: "observations",
        dimensions: [],
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "totalCost", aggregation: "avg" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      };

      // Verify results match between optimized and non-optimized
      const resultWithOpt = await executeQuery(projectId, query, "v1", true);
      const resultWithoutOpt = await executeQuery(
        projectId,
        query,
        "v1",
        false,
      );

      expect(resultWithOpt).toEqual(resultWithoutOpt);
      expect(resultWithOpt).toHaveLength(1);
      // Should have sum (0.05 + 0.15 = 0.20) and avg (0.10)
      expect(Number(resultWithOpt[0].sum_totalCost)).toBeCloseTo(0.2, 2);
      expect(Number(resultWithOpt[0].avg_totalCost)).toBeCloseTo(0.1, 2);
    });

    it("should optimize queries with dimensions from relation tables", async () => {
      const projectId = randomUUID();

      // Create traces
      const traces = [
        createTrace({
          project_id: projectId,
          name: "trace-alpha",
          timestamp: new Date().getTime(),
        }),
        createTrace({
          project_id: projectId,
          name: "trace-beta",
          timestamp: new Date().getTime(),
        }),
      ];
      await createTracesCh(traces);

      // Create observations linked to traces
      const observations = [
        createObservation({
          project_id: projectId,
          trace_id: traces[0].id,
          name: "obs-1",
          start_time: new Date().getTime(),
          end_time: new Date().getTime() + 1000,
        }),
        createObservation({
          project_id: projectId,
          trace_id: traces[1].id,
          name: "obs-2",
          start_time: new Date().getTime(),
          end_time: new Date().getTime() + 2000,
        }),
      ];
      await createObservationsCh(observations);

      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "traceName" }], // Dimension from relation table!
        metrics: [{ measure: "latency", aggregation: "avg" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      };

      // Execute with optimization
      const resultWithOpt = await executeQuery(projectId, query, "v1", true);
      const resultWithoutOpt = await executeQuery(
        projectId,
        query,
        "v1",
        false,
      );

      // Results should match
      expect(resultWithOpt).toEqual(resultWithoutOpt);
      expect(resultWithOpt).toHaveLength(2);

      // Verify we got the trace names
      const traceNames = resultWithOpt.map((r) => r.traceName).sort();
      expect(traceNames).toEqual(["trace-alpha", "trace-beta"]);
    });

    it("should optimize queries with computed dimensions like startTimeMonth", async () => {
      const projectId = randomUUID();

      // Create observations in March 2024
      const marchDate = new Date("2024-03-15T12:00:00.000Z");
      const observations = [
        createObservation({
          project_id: projectId,
          trace_id: randomUUID(),
          name: "obs-march",
          start_time: marchDate.getTime(),
        }),
      ];
      await createObservationsCh(observations);

      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "startTimeMonth" }], // Computed dimension!
        metrics: [{ measure: "latency", aggregation: "avg" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2024-03-01T00:00:00.000Z",
        toTimestamp: "2024-03-31T23:59:59.999Z",
        orderBy: null,
      };

      // Execute with optimization
      const resultWithOpt = await executeQuery(projectId, query, "v1", true);
      const resultWithoutOpt = await executeQuery(
        projectId,
        query,
        "v1",
        false,
      );

      // Results should match
      expect(resultWithOpt).toEqual(resultWithoutOpt);
      expect(resultWithOpt).toHaveLength(1);
      expect(resultWithOpt[0].startTimeMonth).toBe("2024-03");
    });

    it("should produce correct results with sum aggregation on count measure", async () => {
      const projectId = randomUUID();

      // Create traces
      const traces = Array.from({ length: 2 }, (_, i) =>
        createTrace({
          project_id: projectId,
          name: `trace-${i}`,
          timestamp: new Date().getTime(),
        }),
      );
      await createTracesCh(traces);

      // Create 5 observations: 3 for trace-0, 2 for trace-1
      const observationsPerTrace = [3, 2];
      const observations = traces.flatMap((trace, traceIdx) =>
        Array.from({ length: observationsPerTrace[traceIdx] }, (_, obsIdx) =>
          createObservation({
            project_id: projectId,
            trace_id: trace.id,
            name: `obs-${traceIdx}-${obsIdx}`,
            start_time: new Date().getTime(),
          }),
        ),
      );
      await createObservationsCh(observations);

      // Query with sum on count measure (this was producing incorrect results)
      const query: QueryType = {
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "sum" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      };

      // Execute without optimization (two-level query)
      const resultWithoutOpt = await executeQuery(
        projectId,
        query,
        "v1",
        false,
      );

      // Execute with optimization (single-level query)
      const resultWithOpt = await executeQuery(projectId, query, "v1", true);

      // Both should return sum of counts = 5 (total observations)
      expect(resultWithoutOpt).toHaveLength(1);
      expect(resultWithOpt).toHaveLength(1);
      expect(Number(resultWithoutOpt[0].sum_count)).toBe(5);
      expect(Number(resultWithOpt[0].sum_count)).toBe(5);
      expect(resultWithOpt).toEqual(resultWithoutOpt);
    });
  });

  describe("pairExpand map expansion (v2)", () => {
    const isEventsTableV2Enabled =
      env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true" ? it : it.skip;
    let hasLegacyEventsTable = false;

    const maybeItWithEventsTable = (
      name: string,
      testFn: () => Promise<void>,
    ): void => {
      isEventsTableV2Enabled(name, async () => {
        if (!hasLegacyEventsTable) return;
        await testFn();
      });
    };

    beforeAll(async () => {
      if (env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS !== "true") return;

      try {
        const result = await clickhouseClient().query({
          query: "EXISTS TABLE default.events",
          format: "TabSeparated",
        });
        hasLegacyEventsTable = (await result.text()).trim() === "1";
      } catch {
        hasLegacyEventsTable = false;
      }
    });

    it("should emit ARRAY JOIN clause for pairExpand dimensions", async () => {
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");
      const { query: sql } = await builder.build(
        {
          view: "observations",
          dimensions: [{ field: "costType" }],
          metrics: [{ measure: "costByType", aggregation: "sum" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
          toTimestamp: new Date(Date.now() + 86400000).toISOString(),
          orderBy: null,
        },
        projectId,
        true,
      );

      expect(sql).toContain("ARRAY JOIN");
      expect(sql).toContain(
        "mapKeys(events_observations.cost_details) AS costType",
      );
      expect(sql).toContain(
        "mapValues(events_observations.cost_details) AS cost_value",
      );
      // ARRAY JOIN must appear before WHERE
      expect(sql.indexOf("ARRAY JOIN")).toBeLessThan(sql.indexOf("WHERE"));
      // No inline arrayJoin() function call — must use clause form
      expect(sql).not.toMatch(/arrayJoin\(mapKeys/);
    });

    maybeItWithEventsTable(
      "should aggregate cost_details by type correctly",
      async () => {
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10, output: 20, total: 30 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 5, output: 15, total: 20 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        expect(result).toHaveLength(3);

        const inputRow = result.find((r) => r["costType"] === "input");
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(15, 2); // 10 + 5

        const outputRow = result.find((r) => r["costType"] === "output");
        expect(Number(outputRow?.["sum_costByType"])).toBeCloseTo(35, 2); // 20 + 15

        const totalRow = result.find((r) => r["costType"] === "total");
        expect(Number(totalRow?.["sum_costByType"])).toBeCloseTo(50, 2); // 30 + 20
      },
    );

    maybeItWithEventsTable(
      "should aggregate usage_details by type correctly",
      async () => {
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            usage_details: { input: 100, output: 200, total: 300 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            usage_details: { input: 50, output: 75, total: 125 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "usageType" }],
            metrics: [{ measure: "usageByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        expect(result).toHaveLength(3);

        const inputRow = result.find((r) => r["usageType"] === "input");
        expect(Number(inputRow?.["sum_usageByType"])).toBe(150); // 100 + 50

        const outputRow = result.find((r) => r["usageType"] === "output");
        expect(Number(outputRow?.["sum_usageByType"])).toBe(275); // 200 + 75
      },
    );

    maybeItWithEventsTable(
      "should produce timeseries with costType dimension and WITH FILL",
      async () => {
        const projectId = randomUUID();
        const now = new Date();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10, output: 20 },
            start_time: now.getTime() * 1000,
          }),
        ];
        await createEventsCh(events);

        const builder = new QueryBuilder(undefined, "v2");
        const { query: sql } = await builder.build(
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: { granularity: "day" },
            fromTimestamp: new Date(now.getTime() - 2 * 86400000).toISOString(),
            toTimestamp: new Date(now.getTime() + 86400000).toISOString(),
            orderBy: null,
          },
          projectId,
          true,
        );

        expect(sql).toContain("WITH FILL");
        expect(sql).toContain("time_dimension");
        // GROUP BY parts may be newline-separated in the generated SQL
        expect(sql).toContain("GROUP BY costType");
        expect(sql).toMatch(/GROUP BY costType[\s,]+time_dimension/);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: { granularity: "day" },
            fromTimestamp: new Date(now.getTime() - 2 * 86400000).toISOString(),
            toTimestamp: new Date(now.getTime() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("time_dimension");
        expect(result[0]).toHaveProperty("costType");
        expect(result[0]).toHaveProperty("sum_costByType");
      },
    );

    maybeItWithEventsTable(
      "should respect type filter with pairExpand dimensions",
      async () => {
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "SPAN",
            cost_details: { input: 999 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [
              {
                column: "type",
                operator: "=",
                value: "GENERATION",
                type: "string",
              },
            ],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        const inputRow = result.find((r) => r["costType"] === "input");
        // Only GENERATION row contributes: 10, not 999
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(10, 2);
      },
    );

    maybeItWithEventsTable(
      "should aggregate cost_details by type correctly via two-level query path",
      async () => {
        // Forces the two-level path by passing useSingleLevelOptimization=false.
        // Verifies that the bare alias reference in buildInnerDimensionsPart
        // (not any()) is correct when the pairExpand dim is in GROUP BY.
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 10, output: 20, total: 30 },
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 5, output: 15, total: 20 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [{ field: "costType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          false, // force two-level path
        );

        expect(result).toHaveLength(3);

        const inputRow = result.find((r) => r["costType"] === "input");
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(15, 2); // 10 + 5

        const outputRow = result.find((r) => r["costType"] === "output");
        expect(Number(outputRow?.["sum_costByType"])).toBeCloseTo(35, 2); // 20 + 15

        const totalRow = result.find((r) => r["costType"] === "total");
        expect(Number(totalRow?.["sum_costByType"])).toBeCloseTo(50, 2); // 30 + 20
      },
    );

    maybeItWithEventsTable(
      "should auto-include costType dimension when only costByType measure is requested",
      async () => {
        // Verifies requiresDimension: the query builder must inject the costType
        // dimension automatically so the ARRAY JOIN is emitted and cost_value is in scope.
        const projectId = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            type: "GENERATION",
            cost_details: { input: 7, output: 3 },
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        // No costType dimension requested — the builder should add it automatically.
        const result = await executeQuery(
          projectId,
          {
            view: "observations",
            dimensions: [], // intentionally empty
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
          true,
        );

        // costType should appear in results even though it was not explicitly requested
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("costType");

        const inputRow = result.find((r) => r["costType"] === "input");
        expect(Number(inputRow?.["sum_costByType"])).toBeCloseTo(7, 2);

        const outputRow = result.find((r) => r["costType"] === "output");
        expect(Number(outputRow?.["sum_costByType"])).toBeCloseTo(3, 2);
      },
    );

    it("should throw when multiple pairExpand dimensions are requested directly", async () => {
      // Two separate ARRAY JOIN clauses create a cartesian product in ClickHouse.
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");

      await expect(
        builder.build(
          {
            view: "observations",
            dimensions: [{ field: "costType" }, { field: "usageType" }],
            metrics: [{ measure: "costByType", aggregation: "sum" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          projectId,
          true,
        ),
      ).rejects.toThrow("Only one pairExpand dimension is supported per query");
    });

    it("should throw when both costByType and usageByType measures are requested (auto-inject creates two pairExpand dims)", async () => {
      // Each measure auto-injects its required pairExpand dimension via requiresDimension.
      // Requesting both triggers the multi-pairExpand guard.
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");

      await expect(
        builder.build(
          {
            view: "observations",
            dimensions: [],
            metrics: [
              { measure: "costByType", aggregation: "sum" },
              { measure: "usageByType", aggregation: "sum" },
            ],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          projectId,
          true,
        ),
      ).rejects.toThrow("Only one pairExpand dimension is supported per query");
    });
  });
});

describe("validateQuery", () => {
  const baseQuery = {
    view: "observations",
    dimensions: [],
    metrics: [{ measure: "totalCost", aggregation: "sum" }],
    filters: [],
    timeDimension: null,
    fromTimestamp: "2025-01-01T00:00:00.000Z",
    toTimestamp: "2025-03-01T00:00:00.000Z",
    orderBy: null,
  } as QueryType;

  it("should return valid for queries without high cardinality dimensions", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "name" }], // name is not high cardinality
    };

    const result = validateQuery(query, "v2");

    expect(result).toEqual({ valid: true });
  });

  it("should return invalid when high cardinality dimension is used without row_limit", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }], // high cardinality
      orderBy: [{ field: "sum_totalCost", direction: "desc" }],
      // no chartConfig.row_limit
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension(s) 'traceId'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "require both 'config.row_limit' and 'orderBy' with direction 'desc'",
    );
  });

  it("should return invalid when high cardinality dimension is used without ORDER DESC", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "userId" }], // high cardinality
      chartConfig: { type: "table", row_limit: 10 },
      orderBy: [{ field: "sum_totalCost", direction: "asc" }], // asc, not desc
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension(s) 'userId'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "require both 'config.row_limit' and 'orderBy' with direction 'desc'",
    );
  });

  it("should return invalid when ORDER BY desc field is not a measure in the query", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }], // high cardinality
      chartConfig: { type: "table", row_limit: 10 },
      orderBy: [{ field: "sum_latency", direction: "desc" }], // latency is not in metrics
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension(s) 'traceId'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "'sum_latency'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "not a measure in this query",
    );
  });

  it("should return invalid when ORDER BY desc field is a dimension (not a measure)", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }, { field: "name" }], // traceId is high cardinality
      chartConfig: { type: "table", row_limit: 10 },
      orderBy: [{ field: "name", direction: "desc" }], // name is a dimension, not a measure
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension(s) 'traceId'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "'name'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "not a measure in this query",
    );
  });

  it("should return invalid for multiple high cardinality dimensions without required config", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }, { field: "sessionId" }], // both high cardinality
      // missing row_limit and orderBy desc
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "traceId",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "sessionId",
    );
  });

  it("should support public API 'config' field name for row_limit", () => {
    // Test that "config" field works (used by public API) vs "chartConfig" (used internally)
    const query = {
      view: "observations",
      dimensions: [{ field: "traceId" }], // high cardinality
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
      toTimestamp: new Date(Date.now() + 86400000).toISOString(),
      orderBy: [{ field: "totalCost", direction: "desc" }],
      config: { type: "table", row_limit: 10 }, // Public API uses "config"
    } as unknown as QueryType;

    const result = validateQuery(query, "v2");

    expect(result).toEqual({ valid: true });
  });

  it("should return valid for count-only metrics with high cardinality", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }],
      metrics: [{ measure: "count", aggregation: "count" }], // count-only
      orderBy: [{ field: "count", direction: "desc" }],
      chartConfig: { type: "table", row_limit: 10 },
    };

    const result = validateQuery(query, "v2");

    expect(result).toEqual({ valid: true });
  });
});
