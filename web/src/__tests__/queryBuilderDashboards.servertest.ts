import { randomUUID } from "crypto";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
  getTotalTraces,
  getTracesGroupedByName,
  convertDateToClickhouseDateTime,
  getObservationsCostGroupedByName,
  getScoreAggregate,
} from "@langfuse/shared/src/server";
import { FilterState } from "@langfuse/shared";
import { type QueryType } from "@/src/features/query/server/types";
import { executeQuery } from "@/src/features/dashboard/server/dashboard-router";
import { dashboardColumnDefinitions } from "@langfuse/shared";

/**
 * Test suite for testing the self-serve dashboards functionality
 * This tests that the new query builder produces the same results as the existing dashboard queries
 */
describe("selfServeDashboards", () => {
  // Single project ID for all tests
  const projectId = randomUUID();

  // Time references
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const twoHoursAgo = new Date(now.getTime() - 7200000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600000);

  // Time ranges for queries - converted to ClickHouse DateTime format (YYYY-MM-DD HH:MM:SS.SSS)
  const defaultFromTime = convertDateToClickhouseDateTime(threeDaysAgo);
  const defaultToTime = convertDateToClickhouseDateTime(
    new Date(now.getTime() + 3600000),
  ); // 1 hour in future

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
      stats.traceCounts[trace.name] = (stats.traceCounts[trace.name] || 0) + 1;
    });

    // Count recent production traces (within the last hour)
    stats.recentProductionTraces = traces.filter(
      (t) =>
        t.environment === "production" && t.timestamp >= oneHourAgo.getTime(),
    ).length;
  });

  describe("traces-total query", () => {
    it("should return the same result with query builder as with legacy function", async () => {
      // Empty filter for this test
      const filter: FilterState = [
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: new Date("1970-01-02"),
        },
      ];

      // 1. Get result using the legacy function
      const legacyResult = await getTotalTraces(projectId, filter);

      // 2. Define the equivalent query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // 3. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 4. Assert that both results match
      expect(queryBuilderResult.data).toHaveLength(1);
      expect(Number(queryBuilderResult.data[0].count_count)).toBe(
        stats.totalTraces,
      );
      expect(Number(legacyResult?.[0]?.countTraceId)).toBe(stats.totalTraces);
    });

    it("should filter traces by environment correctly", async () => {
      // 1. Define a filter for production environment in the legacy format
      const prodLegacyFilter: FilterState = [
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: new Date("1970-01-02"),
        },
        {
          type: "string",
          operator: "=",
          column: "environment",
          value: "production",
        },
      ];
      const prodLegacyResult = await getTotalTraces(
        projectId,
        prodLegacyFilter,
      );

      // 2. Define the equivalent query with filter for the query builder
      const prodQueryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            field: "environment",
            operator: "eq",
            value: "production",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };
      const prodQueryBuilderResult = await executeQuery(
        projectId,
        prodQueryBuilderQuery,
      );

      // 3. Assert that both results match and only count production traces
      expect(prodQueryBuilderResult.data).toHaveLength(1);
      expect(Number(prodQueryBuilderResult.data[0].count_count)).toBe(
        stats.productionTraces,
      );
      expect(Number(prodLegacyResult?.[0]?.countTraceId)).toBe(
        stats.productionTraces,
      );

      // 4. Test another filter for development environment
      const devLegacyFilter: FilterState = [
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: new Date("1970-01-02"),
        },
        {
          type: "string",
          operator: "=",
          column: "environment",
          value: "development",
        },
      ];
      const devLegacyResult = await getTotalTraces(projectId, devLegacyFilter);

      const devQueryBuilderQuery: QueryType = {
        ...prodQueryBuilderQuery,
        filters: [
          {
            field: "environment",
            operator: "eq",
            value: "development",
          },
        ],
      };
      const devQueryBuilderResult = await executeQuery(
        projectId,
        devQueryBuilderQuery,
      );

      // 5. Assert development environment results
      expect(devQueryBuilderResult.data).toHaveLength(1);
      expect(Number(devQueryBuilderResult.data[0].count_count)).toBe(
        stats.developmentTraces,
      );
      expect(Number(devLegacyResult?.[0]?.countTraceId)).toBe(
        stats.developmentTraces,
      );
    });

    it("should handle multiple filter conditions", async () => {
      // 1. Define a filter for recent production traces in the legacy format
      const recentProdLegacyFilter: FilterState = [
        {
          type: "string",
          operator: "=",
          column: "environment",
          value: "production",
        },
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: oneHourAgo,
        },
      ];
      const legacyResult = await getTotalTraces(
        projectId,
        recentProdLegacyFilter,
      );

      // 2. Define the equivalent query with multiple filters for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            field: "environment",
            operator: "eq",
            value: "production",
          },
          {
            field: "timestamp",
            operator: "gte",
            value: convertDateToClickhouseDateTime(oneHourAgo),
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 3. Assert that both results match and only count recent production traces
      expect(queryBuilderResult.data).toHaveLength(1);
      expect(Number(queryBuilderResult.data[0].count_count)).toBe(
        stats.recentProductionTraces,
      );
      expect(legacyResult?.[0]?.countTraceId).toBe(
        `${stats.recentProductionTraces}`,
      );
    });
  });

  describe("traces-grouped-by-name query", () => {
    it("should return the same result with query builder as with legacy function", async () => {
      // 1. Get result using the legacy function
      const legacyResult = await getTracesGroupedByName(
        projectId,
        dashboardColumnDefinitions,
        [], // empty filter
      );

      // 2. Define the equivalent query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // 3. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 4. Verify both results
      const legacyResultMap = new Map(
        legacyResult.map((item) => [item.name, item.count]),
      );

      // Verify results match the expected trace counts by name
      Object.keys(stats.traceCounts).forEach((traceName) => {
        const countFromLegacy = legacyResultMap.get(traceName);
        const resultRow = queryBuilderResult.data.find(
          (row: any) => row.name === traceName,
        );

        expect(countFromLegacy).toBe(`${stats.traceCounts[traceName]}`);
        expect(Number(resultRow?.count_count)).toBe(
          stats.traceCounts[traceName],
        );
      });

      // Verify both result sets have the same number of rows
      expect(legacyResult.length).toBe(Object.keys(stats.traceCounts).length);
      expect(queryBuilderResult.data.length).toBe(
        Object.keys(stats.traceCounts).length,
      );
    });

    it("should filter traces by environment when grouping by name", async () => {
      // 1. Define a filter for production environment
      const prodFilter: FilterState = [
        {
          type: "string",
          operator: "=",
          column: "environment",
          value: "production",
        },
      ];

      // 2. Get legacy result with filter
      const legacyResult = await getTracesGroupedByName(
        projectId,
        dashboardColumnDefinitions,
        prodFilter,
      );

      // 3. Define the equivalent query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [
          {
            field: "environment",
            operator: "eq",
            value: "production",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // 4. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 5. Verify results
      // Get only traces with production environment
      const productionTraceNames = ["chat-completion", "embeddings"];

      // Verify both results have the expected number of rows
      expect(legacyResult.length).toBe(productionTraceNames.length);
      expect(queryBuilderResult.data.length).toBe(productionTraceNames.length);

      // Create easy-to-use maps for comparison
      const legacyResultMap = new Map(
        legacyResult.map((item) => [item.name, item.count]),
      );

      // Check each production trace name is present with correct count
      productionTraceNames.forEach((traceName) => {
        const countFromLegacy = legacyResultMap.get(traceName);
        const resultRow = queryBuilderResult.data.find(
          (row: any) => row.name === traceName,
        );

        expect(countFromLegacy).toBeDefined();
        expect(resultRow).toBeDefined();
        expect(resultRow?.count_count).toBe(countFromLegacy);
      });
    });
  });

  describe("observations-model-cost query", () => {
    it("should return the same result with query builder as with legacy function", async () => {
      // 1. Get result using the legacy function
      const legacyResult = await getObservationsCostGroupedByName(
        projectId,
        [], // empty filter
      );

      // 2. Define the equivalent query for the query builder
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
        page: 0,
        limit: 50,
      };

      // 3. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 4. Verify both results
      expect(queryBuilderResult.data).toBeDefined();
      expect(legacyResult).toBeDefined();

      // Create maps for easier comparison
      const legacyResultMap = new Map(
        legacyResult.map((item) => [item.name, item]),
      );

      // Verify each model's costs and token usage match
      queryBuilderResult.data.forEach((row: any) => {
        const modelName = row.provided_model_name;
        const legacyModelData = legacyResultMap.get(modelName);

        expect(legacyModelData).toBeDefined();
        expect(row.sum_total_cost).toBe(legacyModelData?.sum_cost_details);
        expect(row.sum_total_tokens).toBe(legacyModelData?.sum_usage_details);
      });

      // Verify both result sets have the same number of models
      expect(legacyResult.length).toBe(queryBuilderResult.data.length);
    });

    it("should filter observations by environment", async () => {
      // 1. Define a filter for production environment
      const prodFilter: FilterState = [
        {
          type: "string",
          operator: "=",
          column: "environment",
          value: "production",
        },
      ];

      // 2. Get legacy result with filter
      const legacyResult = await getObservationsCostGroupedByName(
        projectId,
        prodFilter,
      );

      // 3. Define the equivalent query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "observations",
        dimensions: [{ field: "providedModelName" }],
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        filters: [
          {
            field: "environment",
            operator: "eq",
            value: "production",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // 4. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 5. Verify results
      // Production models should only include gpt-4-turbo and text-embedding-ada-002
      const productionModels = ["gpt-4-turbo", "text-embedding-ada-002"];

      // Verify both results have the expected number of rows
      expect(legacyResult.length).toBe(productionModels.length);
      expect(queryBuilderResult.data.length).toBe(productionModels.length);

      // Create maps for easier comparison
      const legacyResultMap = new Map(
        legacyResult.map((item) => [item.name, item]),
      );

      // Verify each production model is present with correct costs
      queryBuilderResult.data.forEach((row: any) => {
        const modelName = row.provided_model_name;
        const legacyModelData = legacyResultMap.get(modelName);

        expect(productionModels).toContain(modelName);
        expect(legacyModelData).toBeDefined();
        expect(row.sum_total_cost).toBe(legacyModelData?.sum_cost_details);
        expect(row.sum_total_tokens).toBe(legacyModelData?.sum_usage_details);
      });
    });
  });

  describe("score-aggregate query", () => {
    it("should return the same result with query builder as with legacy function", async () => {
      // 1. Get result using the legacy function
      const legacyResult = await getScoreAggregate(projectId, [
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: new Date("1970-01-02"),
        },
      ]);

      // 2. Define the equivalent query for the query builder
      const queryBuilderNumericQuery: QueryType = {
        view: "scores-numeric",
        dimensions: [
          { field: "name" },
          { field: "source" },
          { field: "dataType" },
        ],
        metrics: [
          { measure: "value", aggregation: "avg" },
          { measure: "count", aggregation: "count" },
        ],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // 3. Get results using the query builder for numeric scores
      const queryBuilderNumericResult = await executeQuery(
        projectId,
        queryBuilderNumericQuery,
      );

      // 4. Check categorical scores separately (optional, as the test dataset may not include them)
      const queryCategoricalQuery: QueryType = {
        view: "scores-categorical",
        dimensions: [
          { field: "name" },
          { field: "source" },
          { field: "dataType" },
        ],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // Get results for categorical scores
      const queryBuilderCatResult = await executeQuery(
        projectId,
        queryCategoricalQuery,
      );

      // 5. Verify both results
      expect(queryBuilderNumericResult.data).toBeDefined();
      expect(legacyResult).toBeDefined();

      // Check that all numeric scores from legacy query are present in new query
      // Note: This test assumes numeric scores. If you have categorical scores, you'd need to
      // handle them separately by checking against queryBuilderCatResult
      legacyResult.forEach((legacyScore) => {
        // Only check numeric scores here
        if (legacyScore.data_type === "numeric") {
          const matchingRow = queryBuilderNumericResult.data.find(
            (row: any) =>
              row.name === legacyScore.name &&
              row.source === legacyScore.source &&
              row.data_type === legacyScore.data_type,
          );

          expect(matchingRow).toBeDefined();
          // Check count matches
          expect(Number(matchingRow?.count_count)).toBe(
            Number(legacyScore.count),
          );
          // Check average value is approximately the same
          expect(Number(matchingRow?.value_avg)).toBeCloseTo(
            Number(legacyScore.avg_value),
          );
        }
      });

      // If we have categorical scores in our test data, verify those too
      const categoricalScores = legacyResult.filter(
        (score) => score.data_type === "categorical",
      );
      if (
        categoricalScores.length > 0 &&
        queryBuilderCatResult.data.length > 0
      ) {
        categoricalScores.forEach((legacyScore) => {
          const matchingRow = queryBuilderCatResult.data.find(
            (row: any) =>
              row.name === legacyScore.name &&
              row.source === legacyScore.source &&
              row.data_type === legacyScore.data_type,
          );

          expect(matchingRow).toBeDefined();
          // Check count matches
          expect(Number(matchingRow?.count_count)).toBe(
            Number(legacyScore.count),
          );
        });
      }
    });

    it("should filter scores by environment", async () => {
      // 1. Define a filter for production environment
      const prodFilter: FilterState = [
        {
          type: "string",
          operator: "=",
          column: "environment",
          value: "production",
        },
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: new Date("1970-01-02"),
        },
      ];

      // 2. Get legacy result with filter
      const legacyResult = await getScoreAggregate(projectId, prodFilter);

      // 3. Define the equivalent query for the query builder
      const queryBuilderQuery: QueryType = {
        view: "scores-numeric", // We'll just test numeric scores for simplicity
        dimensions: [
          { field: "name" },
          { field: "source" },
          { field: "dataType" },
        ],
        metrics: [
          { measure: "value", aggregation: "avg" },
          { measure: "count", aggregation: "count" },
        ],
        filters: [
          {
            field: "environment",
            operator: "eq",
            value: "production",
          },
        ],
        timeDimension: null,
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        page: 0,
        limit: 50,
      };

      // 4. Get result using the query builder
      const queryBuilderResult = await executeQuery(
        projectId,
        queryBuilderQuery,
      );

      // 5. Verify results
      // Production environment should only include certain scores (based on test data)
      // We can check if both results have the same number of scores for production
      expect(queryBuilderResult.data.length).toBe(
        legacyResult.filter((score) => score.data_type === "numeric").length,
      );

      // Check that all numeric scores in production environment from legacy query match the new query
      legacyResult
        .filter((score) => score.data_type === "numeric")
        .forEach((legacyScore) => {
          const matchingRow = queryBuilderResult.data.find(
            (row: any) =>
              row.name === legacyScore.name &&
              row.source === legacyScore.source &&
              row.data_type === legacyScore.data_type,
          );

          expect(matchingRow).toBeDefined();
          // Check count matches
          expect(Number(matchingRow?.count_count)).toBe(
            Number(legacyScore.count),
          );
          // Check average value is approximately the same
          expect(Number(matchingRow?.value_avg)).toBeCloseTo(
            Number(legacyScore.avg_value),
          );
        });
    });
  });
});
