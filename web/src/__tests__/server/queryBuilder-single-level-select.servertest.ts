import {
  QueryBuilder,
  executeQuery,
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  randomUUID,
} from "./queryBuilder.fixtures";
import type { QueryType } from "./queryBuilder.fixtures";

describe("queryBuilder", () => {
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
      expect(compiledQuery).toContain("INNER JOIN scores");
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
});
