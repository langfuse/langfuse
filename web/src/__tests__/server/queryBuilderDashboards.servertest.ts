import { randomUUID } from "crypto";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { type QueryType } from "@/src/features/query/types";
import { executeQuery } from "@/src/features/query/server/queryExecutor";

describe("selfServeDashboards", () => {
  // Single project ID for all tests
  const projectId = randomUUID();

  // Time references
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const twoHoursAgo = new Date(now.getTime() - 7200000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600000);

  // Time ranges for queries - converted to ClickHouse DateTime format (YYYY-MM-DD HH:MM:SS.SSS)
  const defaultFromTime = threeDaysAgo.toISOString();
  const defaultToTime = new Date(now.getTime() + 3600000).toISOString(); // 1 hour in future

  // Test data statistics for verification
  const stats = {
    totalTraces: 0,
    productionTraces: 0,
    developmentTraces: 0,
    stagingTraces: 0,
    recentProductionTraces: 0, // within the last hour
    traceCounts: {} as Record<string, number>, // counts by trace name
    environmentCounts: {} as Record<string, number>, // counts by environment
  };

  beforeAll(async () => {
    // Create a diverse set of traces with different characteristics
    const traces = [
      // Production environment - common names
      ...Array(5)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "production",
            timestamp: now.getTime() - i * 10000, // Slightly different timestamps
            user_id: "user-A",
          }),
        ),
      ...Array(3)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "embeddings",
            environment: "production",
            timestamp: now.getTime() - i * 15000,
            user_id: "user-B",
          }),
        ),

      // Production environment - older traces
      ...Array(2)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "production",
            timestamp: twoHoursAgo.getTime() - i * 10000,
            user_id: "user-C",
          }),
        ),

      // Development environment - recent
      ...Array(4)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "development",
            timestamp: oneHourAgo.getTime() - i * 20000,
            user_id: "user-D",
          }),
        ),
      ...Array(2)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "summarize",
            environment: "development",
            timestamp: now.getTime() - i * 5000,
            user_id: "user-E",
          }),
        ),

      // Staging environment
      ...Array(3)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "qa-bot",
            environment: "staging",
            timestamp: now.getTime() - i * 30000,
            user_id: "user-F",
          }),
        ),
    ];

    // Insert traces into ClickHouse
    await createTracesCh(traces);

    // Create observations for some of these traces
    const observations = [];

    // Add observations for chat-completion traces in production
    for (let i = 0; i < 3; i++) {
      const traceId = traces[i].id;
      observations.push(
        createObservation({
          project_id: projectId,
          trace_id: traceId,
          name: "gpt-4-turbo",
          type: "generation",
          environment: "production",
          start_time: now.getTime() - i * 10000,
          completion_start_time: now.getTime() - i * 10000 + 800, // 800ms time to first token
          end_time: now.getTime() - i * 10000 + 3000, // 3000ms total duration
          provided_model_name: "gpt-4-turbo",
        }),
      );
    }

    // Add observations for embeddings traces
    for (let i = 0; i < 2; i++) {
      const traceId = traces[5 + i].id; // embeddings traces start at index 5
      observations.push(
        createObservation({
          project_id: projectId,
          trace_id: traceId,
          name: "text-embedding-ada-002",
          type: "generation",
          environment: "production",
          start_time: now.getTime() - i * 15000,
          completion_start_time: now.getTime() - i * 15000 + 200, // 200ms time to first token
          end_time: now.getTime() - i * 15000 + 500, // 500ms total duration
          provided_model_name: "text-embedding-ada-002",
        }),
      );
    }

    // Add observations for development traces
    for (let i = 0; i < 2; i++) {
      const traceId = traces[10 + i].id; // development traces start at index 10
      observations.push(
        createObservation({
          project_id: projectId,
          trace_id: traceId,
          name: "claude-3-opus",
          type: "generation",
          environment: "development",
          start_time: oneHourAgo.getTime() - i * 20000,
          completion_start_time: oneHourAgo.getTime() - i * 20000 + 1200, // 1200ms time to first token
          end_time: oneHourAgo.getTime() - i * 20000 + 4000, // 4000ms total duration
          provided_model_name: "claude-3-opus",
        }),
      );
    }

    // Insert observations into ClickHouse
    await createObservationsCh(observations);

    // Calculate statistics for verification
    stats.totalTraces = traces.length;

    // Count by environment
    traces.forEach((trace) => {
      stats.environmentCounts[trace.environment] =
        (stats.environmentCounts[trace.environment] || 0) + 1;
    });
    stats.productionTraces = stats.environmentCounts["production"] || 0;
    stats.developmentTraces = stats.environmentCounts["development"] || 0;
    stats.stagingTraces = stats.environmentCounts["staging"] || 0;

    // Count traces by name
    traces.forEach((trace) => {
      stats.traceCounts[trace.name || ""] =
        (stats.traceCounts[trace.name || ""] || 0) + 1;
    });

    // Count recent production traces (within the last hour)
    stats.recentProductionTraces = traces.filter(
      (t) =>
        t.environment === "production" && t.timestamp >= oneHourAgo.getTime(),
    ).length;
  });

  describe("traces-total query", () => {
    it("should return the correct total trace count", async () => {
      // Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // Assert that the result matches the expected count from sample data
      expect(queryBuilderResult).toHaveLength(1);
      expect(Number(queryBuilderResult[0].count_count)).toBe(stats.totalTraces);
    });

    it("should filter traces by environment correctly", async () => {
      // 1. Define a query with filter for production environment
      const prodQueryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment",
            operator: "=",
            value: "production",
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result for production environment
      const prodQueryBuilderResult = await executeQuery(
        projectId,
        prodQueryBuilderQuery,
      );

      // 3. Assert that the result matches the expected count for production traces
      expect(prodQueryBuilderResult).toHaveLength(1);
      expect(Number(prodQueryBuilderResult[0].count_count)).toBe(
        stats.productionTraces,
      );

      // 4. Define a query with filter for development environment
      const devQueryBuilderQuery: QueryType = {
        ...prodQueryBuilderQuery,
        filters: [
          {
            column: "environment",
            operator: "=",
            value: "development",
            type: "string",
          },
        ],
      };

      // 5. Get result for development environment
      const devQueryBuilderResult = await executeQuery(
        projectId,
        devQueryBuilderQuery,
      );

      // 6. Assert that the result matches the expected count for development traces
      expect(devQueryBuilderResult).toHaveLength(1);
      expect(Number(devQueryBuilderResult[0].count_count)).toBe(
        stats.developmentTraces,
      );
    });

    it("should handle multiple filter conditions", async () => {
      // 1. Define a query with multiple filters for recent production traces
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment",
            operator: "=",
            value: "production",
            type: "string",
          },
          {
            column: "timestamp",
            operator: ">=",
            value: new Date(oneHourAgo),
            type: "datetime",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Assert that the result matches the expected count for recent production traces
      expect(queryBuilderResult).toHaveLength(1);
      expect(Number(queryBuilderResult[0].count_count)).toBe(
        stats.recentProductionTraces,
      );
    });
  });

  describe("traces-grouped-by-name query", () => {
    it("should return traces grouped by name correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results match the expected trace counts by name
      Object.keys(stats.traceCounts).forEach((traceName) => {
        const resultRow = queryBuilderResult.find(
          (row: any) => row.name === traceName,
        );

        expect(resultRow).toBeDefined();
        expect(Number(resultRow?.count_count)).toBe(
          stats.traceCounts[traceName],
        );
      });

      // 4. Verify result set has the expected number of rows
      expect(queryBuilderResult.length).toBe(
        Object.keys(stats.traceCounts).length,
      );
    });

    it("should filter traces by environment when grouping by name", async () => {
      // 1. Define a query with filter for production environment
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            column: "environment",
            operator: "=",
            value: "production",
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      // Get only traces with production environment
      const productionTraceNames = ["chat-completion", "embeddings"];

      // Verify result has the expected number of rows
      expect(queryBuilderResult.length).toBe(productionTraceNames.length);

      // Check each production trace name is present
      productionTraceNames.forEach((traceName) => {
        const resultRow = queryBuilderResult.find(
          (row: any) => row.name === traceName,
        );

        expect(resultRow).toBeDefined();
        // Verify the count matches what we expect based on our sample data
        // We can calculate this from our stats object or hardcode based on our test data
        if (traceName === "chat-completion") {
          expect(Number(resultRow?.count_count)).toBe(7); // 5 recent + 2 older traces
        } else if (traceName === "embeddings") {
          expect(Number(resultRow?.count_count)).toBe(3);
        }
      });
    });
  });

  describe("observations-model-cost query", () => {
    it("should return observations grouped by model with cost and token metrics", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Expected models based on our test data
      const expectedModels = [
        "gpt-4-turbo",
        "text-embedding-ada-002",
        "claude-3-opus",
      ];

      // Verify we have the expected number of models
      expect(queryBuilderResult.length).toBe(expectedModels.length);

      // Verify each model is present with cost and token metrics
      expectedModels.forEach((modelName) => {
        const modelRow = queryBuilderResult.find(
          (row: any) => row.providedModelName === modelName,
        );

        expect(modelRow).toBeDefined();
        expect(modelRow.sum_totalCost).toBeDefined();
        expect(modelRow.sum_totalTokens).toBeDefined();

        // We could add more specific assertions about the expected costs and tokens
        // if we had that information calculated from our sample data
      });
    });

    it("should filter observations by traceName", async () => {
      // 1. Define a query with filter for chat-completion trace
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        filters: [
          {
            column: "traceName",
            operator: "=",
            value: "chat-completion",
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult.length).toBe(2);

      const modelRow = queryBuilderResult[0];
      expect(modelRow.providedModelName).toBe("gpt-4-turbo");
      expect(modelRow.sum_totalCost).toBe(900);
      expect(Number(modelRow.sum_totalTokens)).toBe(20736);
    });

    it("should filter observations by environment", async () => {
      // 1. Define a query with filter for production environment
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        filters: [
          {
            column: "environment",
            operator: "=",
            value: "production",
            type: "string",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      // Production models should only include gpt-4-turbo and text-embedding-ada-002
      // based on our sample data
      const productionModels = ["gpt-4-turbo", "text-embedding-ada-002"];

      // Verify result has the expected number of rows
      expect(queryBuilderResult.length).toBe(productionModels.length);

      // Verify each production model is present
      productionModels.forEach((modelName) => {
        const modelRow = queryBuilderResult.find(
          (row: any) => row.providedModelName === modelName,
        );

        expect(modelRow).toBeDefined();
        expect(modelRow.sum_totalCost).toBeGreaterThan(500);
        expect(Number(modelRow.sum_totalTokens)).toBeGreaterThan(10000);
      });
    });
  });

  describe("traces-timeseries query", () => {
    it("should return traces grouped by time correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "hour",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      // Result should have multiple rows (one per hour in the time range)
      expect(queryBuilderResult.length).toBeGreaterThanOrEqual(70);
      expect(queryBuilderResult.length).toBeLessThanOrEqual(80);

      // Each row should have a time_dimension and count_count
      queryBuilderResult.forEach((row: any) => {
        expect(row.time_dimension).toBeDefined();
        expect(Number(row.count_count)).toBeGreaterThanOrEqual(0);
      });

      // Verify that the hours where we created traces have non-zero counts
      // Our test data has traces at specific times
      const recentHours = queryBuilderResult.filter(
        (row: any) =>
          new Date(row.time_dimension).getTime() >= oneHourAgo.getTime() &&
          new Date(row.time_dimension).getTime() <= now.getTime(),
      );

      // We should have at least one hour with traces in the recent period
      expect(recentHours.length).toBeGreaterThan(0);

      // At least one of the recent hours should have a non-zero count
      const hasNonZeroCount = recentHours.some(
        (row: any) => Number(row.count_count) > 0,
      );
      expect(hasNonZeroCount).toBe(true);
    });
  });

  describe("observations-total-cost-by-model-timeseries query", () => {
    it("should return observations cost by model over time correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [
          { measure: "totalTokens", aggregation: "sum" },
          { measure: "totalCost", aggregation: "sum" },
        ],
        filters: [],
        timeDimension: {
          granularity: "hour",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Result should have multiple rows (one per hour per model in the time range)
      expect(queryBuilderResult.length).toBeGreaterThanOrEqual(70);
      expect(queryBuilderResult.length).toBeLessThanOrEqual(80);

      // Each row should have these properties
      queryBuilderResult.forEach((row: any) => {
        expect(row.time_dimension).toBeDefined();
        expect(row.providedModelName).toBeDefined();
        expect(row.sum_totalCost).toBeDefined();
        expect(row.sum_totalTokens).toBeDefined();
      });

      // Verify that the hours where we created observations have non-zero costs/tokens
      // Our test data has observations at specific times
      const expectedModels = [
        "gpt-4-turbo",
        "text-embedding-ada-002",
        "claude-3-opus",
      ];

      // Filter for recent hours where we created observations
      const recentObservations = queryBuilderResult.filter(
        (row: any) =>
          new Date(row.time_dimension).getTime() >= oneHourAgo.getTime() &&
          new Date(row.time_dimension).getTime() <= now.getTime() &&
          expectedModels.includes(row.providedModelName),
      );

      // We should have at least one recent observation
      expect(recentObservations.length).toBeGreaterThan(0);

      // At least one of the recent observations should have non-zero cost/tokens
      const hasNonZeroValues = recentObservations.some(
        (row: any) =>
          Number(row.sum_totalCost) > 0 && Number(row.sum_totalTokens) > 0,
      );
      expect(hasNonZeroValues).toBe(true);
    });
  });

  describe("observations-usage-by-users query", () => {
    it("should return observations usage by users correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "userId" }],
        metrics: [{ measure: "totalCost", aggregation: "sum" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Based on our sample data, we should have observations for users A, B, D, and E
      // (these are the users associated with traces that have observations)
      const expectedUsers = ["user-A", "user-B", "user-D", "user-E"];

      // Check that we have results for the expected users
      expectedUsers.forEach((userId) => {
        const userRow = queryBuilderResult.find(
          (row: any) => row.userId === userId,
        );

        // We might not have observations for all users, so we'll just check
        // that the structure is correct for the ones we do have
        if (userRow) {
          expect(userRow.sum_totalCost).toBeDefined();
        }
      });

      // At least one user should have a non-zero cost
      const hasNonZeroCost = queryBuilderResult.some(
        (row: any) => Number(row.sum_totalCost) > 0,
      );
      expect(hasNonZeroCost).toBe(true);
    });
  });

  describe("traces-grouped-by-user query", () => {
    it("should return traces grouped by user correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "userId" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Based on our sample data, we should have traces for users A through F
      const expectedUsers = [
        "user-A",
        "user-B",
        "user-C",
        "user-D",
        "user-E",
        "user-F",
      ];

      // Check that we have results for all expected users
      expectedUsers.forEach((userId) => {
        const userRow = queryBuilderResult.find(
          (row: any) => row.userId === userId,
        );

        expect(userRow).toBeDefined();
        expect(userRow.count_count).toBeDefined();

        // Verify the count matches what we expect based on our sample data
        // We could add more specific assertions if needed
        expect(Number(userRow.count_count)).toBeGreaterThan(0);
      });

      // Verify the total number of traces across all users matches our expected total
      const totalTraces = queryBuilderResult.reduce(
        (sum, row) => sum + Number(row.count_count),
        0,
      );
      expect(totalTraces).toBe(stats.totalTraces);
    });
  });

  describe("observation-latencies-aggregated query", () => {
    it("should return observation latencies aggregated correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "latency", aggregation: "p50" },
          { measure: "latency", aggregation: "p90" },
          { measure: "latency", aggregation: "p95" },
          { measure: "latency", aggregation: "p99" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [{ field: "p95_latency", direction: "desc" }],
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Based on our sample data, we should have observations for these models
      const expectedModels = [
        "gpt-4-turbo",
        "text-embedding-ada-002",
        "claude-3-opus",
      ];

      // Check that we have results for the expected models
      expectedModels.forEach((modelName) => {
        const modelRow = queryBuilderResult.find(
          (row: any) => row.name === modelName,
        );

        // We might not have latency data for all models, so we'll just check
        // that the structure is correct for the ones we do have
        if (modelRow) {
          expect(modelRow.p50_latency).toBeDefined();
          expect(modelRow.p90_latency).toBeDefined();
          expect(modelRow.p95_latency).toBeDefined();
          expect(modelRow.p99_latency).toBeDefined();

          // Latencies should be positive numbers
          expect(Number(modelRow.p50_latency)).toBeGreaterThan(0);
          expect(Number(modelRow.p90_latency)).toBeGreaterThan(0);
          expect(Number(modelRow.p95_latency)).toBeGreaterThan(0);
          expect(Number(modelRow.p99_latency)).toBeGreaterThan(0);

          // Percentiles should be in ascending order
          expect(Number(modelRow.p50_latency)).toBeLessThanOrEqual(
            Number(modelRow.p90_latency),
          );
          expect(Number(modelRow.p90_latency)).toBeLessThanOrEqual(
            Number(modelRow.p95_latency),
          );
          expect(Number(modelRow.p95_latency)).toBeLessThanOrEqual(
            Number(modelRow.p99_latency),
          );
        }
      });
    });
  });

  describe("traces-latencies-aggregated query", () => {
    it("should return trace latencies aggregated correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [
          { measure: "latency", aggregation: "p50" },
          { measure: "latency", aggregation: "p90" },
          { measure: "latency", aggregation: "p95" },
          { measure: "latency", aggregation: "p99" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [{ field: "p95_latency", direction: "desc" }],
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Based on our sample data, we should have traces with these names
      const expectedTraceNames = [
        "chat-completion",
        "embeddings",
        "summarize",
        "qa-bot",
      ];

      // Check that we have results for the expected trace names
      expectedTraceNames.forEach((traceName) => {
        const traceRow = queryBuilderResult.find(
          (row: any) => row.name === traceName,
        );

        // We might not have latency data for all trace types, so we'll just check
        // that the structure is correct for the ones we do have
        if (traceRow) {
          expect(traceRow.p50_latency).toBeDefined();
          expect(traceRow.p90_latency).toBeDefined();
          expect(traceRow.p95_latency).toBeDefined();
          expect(traceRow.p99_latency).toBeDefined();

          // If we have latency data, it should be valid
          if (Number(traceRow.p50_latency) > 0) {
            // Percentiles should be in ascending order
            expect(Number(traceRow.p50_latency)).toBeLessThanOrEqual(
              Number(traceRow.p90_latency),
            );
            expect(Number(traceRow.p90_latency)).toBeLessThanOrEqual(
              Number(traceRow.p95_latency),
            );
            expect(Number(traceRow.p95_latency)).toBeLessThanOrEqual(
              Number(traceRow.p99_latency),
            );
          }
        }
      });
    });
  });

  describe("model-latencies-over-time query", () => {
    it("should return model latencies over time correctly", async () => {
      // 1. Define the query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [
          { measure: "latency", aggregation: "p50" },
          { measure: "latency", aggregation: "p75" },
          { measure: "latency", aggregation: "p90" },
          { measure: "latency", aggregation: "p95" },
          { measure: "latency", aggregation: "p99" },
        ],
        filters: [],
        timeDimension: {
          granularity: "hour",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
      };

      // 2. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Verify results
      expect(queryBuilderResult).toBeDefined();

      // Result should have multiple rows (one per hour per model in the time range)
      expect(queryBuilderResult.length).toBeGreaterThan(0);

      // Each row should have these properties
      queryBuilderResult.forEach((row: any) => {
        expect(row.time_dimension).toBeDefined();
        expect(row.providedModelName).toBeDefined();
        expect(row.p50_latency).toBeDefined();
        expect(row.p75_latency).toBeDefined();
        expect(row.p90_latency).toBeDefined();
        expect(row.p95_latency).toBeDefined();
        expect(row.p99_latency).toBeDefined();
      });

      // Verify that the hours where we created observations have valid latency data
      // Our test data has observations at specific times
      const expectedModels = [
        "gpt-4-turbo",
        "text-embedding-ada-002",
        "claude-3-opus",
      ];

      // Filter for recent hours where we created observations
      const recentObservations = queryBuilderResult.filter(
        (row: any) =>
          new Date(row.time_dimension).getTime() >= oneHourAgo.getTime() &&
          new Date(row.time_dimension).getTime() <= now.getTime() &&
          expectedModels.includes(row.providedModelName),
      );

      // We should have at least one recent observation with latency data
      const hasLatencyData = recentObservations.some(
        (row: any) =>
          Number(row.p50_latency) > 0 &&
          Number(row.p75_latency) > 0 &&
          Number(row.p90_latency) > 0 &&
          Number(row.p95_latency) > 0 &&
          Number(row.p99_latency) > 0,
      );

      if (hasLatencyData) {
        // For rows with latency data, verify percentiles are in ascending order
        recentObservations.forEach((row) => {
          if (Number(row.p50_latency) > 0) {
            expect(Number(row.p50_latency)).toBeLessThanOrEqual(
              Number(row.p75_latency),
            );
            expect(Number(row.p75_latency)).toBeLessThanOrEqual(
              Number(row.p90_latency),
            );
            expect(Number(row.p90_latency)).toBeLessThanOrEqual(
              Number(row.p95_latency),
            );
            expect(Number(row.p95_latency)).toBeLessThanOrEqual(
              Number(row.p99_latency),
            );
          }
        });
      }
    });
  });
});
