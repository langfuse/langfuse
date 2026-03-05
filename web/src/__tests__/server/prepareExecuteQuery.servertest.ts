import {
  prepareExecuteQuery,
  toClickhouseQueryOpts,
} from "@/src/features/query/server/queryExecutor";

describe("prepareExecuteQuery", () => {
  const baseQuery = {
    view: "traces" as const,
    dimensions: [],
    metrics: [{ measure: "count" as const, aggregation: "count" as const }],
    filters: [],
    timeDimension: null,
    fromTimestamp: new Date(Date.now() - 3600_000).toISOString(),
    toTimestamp: new Date().toISOString(),
    orderBy: null,
  };

  it("should return compiled query and parameters", async () => {
    const result = await prepareExecuteQuery({
      projectId: "test-project-id",
      query: baseQuery,
    });

    expect(result.compiledQuery).toBeDefined();
    expect(typeof result.compiledQuery).toBe("string");
    expect(result.compiledQuery.length).toBeGreaterThan(0);
    expect(result.parameters).toBeDefined();
    expect(typeof result.parameters).toBe("object");
  });

  it("should include correct clickhouse settings", async () => {
    const result = await prepareExecuteQuery({
      projectId: "test-project-id",
      query: baseQuery,
    });

    expect(result.clickhouseSettings).toHaveProperty(
      "date_time_output_format",
      "iso",
    );
    expect(result.clickhouseSettings).toHaveProperty(
      "max_bytes_before_external_group_by",
    );
  });

  it("should set tags with projectId and view", async () => {
    const result = await prepareExecuteQuery({
      projectId: "test-project-id",
      query: baseQuery,
    });

    expect(result.tags).toEqual({
      feature: "custom-queries",
      type: "traces",
      kind: "analytic",
      projectId: "test-project-id",
    });
  });

  it("should detect trace table usage", async () => {
    const result = await prepareExecuteQuery({
      projectId: "test-project-id",
      query: baseQuery,
    });

    // Traces view should reference the traces table
    expect(result.usesTraceTable).toBe(true);
  });

  it("should convert to clickhouse query opts", async () => {
    const result = await prepareExecuteQuery({
      projectId: "test-project-id",
      query: baseQuery,
    });

    const chOpts = toClickhouseQueryOpts(result);

    expect(chOpts.query).toBe(result.compiledQuery);
    expect(chOpts.params).toBe(result.parameters);
    expect(chOpts.tags).toBe(result.tags);
    expect(chOpts.preferredClickhouseService).toBe(
      result.preferredClickhouseService,
    );
    expect(chOpts.clickhouseConfigs?.clickhouse_settings).toBeDefined();
  });

  it("should route events views to EventsReadOnly", async () => {
    const eventsQuery = {
      ...baseQuery,
      view: "observations" as const,
    };

    const result = await prepareExecuteQuery({
      projectId: "test-project-id",
      query: eventsQuery,
      version: "v2" as const,
    });

    // v2 observations use events_core baseCte
    expect(result.preferredClickhouseService).toBe("EventsReadOnly");
  });
});
