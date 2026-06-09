import {
  QueryBuilder,
  executeQuery,
  getValidAggregationsForMeasureType,
  metricAggregations,
  env,
  createEvent,
  createEventsCh,
  clickhouseClient,
  randomUUID,
} from "./queryBuilder.fixtures";
import type { QueryType } from "./queryBuilder.fixtures";

describe("getValidAggregationsForMeasureType", () => {
  const allAggs = metricAggregations.options.length;
  const restricted = ["count", "uniq"];

  it.each([
    // Numeric types → all aggregations
    ["integer", allAggs],
    ["decimal", allAggs],
    ["number", allAggs],
    // Non-numeric / missing → restricted
    ["string", restricted.length],
    ["boolean", restricted.length],
    [undefined, restricted.length],
  ])("type=%s → %i aggregations", (type, expectedLength) => {
    const valid = getValidAggregationsForMeasureType(type);
    expect(valid).toHaveLength(expectedLength);
  });

  it("restricted set contains only count and uniq for string measures", () => {
    expect(getValidAggregationsForMeasureType("string")).toEqual(restricted);
  });
});

describe("query builder measure-aggregation validation", () => {
  it("should build base-table entity dimension queries without time-series SQL", async () => {
    const query: QueryType = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      filters: [
        {
          column: "experimentName",
          operator: "any of",
          value: ["experiment-a"],
          type: "stringOptions",
        },
        {
          column: "experimentId",
          operator: "any of",
          value: ["experiment-id-a"],
          type: "stringOptions",
        },
      ],
      timeDimension: null,
      entityDimension: { field: "experimentName" },
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: [{ field: "sum_totalCost", direction: "asc" }],
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    const result = await queryBuilder.build(query, randomUUID());

    expect(result.query).toContain("as entity_dimension");
    expect(result.query).toContain("GROUP BY entity_dimension");
    expect(result.query).not.toContain("time_dimension");
    expect(result.query).not.toContain("WITH FILL");
  });

  it("should include declared relation for relation-backed entity dimensions", async () => {
    const query: QueryType = {
      view: "scores-numeric",
      dimensions: [],
      metrics: [{ measure: "value", aggregation: "avg" }],
      filters: [],
      timeDimension: null,
      entityDimension: { field: "experimentName" },
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: [{ field: "avg_value", direction: "desc" }],
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    const result = await queryBuilder.build(query, randomUUID());

    expect(result.query).toContain(
      "INNER JOIN events_core AS events_observations",
    );
    expect(result.query).toContain("events_observations.experiment_name");
    expect(result.query).toContain("as entity_dimension");
    expect(result.query).toContain("GROUP BY entity_dimension");
  });

  it("should build run-level score entity queries without joining events", async () => {
    const query: QueryType = {
      view: "scores-numeric",
      dimensions: [],
      metrics: [{ measure: "value", aggregation: "avg" }],
      filters: [
        {
          column: "datasetRunId",
          operator: "is not null",
          value: "",
          type: "null",
        },
        {
          column: "name",
          operator: "=",
          value: "run_accuracy",
          type: "string",
        },
        {
          column: "datasetRunId",
          operator: "any of",
          value: ["experiment-1", "experiment-2"],
          type: "stringOptions",
        },
      ],
      timeDimension: null,
      entityDimension: { field: "datasetRunId" },
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: [{ field: "avg_value", direction: "desc" }],
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    const result = await queryBuilder.build(query, randomUUID());

    expect(result.query).toContain("scores.dataset_run_id");
    expect(result.query).toContain("entity_dimension");
    expect(result.query).not.toContain("JOIN events_core");
  });

  it("should reject queries with both timeDimension and entityDimension", async () => {
    const query: QueryType = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      filters: [],
      timeDimension: { granularity: "day" },
      entityDimension: { field: "experimentName" },
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    await expect(queryBuilder.build(query, randomUUID())).rejects.toThrow(
      "timeDimension and entityDimension are mutually exclusive",
    );
  });

  it("should reject v1 entityDimension queries at query-builder runtime", async () => {
    const query: QueryType = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      filters: [],
      timeDimension: null,
      entityDimension: { field: "name" },
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v1");
    await expect(queryBuilder.build(query, randomUUID())).rejects.toThrow(
      "entityDimension is only supported for v2 queries",
    );
  });

  it("should reject invalid aggregation for string measure", async () => {
    const query: QueryType = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "traceId", aggregation: "histogram" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    await expect(queryBuilder.build(query, randomUUID())).rejects.toThrow(
      /not valid for measure/,
    );
  });

  it("should accept uniq aggregation for string measure", async () => {
    const query: QueryType = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "traceId", aggregation: "uniq" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    const result = await queryBuilder.build(query, randomUUID());
    expect(result.query).toBeDefined();
  });

  it("should reject sum aggregation for uniqueUserIds on traces view", async () => {
    const query: QueryType = {
      view: "traces",
      dimensions: [],
      metrics: [{ measure: "uniqueUserIds", aggregation: "sum" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    await expect(queryBuilder.build(query, randomUUID())).rejects.toThrow(
      /not valid for measure/,
    );
  });

  it("should accept uniq aggregation for uniqueUserIds on traces view", async () => {
    const query: QueryType = {
      view: "traces",
      dimensions: [],
      metrics: [{ measure: "uniqueUserIds", aggregation: "uniq" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    const result = await queryBuilder.build(query, randomUUID());
    expect(result.query).toBeDefined();
  });

  it("should accept histogram aggregation for numeric measure", async () => {
    const query: QueryType = {
      view: "observations",
      dimensions: [],
      metrics: [{ measure: "latency", aggregation: "histogram" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-03-01T00:00:00.000Z",
      orderBy: null,
    };

    const queryBuilder = new QueryBuilder(undefined, "v2");
    const result = await queryBuilder.build(query, randomUUID());
    expect(result.query).toBeDefined();
  });

  describe("events_traces traceName filter", () => {
    const isEventsTableV2Enabled =
      env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" ? it : it.skip;
    let hasLegacyEventsTable = false;

    beforeAll(async () => {
      if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") return;

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

    isEventsTableV2Enabled(
      "should filter events_traces by traceName using aggregation logic",
      async () => {
        if (!hasLegacyEventsTable) return;

        const projectId = randomUUID();
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();

        // Trace 1: trace_name is empty, root event name is "my-trace"
        // The aggregation logic should reconstruct this trace's name as "my-trace"
        const events = [
          createEvent({
            project_id: projectId,
            trace_id: traceId1,
            trace_name: "",
            name: "my-trace",
            parent_span_id: "", // root event
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            trace_id: traceId1,
            trace_name: "",
            name: "child-observation",
            parent_span_id: "some-parent", // child event
            start_time: Date.now() * 1000,
          }),
          // Trace 2: trace_name is "other-trace"
          createEvent({
            project_id: projectId,
            trace_id: traceId2,
            trace_name: "other-trace",
            name: "root-event",
            parent_span_id: "", // root event
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        // Filter by name = "my-trace" — should find trace 1 (via root event name fallback)
        const result = await executeQuery(
          projectId,
          {
            view: "traces",
            dimensions: [{ field: "name" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [
              {
                column: "name",
                operator: "=",
                value: "my-trace",
                type: "string",
              },
            ],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
        );

        // Should return exactly 1 trace (trace 1) with name "my-trace"
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("my-trace");
      },
    );

    isEventsTableV2Enabled(
      "should filter events_traces by traceName column via resolveDimension fallback to name filterSql",
      async () => {
        if (!hasLegacyEventsTable) return;

        const projectId = randomUUID();
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();

        const events = [
          createEvent({
            project_id: projectId,
            trace_id: traceId1,
            trace_name: "target-trace",
            name: "root-observation",
            parent_span_id: "",
            start_time: Date.now() * 1000,
          }),
          createEvent({
            project_id: projectId,
            trace_id: traceId2,
            trace_name: "other-trace",
            name: "root-observation",
            parent_span_id: "",
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        // Filter using "traceName" column (triggers endsWith("Name") fallback)
        const result = await executeQuery(
          projectId,
          {
            view: "traces",
            dimensions: [{ field: "name" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [
              {
                column: "traceName",
                operator: "=",
                value: "target-trace",
                type: "string",
              },
            ],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
        );

        // Should return only the trace with trace_name = "target-trace"
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("target-trace");
      },
    );

    isEventsTableV2Enabled(
      "should filter events_traces by name filterSql combined with a regular dimension filter",
      async () => {
        if (!hasLegacyEventsTable) return;

        const projectId = randomUUID();
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const traceId3 = randomUUID();

        const events = [
          // Trace 1: name="target-trace", environment="production"
          createEvent({
            project_id: projectId,
            trace_id: traceId1,
            trace_name: "target-trace",
            name: "root-op",
            parent_span_id: "",
            environment: "production",
            start_time: Date.now() * 1000,
          }),
          // Trace 2: name="target-trace", environment="staging"
          createEvent({
            project_id: projectId,
            trace_id: traceId2,
            trace_name: "target-trace",
            name: "root-op",
            parent_span_id: "",
            environment: "staging",
            start_time: Date.now() * 1000,
          }),
          // Trace 3: name="other-trace", environment="production"
          createEvent({
            project_id: projectId,
            trace_id: traceId3,
            trace_name: "other-trace",
            name: "root-op",
            parent_span_id: "",
            environment: "production",
            start_time: Date.now() * 1000,
          }),
        ];
        await createEventsCh(events);

        // Filter by name (filterSql) AND environment (regular dimension)
        const result = await executeQuery(
          projectId,
          {
            view: "traces",
            dimensions: [{ field: "name" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [
              {
                column: "name",
                operator: "=",
                value: "target-trace",
                type: "string",
              },
              {
                column: "environment",
                operator: "=",
                value: "production",
                type: "string",
              },
            ],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
          "v2",
        );

        // Should return only trace 1 (matches both name AND environment)
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("target-trace");
      },
    );
  });

  describe("useFinal flag on events_core joins", () => {
    it("should omit FINAL for events_core joins in v2 scores-numeric view", async () => {
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");
      const { query: compiledQuery } = await builder.build(
        {
          view: "scores-numeric",
          dimensions: [{ field: "traceName" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          toTimestamp: new Date(Date.now()).toISOString(),
          orderBy: null,
        },
        projectId,
      );

      // events_core should be joined without FINAL (useFinal: false)
      expect(compiledQuery).toContain("JOIN events_core");
      expect(compiledQuery).not.toContain(
        "JOIN events_core AS events_traces FINAL",
      );
      // scores base CTE should still use FINAL
      expect(compiledQuery).toContain("scores scores_numeric FINAL");
    });

    it("should omit FINAL for events_observations join in v2 scores-categorical view", async () => {
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v2");
      const { query: compiledQuery } = await builder.build(
        {
          view: "scores-categorical",
          dimensions: [{ field: "observationName" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          toTimestamp: new Date(Date.now()).toISOString(),
          orderBy: null,
        },
        projectId,
      );

      // events_core should be joined without FINAL (useFinal: false)
      expect(compiledQuery).toContain("JOIN events_core");
      expect(compiledQuery).not.toContain(
        "JOIN events_core AS events_observations FINAL",
      );
    });

    it("should keep FINAL for non-events_core joins in v1 scores view", async () => {
      const projectId = randomUUID();
      const builder = new QueryBuilder(undefined, "v1");
      const { query: compiledQuery } = await builder.build(
        {
          view: "scores-numeric",
          dimensions: [{ field: "traceName" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          toTimestamp: new Date(Date.now()).toISOString(),
          orderBy: null,
        },
        projectId,
      );

      // v1 traces join should still use FINAL (useFinal defaults to true)
      expect(compiledQuery).toContain("JOIN traces FINAL");
    });
  });

  describe("rootEventCondition threshold gating", () => {
    const tracesV2Query: QueryType = {
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-01-04T00:00:00.000Z", // 3-day window (72 hours)
      orderBy: null,
    };

    it("should include rootEventCondition subquery when window is within threshold", async () => {
      // 168 hours (7 days) threshold, 72-hour window → should include subquery
      const builder = new QueryBuilder(undefined, "v2");
      builder.setRootEventConditionMaxWindowHours(168);
      const { query: sql } = await builder.build(tracesV2Query, randomUUID());
      expect(sql).toContain("IN (SELECT trace_id");
    });

    it("should skip rootEventCondition subquery when window exceeds threshold", async () => {
      // 24-hour threshold, 72-hour window → should skip subquery
      const builder = new QueryBuilder(undefined, "v2");
      builder.setRootEventConditionMaxWindowHours(24);
      const { query: sql } = await builder.build(tracesV2Query, randomUUID());
      expect(sql).not.toContain("IN (SELECT trace_id");
    });

    it("should always include rootEventCondition subquery when threshold is 0", async () => {
      // 0 = always apply, even for a very wide window
      const builder = new QueryBuilder(undefined, "v2");
      builder.setRootEventConditionMaxWindowHours(0);
      const { query: sql } = await builder.build(
        {
          ...tracesV2Query,
          fromTimestamp: "2024-01-01T00:00:00.000Z",
          toTimestamp: "2025-01-01T00:00:00.000Z", // 1-year window
        },
        randomUUID(),
      );
      expect(sql).toContain("IN (SELECT trace_id");
    });
  });
});
