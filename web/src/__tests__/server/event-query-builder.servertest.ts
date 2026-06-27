import {
  buildEventsFilterOptionColumnQuery,
  buildEventsFilterOptionsForColumnsQuery,
  CTEQueryBuilder,
  EventsAggregationQueryBuilder,
  EventsQueryBuilder,
} from "@langfuse/shared/src/server";

describe("buildEventsFilterOptionsForColumnsQuery", () => {
  it("builds one events_core scan for multiple filter option columns", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["name", "traceTags", "isRootObservation"],
      limit: 1000,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query.match(/FROM events_core e/g)).toHaveLength(1);
    expect(built.query).toContain("e.project_id = {projectId: String}");
    expect(built.query).toContain("approx_top_kIf");
    expect(built.query).toContain("approx_top_kArray");
    expect(built.query).toContain("countIf");
    expect(built.query).toContain("arrayJoin(arrayConcat");
    expect(built.query).toContain("tuple('name'");
    expect(built.query).toContain("tuple('traceTags'");
    expect(built.query).toContain("tuple('isRootObservation'");
    expect(built.query).not.toContain("FINAL");
    expect(built.query).not.toMatch(/\bJOIN\b/i);
    expect(built.query).not.toContain("row_number()");
    expect(built.query).not.toContain("LIMIT {optionLimit: Int32} BY");
    expect(built.query).not.toContain("GROUP BY column");
    expect(built.query).not.toContain("top_options");
    expect(built.query).not.toContain("arrayEnumerate");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      optionLimit: 1000,
    });
    expect(built.params).not.toHaveProperty("optionReserved");
  });

  it("orders bulk filter option rows by per-column sort key and value", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["name", "traceTags", "isRootObservation"],
      limit: 1000,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain(
      "tuple('name', tupleElement(option, 1), tupleElement(option, 2), -toInt64(tupleElement(option, 2)))",
    );
    expect(built.query).toContain(
      "tuple('traceTags', tupleElement(option, 1), tupleElement(option, 2), toInt64(0))",
    );
    expect(built.query).toContain(
      "tuple('isRootObservation', tupleElement(option, 1), tupleElement(option, 2), if(tupleElement(option, 1) = 'true', toInt64(1), toInt64(0)))",
    );
    expect(built.query).toContain(
      "ORDER BY column ASC, tupleElement(option, 4) ASC, tupleElement(option, 2) ASC",
    );
  });

  it("applies events filters to the single base scan", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [
        {
          column: "startTime",
          operator: ">=",
          value: new Date("2026-01-01T00:00:00.000Z"),
          type: "datetime",
        },
      ],
      columns: ["name"],
      limit: 10,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query.match(/FROM events_core e/g)).toHaveLength(1);
    expect(built.query).toContain("start_time");
    expect(built.query).toContain("approx_top_kIf");
    expect(built.query).not.toContain("LIMIT {optionLimit: Int32} BY");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      optionLimit: 10,
    });
    expect(built.params).not.toHaveProperty("optionReserved");
  });

  it("applies the scored traces scope without caller-provided raw SQL", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "traceName",
      limit: 100,
      scope: "scoredTraces",
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain(
      "e.trace_id IN (SELECT DISTINCT trace_id FROM scores WHERE project_id = {projectId: String})",
    );
    expect(built.query).toContain("GROUP BY value");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      limit: 100,
    });
  });

  it("builds a direct grouped query for one scalar filter option column", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [
        {
          column: "startTime",
          operator: ">=",
          value: new Date("2026-01-01T00:00:00.000Z"),
          type: "datetime",
        },
      ],
      column: "level",
      limit: 10,
      offset: 20,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query.match(/FROM events_core e/g)).toHaveLength(1);
    expect(built.query).toContain("'level' AS column");
    expect(built.query).toContain("toString(e.level) AS value");
    expect(built.query).toContain("e.level IS NOT NULL");
    expect(built.query).toContain("GROUP BY value");
    expect(built.query).not.toContain("GROUP BY e.level");
    expect(built.query).toContain("ORDER BY count() DESC, value ASC");
    expect(built.query).toContain(
      "LIMIT {limit: Int32} OFFSET {offset: Int32}",
    );
    expect(built.query).not.toContain("arrayJoin(arrayConcat");
    expect(built.query).not.toContain("row_number()");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      limit: 10,
      offset: 20,
    });
  });

  it("builds a direct grouped query for one boolean filter option column", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "isRootObservation",
      limit: 2,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query.match(/FROM events_core e/g)).toHaveLength(1);
    expect(built.query).toContain("'isRootObservation' AS column");
    expect(built.query).toContain("AS value");
    expect(built.query).toContain("GROUP BY value");
    expect(built.query).not.toContain("GROUP BY if(");
    expect(built.query).toContain("ORDER BY value ASC");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      limit: 2,
    });
  });

  it("builds a direct grouped query for one array filter option column", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "traceTags",
      limit: 10,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query.match(/FROM events_core e/g)).toHaveLength(1);
    expect(built.query).toContain("'traceTags' AS column");
    expect(built.query).toContain("arrayJoin(arrayMap(");
    expect(built.query).toContain("length(e.tags) > 0");
    expect(built.query).toContain("GROUP BY value");
    expect(built.query).not.toContain("GROUP BY arrayJoin");
    expect(built.query).toContain("ORDER BY value ASC");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      limit: 10,
    });
  });

  it("rejects runtime values outside the filter option column registry", () => {
    expect(() =>
      buildEventsFilterOptionsForColumnsQuery({
        projectId: "test-project",
        filter: [],
        columns: ["name'; SELECT 1; --"] as any,
        limit: 1000,
      }),
    ).toThrow("Unsupported events filter option column");

    expect(() =>
      buildEventsFilterOptionColumnQuery({
        projectId: "test-project",
        filter: [],
        column: "name'; SELECT 1; --" as any,
        limit: 1000,
      }),
    ).toThrow("Unsupported events filter option column");
  });
});

describe("CTEQueryBuilder", () => {
  it("should compose multiple CTEs with type-safe references", () => {
    const tracesBuilder = new EventsAggregationQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("all")
      .orderBy("ORDER BY timestamp DESC");

    const builder = new CTEQueryBuilder()
      .withCTEFromBuilder("traces", tracesBuilder)
      .withCTE("scores", {
        query:
          "SELECT trace_id, score FROM scores WHERE project_id = {projectId: String}",
        params: { projectId: "test-project" },
        schema: ["trace_id", "score"],
      })
      .from("traces", "t")
      .leftJoin("scores", "s", "ON s.trace_id = t.id")
      .selectColumns("t.id", "t.name", "s.score") // Type-safe!
      .select("COUNT(*) as total") // Raw expression
      .whereRaw("t.id IN ({ids: Array(String)})", { ids: ["id1", "id2"] })
      .orderBy("ORDER BY t.timestamp DESC")
      .limit(10, 0);

    const { query, params } = builder.buildWithParams();

    expect(query).toContain("WITH traces AS");
    expect(query).toContain("scores AS");
    expect(query).toContain("FROM traces t");
    expect(query).toContain("LEFT JOIN scores s ON");
    expect(query).toContain("t.id");
    expect(query).toContain("t.name");
    expect(query).toContain("s.score");
    expect(query).toContain("COUNT(*) as total");
    expect(query).toContain("LIMIT {limit: Int32}");
    expect(params.projectId).toBe("test-project");
    expect(params.ids).toEqual(["id1", "id2"]);
    expect(params.limit).toBe(10);
  });

  it("should support type-safe selectColumns() after establishing aliases", () => {
    const builder = new CTEQueryBuilder()
      .withCTE("cte1", {
        query: "SELECT col1, col2 FROM table1",
        params: {},
        schema: ["col1", "col2"],
      })
      .withCTE("cte2", {
        query: "SELECT col3 FROM table2",
        params: {},
        schema: ["col3"],
      })
      .from("cte1", "c1")
      .leftJoin("cte2", "c2", "ON true")
      .selectColumns("c1.col1", "c1.col2", "c2.col3"); // All type-safe

    const { query } = builder.buildWithParams();

    expect(query).toContain("c1.col1");
    expect(query).toContain("c1.col2");
    expect(query).toContain("c2.col3");
  });

  it("should throw error for unregistered CTE in from()", () => {
    const builder = new CTEQueryBuilder() as any;
    expect(() => builder.from("nonexistent", "t")).toThrow(
      "CTE 'nonexistent' not registered",
    );
  });

  it("should throw error for unregistered CTE in leftJoin()", () => {
    const builder = new CTEQueryBuilder()
      .withCTE("traces", { query: "SELECT 1", params: {}, schema: ["col1"] })
      .from("traces", "t") as any;
    expect(() => builder.leftJoin("nonexistent", "x", "ON true")).toThrow(
      "CTE 'nonexistent' not registered",
    );
  });

  it("should throw error when building without FROM clause", () => {
    const builder = new CTEQueryBuilder()
      .withCTE("traces", { query: "SELECT 1", params: {}, schema: ["col1"] })
      .select("col1");

    expect(() => builder.buildWithParams()).toThrow("No FROM clause set");
  });

  it("should throw error when building without SELECT expressions", () => {
    const builder = new CTEQueryBuilder()
      .withCTE("traces", { query: "SELECT 1", params: {}, schema: ["col1"] })
      .from("traces", "t");

    expect(() => builder.buildWithParams()).toThrow("No SELECT expressions");
  });

  it("should merge params from multiple CTEs", () => {
    const builder = new CTEQueryBuilder()
      .withCTE("cte1", {
        query: "SELECT 1",
        params: { param1: "value1" },
        schema: ["col1", "col2"],
      })
      .withCTE("cte2", {
        query: "SELECT 2",
        params: { param2: "value2" },
        schema: ["col3"],
      })
      .from("cte1", "c1")
      .select("c1.col1")
      .whereRaw("c1.col2 = {param3: String}", { param3: "value3" });

    const { params } = builder.buildWithParams();

    expect(params.param1).toBe("value1");
    expect(params.param2).toBe("value2");
    expect(params.param3).toBe("value3");
  });
});

describe("EventsQueryBuilder", () => {
  it("should allow list queries to omit heavy tool payload columns while keeping tool call names", () => {
    const slimQuery = new EventsQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("baseWithoutTools", "calculated")
      .buildWithParams().query;

    const defaultQuery = new EventsQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("base", "calculated")
      .buildWithParams().query;

    expect(slimQuery).not.toContain('e.tool_definitions as "tool_definitions"');
    expect(slimQuery).not.toContain('e.tool_calls as "tool_calls"');
    expect(slimQuery).toContain('e.tool_call_names as "tool_call_names"');

    expect(defaultQuery).toContain('e.tool_definitions as "tool_definitions"');
    expect(defaultQuery).toContain('e.tool_calls as "tool_calls"');
    expect(defaultQuery).toContain('e.tool_call_names as "tool_call_names"');
  });

  it("should query events_full when forceFullTable is enabled", () => {
    const query = new EventsQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("core")
      .forceFullTable()
      .buildWithParams().query;

    expect(query).toContain("FROM events_full e");
  });

  it("should include pricing tier fields in observation list, detail, usage, and export field sets", () => {
    const buildQuery = (
      ...fieldSets: Parameters<EventsQueryBuilder["selectFieldSet"]>
    ) =>
      new EventsQueryBuilder({
        projectId: "test-project",
      })
        .selectFieldSet(...fieldSets)
        .buildWithParams().query;

    const listQuery = buildQuery("base", "calculated");
    const slimListQuery = buildQuery("baseWithoutTools", "calculated");
    const byIdQuery = buildQuery(
      "byIdBase",
      "byIdModel",
      "byIdPrompt",
      "byIdTimestamps",
    );
    const usageQuery = buildQuery("core", "usage");
    const exportQuery = buildQuery("export");

    [listQuery, slimListQuery, byIdQuery, usageQuery, exportQuery].forEach(
      (query) => {
        expect(query).toContain(
          'e.usage_pricing_tier_id as "usage_pricing_tier_id"',
        );
        expect(query).toContain(
          'e.usage_pricing_tier_name as "usage_pricing_tier_name"',
        );
      },
    );
  });

  it("should include experiment item metadata in eval field set", () => {
    const query = new EventsQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("eval")
      .buildWithParams().query;

    expect(query).toContain(
      "mapFromArrays(e.experiment_item_metadata_names, e.experiment_item_metadata_values) as experiment_item_metadata",
    );
  });
});
