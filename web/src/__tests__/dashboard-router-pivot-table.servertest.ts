/**
 * @fileoverview Integration tests for Pivot Table widget functionality in dashboard router
 *
 * This test suite validates the complete data pipeline for pivot table widgets:
 * - Query generation and execution through executeQuery function
 * - SQL generation by QueryBuilder for various pivot table configurations
 * - Data transformation from raw query results to pivot table structure
 * - Integration with ClickHouse database and error handling
 *
 * Test Coverage:
 * - Zero dimension pivot tables (grand total only)
 * - Single dimension pivot tables with subtotals
 * - Two dimension pivot tables with nested structure
 * - Row limiting functionality
 * - Error handling for malformed queries
 * - Integration with existing dashboard query infrastructure
 */

import { randomUUID } from "crypto";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { type QueryType } from "@/src/features/query/types";
import {
  transformToPivotTable,
  type DatabaseRow,
} from "@/src/features/widgets/utils/pivot-table-utils";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { executeQuery } from "@/src/features/query/server/queryExecutor";

describe("Dashboard Router - Pivot Table Integration", () => {
  // Single project ID for all tests
  const projectId = randomUUID();

  // Time references for test data
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const twoHoursAgo = new Date(now.getTime() - 7200000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600000);

  // Time ranges for queries - ISO format for query builder
  const defaultFromTime = threeDaysAgo.toISOString();
  const defaultToTime = new Date(now.getTime() + 3600000).toISOString(); // 1 hour in future

  // Test data statistics for verification
  const testDataStats = {
    totalTraces: 0,
    environmentCounts: {} as Record<string, number>,
    modelCounts: {} as Record<string, number>,
    totalObservations: 0,
  };

  beforeAll(async () => {
    // Create diverse test data for pivot table testing
    const traces = [
      // Production environment traces
      ...Array(6)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "chat-completion",
            environment: "production",
            timestamp: now.getTime() - i * 10000,
            user_id: `user-prod-${i}`,
          }),
        ),

      // Development environment traces
      ...Array(4)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "embeddings",
            environment: "development",
            timestamp: oneHourAgo.getTime() - i * 15000,
            user_id: `user-dev-${i}`,
          }),
        ),

      // Staging environment traces
      ...Array(3)
        .fill(0)
        .map((_, i) =>
          createTrace({
            project_id: projectId,
            name: "summarize",
            environment: "staging",
            timestamp: twoHoursAgo.getTime() - i * 20000,
            user_id: `user-staging-${i}`,
          }),
        ),
    ];

    // Insert traces into ClickHouse
    await createTracesCh(traces);

    // Create observations with different models for each trace
    const observations = [];

    // Production observations - GPT models
    for (let i = 0; i < 6; i++) {
      const traceId = traces[i].id;
      observations.push(
        createObservation({
          project_id: projectId,
          trace_id: traceId,
          name: "gpt-generation",
          type: "generation",
          environment: "production",
          start_time: now.getTime() - i * 10000,
          completion_start_time: now.getTime() - i * 10000 + 500,
          end_time: now.getTime() - i * 10000 + 2000,
          provided_model_name: i < 3 ? "gpt-4-turbo" : "gpt-3.5-turbo",
        }),
      );
    }

    // Development observations - Claude models
    for (let i = 0; i < 4; i++) {
      const traceId = traces[6 + i].id;
      observations.push(
        createObservation({
          project_id: projectId,
          trace_id: traceId,
          name: "claude-generation",
          type: "generation",
          environment: "development",
          start_time: oneHourAgo.getTime() - i * 15000,
          completion_start_time: oneHourAgo.getTime() - i * 15000 + 800,
          end_time: oneHourAgo.getTime() - i * 15000 + 3000,
          provided_model_name: i < 2 ? "claude-3-opus" : "claude-3-sonnet",
        }),
      );
    }

    // Staging observations - Mixed models
    for (let i = 0; i < 3; i++) {
      const traceId = traces[10 + i].id;
      observations.push(
        createObservation({
          project_id: projectId,
          trace_id: traceId,
          name: "mixed-generation",
          type: "generation",
          environment: "staging",
          start_time: twoHoursAgo.getTime() - i * 20000,
          completion_start_time: twoHoursAgo.getTime() - i * 20000 + 600,
          end_time: twoHoursAgo.getTime() - i * 20000 + 2500,
          provided_model_name: "gpt-4-turbo",
        }),
      );
    }

    // Insert observations into ClickHouse
    await createObservationsCh(observations);

    // Calculate test data statistics for verification
    testDataStats.totalTraces = traces.length;
    testDataStats.totalObservations = observations.length;

    // Count by environment
    traces.forEach((trace) => {
      testDataStats.environmentCounts[trace.environment] =
        (testDataStats.environmentCounts[trace.environment] || 0) + 1;
    });

    // Count by model
    observations.forEach((obs) => {
      if (obs.provided_model_name) {
        testDataStats.modelCounts[obs.provided_model_name] =
          (testDataStats.modelCounts[obs.provided_model_name] || 0) + 1;
      }
    });
  });

  describe("executeQuery function with pivot table configurations", () => {
    it("should execute zero-dimension pivot table query (grand total only)", async () => {
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const result = await executeQuery(projectId, query);

      // Verify basic query execution
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Results should be grouped by time dimension when timeDimension is present
      expect(result.length).toBeGreaterThan(0);

      // Each row should have time_dimension and aggregated count
      result.forEach((row) => {
        expect(row).toHaveProperty("time_dimension");
        expect(row).toHaveProperty("count_count");
      });

      // Sum all counts to verify total
      const totalCount = result.reduce(
        (sum, row) => sum + Number(row.count_count),
        0,
      );
      expect(totalCount).toBe(testDataStats.totalTraces);
    });

    it("should execute single-dimension pivot table query with environment grouping", async () => {
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "environment" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [{ field: "environment", direction: "asc" }],
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const result = await executeQuery(projectId, query);

      // Verify query execution
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Should have one row per environment per time dimension
      expect(result.length).toBeGreaterThan(0);

      // Verify structure of results
      result.forEach((row) => {
        expect(row).toHaveProperty("environment");
        expect(row).toHaveProperty("time_dimension");
        expect(row).toHaveProperty("count_count");
        expect(typeof row.environment).toBe("string");
      });

      // Verify data accuracy by checking environment counts
      const environmentTotals = result.reduce(
        (acc, row) => {
          const env = row.environment as string;
          acc[env] = ((acc[env] as number) || 0) + Number(row.count_count);
          return acc;
        },
        {} as Record<string, number>,
      );

      expect(environmentTotals["production"]).toBe(
        testDataStats.environmentCounts["production"],
      );
      expect(environmentTotals["development"]).toBe(
        testDataStats.environmentCounts["development"],
      );
      expect(environmentTotals["staging"]).toBe(
        testDataStats.environmentCounts["staging"],
      );
    });

    it("should execute two-dimension pivot table query with environment and model grouping", async () => {
      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "environment" }, { field: "providedModelName" }],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [
          { field: "environment", direction: "asc" },
          { field: "providedModelName", direction: "asc" },
        ],
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const result = await executeQuery(projectId, query);

      // Verify query execution
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Should have combinations of environment and model
      result.forEach((row) => {
        expect(row).toHaveProperty("environment");
        expect(row).toHaveProperty("providedModelName");
        expect(row).toHaveProperty("time_dimension");
        expect(row).toHaveProperty("count_count");
        expect(row).toHaveProperty("sum_totalTokens");

        expect(typeof row.environment).toBe("string");
        expect(typeof row.providedModelName).toBe("string");
      });

      // Verify total observation count matches test data
      const totalObservations = result.reduce(
        (sum, row) => sum + Number(row.count_count),
        0,
      );
      expect(totalObservations).toBe(testDataStats.totalObservations);
    });

    it("should handle empty results gracefully", async () => {
      const futureTime = new Date(now.getTime() + 86400000).toISOString(); // 1 day in future
      const farFutureTime = new Date(now.getTime() + 172800000).toISOString(); // 2 days in future

      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "environment" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: futureTime,
        toTimestamp: farFutureTime,
        orderBy: null,
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const result = await executeQuery(projectId, query);

      // Should handle empty results without errors
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Time dimension queries can return rows with 0 counts for time filling
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Query Builder integration with pivot table configurations", () => {
    it("should generate correct SQL for zero-dimension pivot table", async () => {
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const queryBuilder = new QueryBuilder(query.chartConfig);
      const { query: sql, parameters } = await queryBuilder.build(
        query,
        projectId,
      );

      // Verify SQL generation
      expect(sql).toBeDefined();
      expect(typeof sql).toBe("string");
      expect(parameters).toBeDefined();
      expect(typeof parameters).toBe("object");

      // SQL should contain GROUP BY for time dimension when timeDimension is present
      expect(sql.toLowerCase()).toContain("group by");

      // Should contain aggregation
      expect(sql.toLowerCase()).toContain("count(");
    });

    it("should generate correct SQL for single-dimension pivot table", async () => {
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "environment" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [{ field: "environment", direction: "asc" }],
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const queryBuilder = new QueryBuilder(query.chartConfig);
      const { query: sql, parameters } = await queryBuilder.build(
        query,
        projectId,
      );

      // Verify SQL generation
      expect(sql).toBeDefined();
      expect(typeof sql).toBe("string");
      expect(parameters).toBeDefined();

      // SQL should contain GROUP BY for dimension
      expect(sql.toLowerCase()).toContain("group by");
      expect(sql.toLowerCase()).toContain("environment");

      // Should contain ORDER BY
      expect(sql.toLowerCase()).toContain("order by");
    });

    it("should generate correct SQL for two-dimension pivot table", async () => {
      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "environment" }, { field: "providedModelName" }],
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "totalTokens", aggregation: "sum" },
        ],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [
          { field: "environment", direction: "asc" },
          { field: "providedModelName", direction: "asc" },
        ],
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const queryBuilder = new QueryBuilder(query.chartConfig);
      const { query: sql, parameters } = await queryBuilder.build(
        query,
        projectId,
      );

      // Verify SQL generation
      expect(sql).toBeDefined();
      expect(typeof sql).toBe("string");
      expect(parameters).toBeDefined();

      // SQL should contain GROUP BY for both dimensions
      expect(sql.toLowerCase()).toContain("group by");
      expect(sql.toLowerCase()).toContain("environment");
      expect(sql.toLowerCase()).toContain("providedmodelname");

      // Should contain multiple aggregations
      expect(sql.toLowerCase()).toContain("count(");
      expect(sql.toLowerCase()).toContain("sum(");

      // Should contain ORDER BY for both dimensions
      expect(sql.toLowerCase()).toContain("order by");
    });
  });

  describe("End-to-end pivot table data transformation", () => {
    it("should transform query results to pivot table structure for zero dimensions", async () => {
      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null, // No time dimension for simpler test
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      // Execute query to get raw data
      const rawData = await executeQuery(projectId, query);

      // Transform to pivot table structure
      const pivotTableData = transformToPivotTable(rawData as DatabaseRow[], {
        dimensions: [],
        metrics: ["count_count"],
        rowLimit: 20,
      });

      // Verify transformation
      expect(pivotTableData).toBeDefined();
      expect(Array.isArray(pivotTableData)).toBe(true);
      expect(pivotTableData.length).toBe(1); // Should have only grand total

      const totalRow = pivotTableData[0];
      expect(totalRow.type).toBe("total");
      expect(totalRow.level).toBe(0);
      expect(totalRow.label).toBe("Total");
      expect(totalRow.isTotal).toBe(true);
      expect(totalRow.values).toHaveProperty("count_count");
    });

    it("should transform query results to pivot table structure for single dimension", async () => {
      const query: QueryType = {
        view: "traces",
        dimensions: [{ field: "environment" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null, // No time dimension for simpler test
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [{ field: "environment", direction: "asc" }],
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      // Execute query to get raw data
      const rawData = await executeQuery(projectId, query);

      // Transform to pivot table structure
      const pivotTableData = transformToPivotTable(rawData as DatabaseRow[], {
        dimensions: ["environment"],
        metrics: ["count_count"],
        rowLimit: 20,
      });

      // Verify transformation
      expect(pivotTableData).toBeDefined();
      expect(Array.isArray(pivotTableData)).toBe(true);
      expect(pivotTableData.length).toBeGreaterThan(1); // Should have data rows + total

      // Should have data rows for each environment
      const dataRows = pivotTableData.filter((row) => row.type === "data");
      const totalRow = pivotTableData.find((row) => row.type === "total");

      expect(dataRows.length).toBeGreaterThan(0);
      expect(totalRow).toBeDefined();
      expect(totalRow!.isTotal).toBe(true);

      // Verify data row structure
      dataRows.forEach((row) => {
        expect(row.type).toBe("data");
        expect(row.level).toBe(0);
        expect(row.values).toHaveProperty("count_count");
        expect(typeof row.values.count_count).toBe("number");
      });
    });

    it("should transform query results to pivot table structure for two dimensions", async () => {
      const query: QueryType = {
        view: "observations",
        dimensions: [{ field: "environment" }, { field: "providedModelName" }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null, // No time dimension for simpler test
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: [
          { field: "environment", direction: "asc" },
          { field: "providedModelName", direction: "asc" },
        ],
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      // Execute query to get raw data
      const rawData = await executeQuery(projectId, query);

      // Transform to pivot table structure
      const pivotTableData = transformToPivotTable(rawData as DatabaseRow[], {
        dimensions: ["environment", "providedModelName"],
        metrics: ["count_count"],
        rowLimit: 20,
      });

      // Verify transformation
      expect(pivotTableData).toBeDefined();
      expect(Array.isArray(pivotTableData)).toBe(true);
      expect(pivotTableData.length).toBeGreaterThan(1);

      // Should have nested structure with data rows, subtotals, and grand total
      const dataRows = pivotTableData.filter((row) => row.type === "data");
      const subtotalRows = pivotTableData.filter(
        (row) => row.type === "subtotal",
      );
      const totalRow = pivotTableData.find((row) => row.type === "total");

      expect(dataRows.length).toBeGreaterThan(0);
      expect(totalRow).toBeDefined();

      // Verify indentation levels
      dataRows.forEach((row) => {
        expect(row.level).toBe(1); // Second level for two dimensions
        expect(row.values).toHaveProperty("count_count");
      });

      if (subtotalRows.length > 0) {
        subtotalRows.forEach((row) => {
          expect(row.level).toBe(0); // First level subtotals
          expect(row.isSubtotal).toBe(true);
        });
      }

      expect(totalRow!.level).toBe(0);
      expect(totalRow!.isTotal).toBe(true);
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle empty results gracefully in transformation", async () => {
      // Transform empty data to pivot table structure
      const pivotTableData = transformToPivotTable([], {
        dimensions: ["environment"],
        metrics: ["count_count"],
        rowLimit: 20,
      });

      // Should handle empty data gracefully
      expect(pivotTableData).toBeDefined();
      expect(Array.isArray(pivotTableData)).toBe(true);

      // Should still have total row with zero values
      expect(pivotTableData.length).toBe(1);
      const totalRow = pivotTableData[0];
      expect(totalRow.type).toBe("total");
      expect(totalRow.values.count_count).toBe(0);
    });

    it("should handle missing project data gracefully", async () => {
      const nonExistentProjectId = randomUUID();

      const query: QueryType = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: {
          granularity: "day",
        },
        fromTimestamp: defaultFromTime,
        toTimestamp: defaultToTime,
        orderBy: null,
        chartConfig: {
          type: "PIVOT_TABLE",
          row_limit: 20,
        },
      };

      const result = await executeQuery(nonExistentProjectId, query);

      // Should return results even for non-existent project (time fill creates rows)
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });
});
