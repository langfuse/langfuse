import {
  createEvent,
  createEventsCh,
  queryClickhouse,
  FilterList,
  StringFilter,
  StringOptionsFilter,
  NumberFilter,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import {
  SelectQueryBuilder,
  AggregateQueryBuilder,
  EVENTS_FIELD_CATALOG,
} from "@langfuse/shared/src/server";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

describe("Declarative Query Builder", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging redis connection
  });

  maybe("Combined SQL + Execution Tests", () => {
    it("should fetch observations with simple row query (no CTEs)", async () => {
      const traceId = randomUUID();
      const spanId1 = randomUUID();
      const spanId2 = randomUUID();
      const nowMicro = Date.now() * 1000;

      // Create test data
      await createEventsCh([
        createEvent({
          id: spanId1,
          span_id: spanId1,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          name: "test-generation",
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
        createEvent({
          id: spanId2,
          span_id: spanId2,
          trace_id: traceId,
          project_id: projectId,
          type: "SPAN",
          name: "test-span",
          start_time: nowMicro + 1000,
          event_ts: nowMicro + 1000,
        }),
      ]);

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "traceId", "name", "startTime", "type"],
      )
        .orderBy("startTime", "desc")
        .limit(50)
        .buildQuery();

      // SQL assertions
      expect(query).toContain("e.span_id as id");
      expect(query).toContain("e.trace_id as traceId");
      expect(query).toContain("e.start_time as startTime");
      expect(query).toContain("ORDER BY e.start_time DESC");
      expect(query).not.toContain("WITH"); // No CTEs needed

      // Execution assertions
      const result = await queryClickhouse<{
        id: string;
        traceId: string;
        name: string;
        type: string;
      }>({ query, params });

      const ourEvents = result.filter((r) => r.traceId === traceId);
      expect(ourEvents).toHaveLength(2);
      expect(ourEvents[0]).toHaveProperty("traceId", traceId);
    });

    it("should fetch trace-level fields using eventsTracesAggregation CTE", async () => {
      const traceId = randomUUID();
      const rootSpanId = randomUUID();
      const childSpanId = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: rootSpanId,
          span_id: rootSpanId,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          name: "root-trace-name",
          parent_span_id: "", // Root span
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
        createEvent({
          id: childSpanId,
          span_id: childSpanId,
          trace_id: traceId,
          project_id: projectId,
          type: "SPAN",
          name: "child-span",
          parent_span_id: rootSpanId,
          start_time: nowMicro + 1000,
          event_ts: nowMicro + 1000,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "traceId", "traceName"],
      )
        .where(filters)
        .buildQuery();

      // SQL assertions - verify it uses eventsTracesAggregation
      expect(query).toContain("WITH traces AS");
      expect(query).toContain("argMaxIf(name, event_ts, parent_span_id = '')");
      expect(query).toContain("LEFT JOIN traces t ON");

      // Execution assertions - verify traceName comes from root span
      const result = await queryClickhouse<{
        id: string;
        traceId: string;
        traceName: string;
      }>({ query, params });

      expect(result.length).toBe(2);
      expect(result[0].traceName).toBe("root-trace-name");
      expect(result[1].traceName).toBe("root-trace-name");
    });

    it("should aggregate measures by dimensions (single CTE)", async () => {
      const traceId1 = randomUUID();
      const traceId2 = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: traceId1,
          project_id: projectId,
          type: "GENERATION",
          name: "gen1",
          cost_details: { input: 0, output: 0, total: 0.05 },
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: traceId1,
          project_id: projectId,
          type: "GENERATION",
          name: "gen2",
          cost_details: { input: 0, output: 0, total: 0.03 },
          start_time: nowMicro + 1000,
          event_ts: nowMicro + 1000,
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: traceId2,
          project_id: projectId,
          type: "GENERATION",
          name: "gen3",
          cost_details: { input: 0, output: 0, total: 0.1 },
          start_time: nowMicro + 2000,
          event_ts: nowMicro + 2000,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringOptionsFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "any of",
          values: [traceId1, traceId2],
        }),
      );

      const { query, params } = new AggregateQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        {
          measures: [
            { measure: "totalCost", aggregation: "sum" },
            { measure: "count", aggregation: "count" },
          ],
          dimensions: ["traceId"],
        },
      )
        .where(filters)
        .orderBy("totalCost_sum", "desc")
        .limit(10)
        .buildQuery();

      // SQL assertions - single CTE for both measures (same grouping)
      expect(query).toContain("sum(e.total_cost) as totalCost_sum");
      expect(query).toContain("count(*) as count_count");
      expect(query).toContain("GROUP BY e.trace_id");

      // Execution assertions
      const result = await queryClickhouse<{
        traceId: string;
        totalCost_sum: number;
        count_count: number;
      }>({ query, params });

      const trace1Result = result.find((r) => r.traceId === traceId1);
      const trace2Result = result.find((r) => r.traceId === traceId2);

      expect(trace1Result).toBeDefined();
      expect(trace1Result?.totalCost_sum).toBeCloseTo(0.08, 2);
      expect(trace1Result?.count_count).toBe(2);

      expect(trace2Result).toBeDefined();
      expect(trace2Result?.totalCost_sum).toBeCloseTo(0.1, 2);
      expect(trace2Result?.count_count).toBe(1);
    });

    it("should create separate CTEs for different grouping keys (trace + environment)", async () => {
      const traceId = randomUUID();
      const spanId1 = randomUUID();
      const spanId2 = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: spanId1,
          span_id: spanId1,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          name: "gen1",
          environment: "production",
          cost_details: { input: 0, output: 0, total: 0.05 },
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
        createEvent({
          id: spanId2,
          span_id: spanId2,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          name: "gen2",
          environment: "production",
          cost_details: { input: 0, output: 0, total: 0.03 },
          start_time: nowMicro + 1000,
          event_ts: nowMicro + 1000,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "traceId", "environment"],
      )
        .withRollup({
          measures: [{ measure: "totalCost", aggregation: "sum" }],
          dimensions: ["traceId"],
        })
        .withRollup({
          measures: [{ measure: "count", aggregation: "count" }],
          dimensions: ["environment"],
        })
        .where(filters)
        .buildQuery();

      // SQL assertions - separate CTEs for different groupings
      expect(query).toContain("WITH rollup_0 AS");
      expect(query).toContain("rollup_1 AS");
      expect(query).toContain("sum(e.total_cost) as traceId_totalCost_sum");
      expect(query).toContain("count(*) as environment_count_count");
      expect(query).toContain("LEFT JOIN rollup_0");
      expect(query).toContain("LEFT JOIN rollup_1");

      // Execution assertions - verify both rollup columns present
      const result = await queryClickhouse<{
        id: string;
        traceId: string;
        environment: string;
        traceId_totalCost_sum: number;
        environment_count_count: number;
      }>({ query, params });

      expect(result).toHaveLength(2);
      expect(result[0].traceId_totalCost_sum).toBeCloseTo(0.08, 2);
      expect(result[1].traceId_totalCost_sum).toBeCloseTo(0.08, 2);
      expect(result[0].environment_count_count).toBeGreaterThanOrEqual(2);
    });

    it("should handle rollup column naming for single dimension", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: spanId,
          span_id: spanId,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          cost_details: { input: 0, output: 0, total: 0.1 },
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id"],
      )
        .withRollup({
          measures: [{ measure: "totalCost", aggregation: "sum" }],
          dimensions: ["traceId"],
        })
        .where(filters)
        .buildQuery();

      // SQL assertion - verify systematic naming
      expect(query).toContain("traceId_totalCost_sum");

      // Execution assertion - verify column exists in results
      const result = await queryClickhouse<{
        id: string;
        traceId_totalCost_sum: number;
      }>({ query, params });

      expect(result).toHaveLength(1);
      expect(result[0].traceId_totalCost_sum).toBeCloseTo(0.1, 2);
    });

    it("should handle rollup column naming for multiple dimensions", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: spanId,
          span_id: spanId,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          name: "test-gen",
          cost_details: { input: 0, output: 0, total: 0.15 },
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id"],
      )
        .withRollup({
          measures: [{ measure: "totalCost", aggregation: "avg" }],
          dimensions: ["traceId", "name"],
        })
        .where(filters)
        .buildQuery();

      // SQL assertion - verify systematic naming with multiple dimensions
      expect(query).toContain("traceId_name_totalCost_avg");

      // Execution assertion
      const result = await queryClickhouse<{
        id: string;
        traceId_name_totalCost_avg: number;
      }>({ query, params });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("traceId_name_totalCost_avg");
      expect(result[0].traceId_name_totalCost_avg).toBeCloseTo(0.15, 2);
    });

    it("should use explicit aliases when provided", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: spanId,
          span_id: spanId,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          cost_details: { input: 0, output: 0, total: 0.1 },
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "traceId"],
      )
        .withRollup({
          measures: [
            { measure: "totalCost", aggregation: "sum", alias: "traceCost" },
          ],
          dimensions: ["traceId"],
        })
        .where(filters)
        .buildQuery();

      // SQL assertions - verify custom alias used
      expect(query).toContain("sum(e.total_cost) as traceCost");
      expect(query).toContain("rollup_0.traceCost");
      expect(query).not.toContain("traceId_totalCost_sum");

      // Execution assertions - verify alias in results
      const result = await queryClickhouse<{
        id: string;
        traceId: string;
        traceCost: number;
      }>({ query, params });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("traceCost");
      expect(result[0].traceCost).toBeCloseTo(0.1, 2);
    });

    it("should accumulate filters from multiple where() calls", async () => {
      const traceId = randomUUID();
      const spanId1 = randomUUID();
      const spanId2 = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: spanId1,
          span_id: spanId1,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
          environment: "production",
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
        createEvent({
          id: spanId2,
          span_id: spanId2,
          trace_id: traceId,
          project_id: projectId,
          type: "SPAN",
          environment: "staging",
          start_time: nowMicro + 1000,
          event_ts: nowMicro + 1000,
        }),
      ]);

      const filters1 = new FilterList();
      filters1.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const filters2 = new FilterList();
      filters2.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.environment",
          operator: "=",
          value: "production",
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "type", "environment"],
      )
        .where(filters1)
        .where(filters2)
        .limit(10)
        .buildQuery();

      // SQL assertions - both filters present
      expect(query).toContain("e.trace_id");
      expect(query).toContain("e.environment");

      // Execution assertions - only production observation returned
      const result = await queryClickhouse<{
        id: string;
        type: string;
        environment: string;
      }>({ query, params });

      const ourEvents = result.filter(
        (r) => r.id === spanId1 || r.id === spanId2,
      );
      expect(ourEvents).toHaveLength(1);
      expect(ourEvents[0].environment).toBe("production");
    });

    it("should filter by rollup columns", async () => {
      const traceId1 = randomUUID();
      const traceId2 = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: traceId1,
          project_id: projectId,
          type: "GENERATION",
          cost_details: { input: 0, output: 0, total: 0.6 }, // > 0.5
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          trace_id: traceId2,
          project_id: projectId,
          type: "GENERATION",
          cost_details: { input: 0, output: 0, total: 0.05 }, // < 0.5
          start_time: nowMicro + 1000,
          event_ts: nowMicro + 1000,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringOptionsFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "any of",
          values: [traceId1, traceId2],
        }),
      );
      filters.push(
        new NumberFilter({
          clickhouseTable: "events",
          field: "traceId_totalCost_sum",
          operator: ">",
          value: 0.5,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "traceId"],
      )
        .withRollup({
          measures: [{ measure: "totalCost", aggregation: "sum" }],
          dimensions: ["traceId"],
        })
        .where(filters)
        .buildQuery();

      // SQL assertions - verify rollup and filter
      expect(query).toContain("WITH rollup_0 AS");
      expect(query).toContain("traceId_totalCost_sum");
      expect(query).toContain("traceId_totalCost_sum >");

      // Execution assertions - only trace1 should be returned (cost > 0.5)
      const result = await queryClickhouse<{
        id: string;
        traceId: string;
        traceId_totalCost_sum: number;
      }>({ query, params });

      const trace1Events = result.filter((r) => r.traceId === traceId1);
      const trace2Events = result.filter((r) => r.traceId === traceId2);

      expect(trace1Events.length).toBeGreaterThan(0);
      expect(trace2Events.length).toBe(0); // Filtered out
    });

    it("should handle empty result sets", async () => {
      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: "non-existent-trace",
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "traceId"],
      )
        .where(filters)
        .buildQuery();

      // SQL assertion
      expect(query).toContain("e.trace_id");

      // Execution assertion
      const result = await queryClickhouse<{
        id: string;
        traceId: string;
      }>({ query, params });

      expect(result).toEqual([]);
    });

    it("should handle NULL values in fields", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();
      const nowMicro = Date.now() * 1000;

      await createEventsCh([
        createEvent({
          id: spanId,
          span_id: spanId,
          trace_id: traceId,
          project_id: projectId,
          type: "SPAN",
          name: null as any,
          start_time: nowMicro,
          event_ts: nowMicro,
        }),
      ]);

      const filters = new FilterList();
      filters.push(
        new StringFilter({
          clickhouseTable: "events",
          field: "e.trace_id",
          operator: "=",
          value: traceId,
        }),
      );

      const { query, params } = new SelectQueryBuilder(
        projectId,
        EVENTS_FIELD_CATALOG,
        ["id", "name"],
      )
        .where(filters)
        .buildQuery();

      // SQL assertion
      expect(query).toContain("e.name as name");

      // Execution assertion - ClickHouse returns empty string for NULL strings
      const result = await queryClickhouse<{
        id: string;
        name: string | null;
      }>({ query, params });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("");
    });
  });

  maybe("Validation Tests", () => {
    it("should throw error for invalid field in constructor", () => {
      expect(() => {
        new SelectQueryBuilder(projectId, EVENTS_FIELD_CATALOG, [
          "invalidField",
        ]);
      }).toThrow("Unknown field: invalidField");
    });

    it("should throw error for using measure in select", () => {
      expect(() => {
        new SelectQueryBuilder(projectId, EVENTS_FIELD_CATALOG, ["totalCost"]);
      }).toThrow("totalCost is a measure, not a field");
    });

    it("should throw error for invalid aggregation", () => {
      expect(() => {
        new AggregateQueryBuilder(projectId, EVENTS_FIELD_CATALOG, {
          measures: [{ measure: "totalCost", aggregation: "count" as any }],
          dimensions: ["traceId"],
        });
      }).toThrow("Aggregation count not allowed for measure totalCost");
    });

    it("should throw error for non-groupable field in dimensions", () => {
      expect(() => {
        new AggregateQueryBuilder(projectId, EVENTS_FIELD_CATALOG, {
          measures: [{ measure: "count", aggregation: "count" }],
          dimensions: ["id"], // id is not groupable
        });
      }).toThrow("Field id is not groupable");
    });
  });
});
