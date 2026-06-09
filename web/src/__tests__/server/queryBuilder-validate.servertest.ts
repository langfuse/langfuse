import { validateQuery } from "./queryBuilder.fixtures";
import type { QueryType } from "./queryBuilder.fixtures";

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

  it("should return valid when high cardinality entityDimension has same-field bound", () => {
    const query: QueryType = {
      ...baseQuery,
      entityDimension: { field: "experimentName" },
      filters: [
        {
          column: "experimentName",
          operator: "any of",
          value: ["experiment-a"],
          type: "stringOptions",
        },
      ],
    };

    const result = validateQuery(query, "v2");

    expect(result).toEqual({ valid: true });
  });

  it("should return invalid when high cardinality entityDimension is unbounded", () => {
    const query: QueryType = {
      ...baseQuery,
      entityDimension: { field: "experimentName" },
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension 'experimentName'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "finite positive filter",
    );
  });

  it("should return invalid when high cardinality entityDimension has only wrong-field bound", () => {
    const query: QueryType = {
      ...baseQuery,
      entityDimension: { field: "experimentName" },
      filters: [
        {
          column: "experimentId",
          operator: "any of",
          value: ["experiment-id-a"],
          type: "stringOptions",
        },
      ],
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension 'experimentName'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "finite positive filter",
    );
  });

  it("should return invalid when high cardinality entityDimension only has top-N protection", () => {
    const query: QueryType = {
      ...baseQuery,
      entityDimension: { field: "experimentName" },
      chartConfig: { type: "table", row_limit: 10 },
      orderBy: [{ field: "sum_totalCost", direction: "desc" }],
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension 'experimentName'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "finite positive filter",
    );
  });

  it("should return invalid when entityDimension is used with v1", () => {
    const query: QueryType = {
      ...baseQuery,
      entityDimension: { field: "name" },
    };

    const result = validateQuery(query, "v1");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "entityDimension is only supported for v2 queries",
    );
  });

  it("should return invalid when high cardinality regular dimension is used with entityDimension", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }],
      entityDimension: { field: "experimentName" },
      filters: [
        {
          column: "experimentName",
          operator: "any of",
          value: ["experiment-a"],
          type: "stringOptions",
        },
      ],
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "High cardinality dimension(s) 'traceId'",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "entityDimension",
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

  it("should return invalid when high cardinality dimension is used with timeDimension", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "traceId" }], // high cardinality
      orderBy: [{ field: "sum_totalCost", direction: "desc" }],
      chartConfig: { type: "table", row_limit: 10 },
      timeDimension: { granularity: "day" }, // timeseries
    };

    const result = validateQuery(query, "v2");

    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toContain(
      "traceId",
    );
    expect((result as { valid: false; reason: string }).reason).toContain(
      "timeDimension",
    );
  });

  it("should return valid for low cardinality dimension with timeDimension", () => {
    const query: QueryType = {
      ...baseQuery,
      dimensions: [{ field: "name" }], // low cardinality
      timeDimension: { granularity: "day" },
    };

    const result = validateQuery(query, "v2");

    expect(result).toEqual({ valid: true });
  });
});
