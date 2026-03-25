import {
  CTEQueryBuilder,
  EventsAggregationQueryBuilder,
  EventsQueryBuilder,
  createFilterTreeFromFilterExpression,
  eventsTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import { eventsTableCols, type FilterExpression } from "@langfuse/shared";

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
  it("adds trace hash pruning only for mandatory traceId filters", () => {
    const filterExpression: FilterExpression = {
      type: "group",
      operator: "AND",
      conditions: [
        {
          type: "string",
          column: "traceId",
          operator: "=",
          value: "trace-1",
        },
        {
          type: "group",
          operator: "OR",
          conditions: [
            {
              type: "string",
              column: "name",
              operator: "=",
              value: "alpha",
            },
            {
              type: "string",
              column: "name",
              operator: "=",
              value: "beta",
            },
          ],
        },
      ],
    };

    const compiledFilter = createFilterTreeFromFilterExpression(
      filterExpression,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    );

    const { query, params } = new EventsQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("count")
      .applyFilters(compiledFilter)
      .buildWithParams();

    expect(query).toContain(
      "xxHash32(trace_id) = xxHash32({traceIdXxHash: String})",
    );
    expect(params.traceIdXxHash).toBe("trace-1");
  });

  it("does not add trace hash pruning for OR-only traceId filters", () => {
    const filterExpression: FilterExpression = {
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "string",
          column: "traceId",
          operator: "=",
          value: "trace-1",
        },
        {
          type: "string",
          column: "name",
          operator: "=",
          value: "alpha",
        },
      ],
    };

    const compiledFilter = createFilterTreeFromFilterExpression(
      filterExpression,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    );

    const { query, params } = new EventsQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("count")
      .applyFilters(compiledFilter)
      .buildWithParams();

    expect(query).not.toContain("traceIdXxHash");
    expect(params.traceIdXxHash).toBeUndefined();
  });

  it("keeps the authorized project filter outside nested OR expressions", () => {
    const filterExpression: FilterExpression = {
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "string",
          column: "name",
          operator: "=",
          value: "alpha",
        },
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "SPAN",
        },
      ],
    };

    const compiledFilter = createFilterTreeFromFilterExpression(
      filterExpression,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    );

    const { query, params } = new EventsQueryBuilder({
      projectId: "authorized-project",
    })
      .selectFieldSet("count")
      .applyFilters(compiledFilter)
      .buildWithParams();

    expect(query).toContain("WHERE e.project_id = {projectId: String}");
    expect(query).toMatch(
      /WHERE e\.project_id = \{projectId: String\}[\s\S]*AND \(\(.+\) OR \(.+\)\)/,
    );
    expect(params.projectId).toBe("authorized-project");
  });
});
