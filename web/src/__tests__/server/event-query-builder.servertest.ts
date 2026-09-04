import {
  buildEventsFilterOptionColumnQuery,
  buildEventsFilterOptionsForColumnsQuery,
  buildEventsMetadataValuesQuery,
  CTEQueryBuilder,
  createFilterFromFilterState,
  EventsAggregationQueryBuilder,
  EventsQueryBuilder,
  eventsTableUiColumnDefinitions,
  ExperimentsAggregationQueryBuilder,
} from "@langfuse/shared/src/server";
import {
  eventsTableCachedInputCostSql,
  eventsTableCachedInputTokensSql,
  eventsTableCols,
} from "@langfuse/shared";

describe("buildEventsFilterOptionsForColumnsQuery", () => {
  it.each([
    ["cachedInputTokens", eventsTableCachedInputTokensSql, "Decimal64(3)"],
    ["cachedInputCost", eventsTableCachedInputCostSql, "Decimal64(12)"],
  ] as const)(
    "maps %s filters to the cached-read metric expression",
    (column, expression, clickhouseType) => {
      const [filter] = createFilterFromFilterState(
        [
          {
            column,
            type: "number",
            operator: "=",
            value: 0,
          },
        ],
        eventsTableUiColumnDefinitions,
        eventsTableCols,
      );

      expect(filter).toBeDefined();
      if (!filter) throw new Error("expected filter");
      const applied = filter.apply();
      expect(applied.query).toContain(expression);
      expect(applied.query).toContain(clickhouseType);
      expect(Object.values(applied.params)).toContain("0");
    },
  );

  it.each([
    ["cachedInputTokens", eventsTableCachedInputTokensSql],
    ["cachedInputCost", eventsTableCachedInputCostSql],
  ] as const)(
    "keeps missing %s distinguishable from an explicit zero",
    (column, expression) => {
      expect(expression).toContain("mapExists");
      expect(
        eventsTableCols.find((definition) => definition.id === column),
      ).toMatchObject({ nullable: true });

      const [filter] = createFilterFromFilterState(
        [
          {
            column,
            type: "null",
            operator: "is null",
            value: "",
          },
        ],
        eventsTableUiColumnDefinitions,
        eventsTableCols,
      );

      expect(filter).toBeDefined();
      if (!filter) throw new Error("expected filter");
      expect(filter.apply().query).toContain(`${expression} is null`);
    },
  );

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

  it("samples the base events scan and scales counts by the sample factor", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["name"],
      limit: 1000,
      sampleRows: 6_000_000,
      includeApproxCount: true,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("FROM events_core e SAMPLE 6000000");
    expect(built.query).toContain("any(e._sample_factor) AS sample_factor");
    expect(built.query).toContain(
      "toUInt64(round(tupleElement(option, 3) * sample_factor)) AS count",
    );
  });

  it("leaves the bulk facet scan exact without a sample size", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["name"],
      limit: 1000,
      includeApproxCount: true,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).not.toContain("SAMPLE");
    expect(built.query).not.toContain("_sample_factor");
    expect(built.query).not.toContain("sample_factor");
    expect(built.query).toContain("tupleElement(option, 3) AS count");
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
      "tuple('name', tupleElement(option, 1), tupleElement(option, 2), -toInt64(tupleElement(option, 2)), '')",
    );
    expect(built.query).toContain(
      "tuple('traceTags', tupleElement(option, 1), tupleElement(option, 2), toInt64(0), '')",
    );
    expect(built.query).toContain(
      "tuple('isRootObservation', tupleElement(option, 1), tupleElement(option, 2), if(tupleElement(option, 1) = 'true', toInt64(1), toInt64(0)), '')",
    );
    expect(built.query).toContain(
      "ORDER BY column ASC, tupleElement(option, 4) ASC, tupleElement(option, 2) ASC",
    );
  });

  it("scans e.release for the release filter option column", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["release"],
      limit: 1000,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("e.release");
    expect(built.query).toContain("tuple('release'");
    expect(built.query).toContain("AS displayValue");
  });

  it("labels experimentId options with experiment_name via displayValue", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["experimentId"],
      limit: 1000,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain(
      "tuple(toString(ifNull(e.experiment_id, '')), toString(ifNull(e.experiment_name, '')))",
    );
    expect(built.query).toContain(
      "tuple('experimentId', tupleElement(tupleElement(option, 1), 1), tupleElement(option, 2), -toInt64(tupleElement(option, 2)), tupleElement(tupleElement(option, 1), 2))",
    );
    expect(built.query).toContain("tupleElement(option, 5) AS displayValue");
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

  it("reuses row-selection score dependencies and full-table routing", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [
        {
          // `contains` is truncation-unsafe (a match can sit past char 200),
          // so it must force full-table routing — which is what this test
          // asserts. A short `=`/`starts with` value stays on events_core.
          column: "metadata",
          operator: "contains",
          key: "region",
          value: "eu",
          type: "stringObject",
        },
        {
          column: "scores_avg",
          operator: ">",
          key: "quality",
          value: 0.5,
          type: "numberObject",
        },
      ],
      columns: ["name"],
      limit: 10,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("LEFT JOIN scores_agg AS s");
    expect(built.query).toContain("LEFT JOIN trace_scores_agg AS ts");
    expect(built.query).toContain("FROM events_full e");
    expect(Object.values(built.params)).toContain("quality");
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
    expect(built.query).toContain(
      "COALESCE(nullIf(e.trace_name, ''), if((e.parent_span_id = '' OR e.is_app_root = true), nullIf(e.name, ''), NULL))",
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

  it("samples the grouped column scan and scales its counts", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "level",
      limit: 10,
      sampleRows: 6_000_000,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("FROM events_core e SAMPLE 6000000");
    expect(built.query).toContain(
      "toUInt64(round(count() * any(e._sample_factor))) AS count",
    );
  });

  it("leaves the grouped column scan exact without a sample size", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "level",
      limit: 10,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).not.toContain("SAMPLE");
    expect(built.query).not.toContain("_sample_factor");
    expect(built.query).toContain("count() AS count");
  });

  it("builds release filter options from the observation release column", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "release",
      limit: 10,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("'release' AS column");
    expect(built.query).toContain("toString(e.release) AS value");
    expect(built.query).toContain("e.release IS NOT NULL");
  });

  it("builds API key filter options from ingestion attribution", () => {
    const built = buildEventsFilterOptionColumnQuery({
      projectId: "test-project",
      filter: [],
      column: "ingestionApiKey",
      limit: 10,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("'ingestionApiKey' AS column");
    expect(built.query).toContain("toString(e.ingestion_api_key) AS value");
    expect(built.query).toContain("length(e.ingestion_api_key) > 0");
    expect(built.query).not.toContain("FINAL");
  });

  it.each([
    // The SDK attribution columns default to the 'unknown' placeholder
    // (clickhouse migration 0042), so their facets must exclude it;
    // events_core.source has no such placeholder (plain '' default).
    ["ingestionSdkName", "e.ingestion_sdk_name", true],
    ["ingestionSdkVersion", "e.ingestion_sdk_version", true],
    ["ingestionSource", "e.source", false],
  ] as const)(
    "builds %s filter options from ingestion attribution",
    (column, expression, excludesUnknownPlaceholder) => {
      const built = buildEventsFilterOptionColumnQuery({
        projectId: "test-project",
        filter: [],
        column,
        limit: 10,
      });

      expect(built).not.toBeNull();
      if (!built) throw new Error("expected query");

      expect(built.query).toContain(`'${column}' AS column`);
      expect(built.query).toContain(`toString(${expression}) AS value`);
      expect(built.query).toContain(`length(${expression}) > 0`);
      if (excludesUnknownPlaceholder) {
        expect(built.query).toContain(`${expression} != 'unknown'`);
      } else {
        expect(built.query).not.toContain("!= 'unknown'");
      }
      expect(built.query).not.toContain("FINAL");
    },
  );

  it.each(["pk-lf-test", ""])(
    "maps API key value %j to the ingestion attribution column",
    (apiKey) => {
      const [filter] = createFilterFromFilterState(
        [
          {
            column: "ingestionApiKey",
            type: "stringOptions",
            operator: "any of",
            value: [apiKey],
          },
        ],
        eventsTableUiColumnDefinitions,
        eventsTableCols,
      );

      expect(filter).toBeDefined();
      if (!filter) throw new Error("expected filter");
      const applied = filter.apply();
      expect(applied.query).toContain('e."ingestion_api_key" IN');
      expect(Object.values(applied.params)).toContainEqual([apiKey]);
    },
  );

  it.each([
    ["ingestionSdkName", 'e."ingestion_sdk_name" IN', "python"],
    ["ingestionSdkVersion", 'e."ingestion_sdk_version" IN', "4.7.1"],
    ["ingestionSource", 'e."source" IN', "otel"],
  ] as const)(
    "maps %s filters to the ingestion attribution column",
    (column, expectedClause, value) => {
      const [filter] = createFilterFromFilterState(
        [
          {
            column,
            type: "stringOptions",
            operator: "any of",
            value: [value],
          },
        ],
        eventsTableUiColumnDefinitions,
        eventsTableCols,
      );

      expect(filter).toBeDefined();
      if (!filter) throw new Error("expected filter");
      const applied = filter.apply();
      expect(applied.query).toContain(expectedClause);
      expect(Object.values(applied.params)).toContainEqual([value]);
    },
  );

  it("maps release filters to the observation release column", () => {
    const [filter] = createFilterFromFilterState(
      [
        {
          column: "release",
          type: "stringOptions",
          operator: "any of",
          value: ["181"],
        },
      ],
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    );

    expect(filter).toBeDefined();
    if (!filter) throw new Error("expected filter");
    const applied = filter.apply();
    expect(applied.query).toContain("e.release IN");
    expect(Object.values(applied.params)).toContainEqual(["181"]);
  });

  it("treats an empty observation release as null", () => {
    const [filter] = createFilterFromFilterState(
      [
        {
          column: "release",
          type: "null",
          operator: "is null",
          value: "",
        },
      ],
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    );

    expect(filter).toBeDefined();
    if (!filter) throw new Error("expected filter");
    expect(filter.apply().query).toContain(
      `(e.release = '' OR e.release IS NULL)`,
    );
  });

  it("treats an empty experiment ID as null", () => {
    const [filter] = createFilterFromFilterState(
      [
        {
          column: "experimentId",
          type: "null",
          operator: "is null",
          value: "",
        },
      ],
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    );

    expect(filter).toBeDefined();
    if (!filter) throw new Error("expected filter");
    expect(filter.apply().query).toContain(
      `(e."experiment_id" = '' OR e."experiment_id" IS NULL)`,
    );
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

  it("folds distinct metadata key names into the bulk facet scan", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      projectId: "test-project",
      filter: [],
      columns: ["metadataKeys"],
      limit: 100,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query.match(/FROM events_core e/g)).toHaveLength(1);
    expect(built.query).toContain("e.project_id = {projectId: String}");
    expect(built.query).toContain("arrayDistinct(e.metadata_names)");
    expect(built.query).toContain("approx_top_kArray");
    expect(built.query).toContain("tuple('metadataKeys'");
    expect(built.query).not.toMatch(/\bJOIN\b/i);
    expect(built.params).toMatchObject({
      projectId: "test-project",
      optionLimit: 100,
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

describe("buildEventsMetadataValuesQuery", () => {
  it("aggregates values for a specific metadata key", () => {
    const built = buildEventsMetadataValuesQuery({
      projectId: "test-project",
      filter: [],
      key: "region",
      limit: 100,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("FROM events_core e");
    expect(built.query).toContain(
      "e.metadata_values[indexOf(e.metadata_names, {metadataKey: String})]",
    );
    expect(built.query).toContain(
      "has(e.metadata_names, {metadataKey: String})",
    );
    expect(built.query).toContain("GROUP BY value");
    expect(built.query).toContain("ORDER BY count() DESC, value ASC");
    expect(built.params).toMatchObject({
      projectId: "test-project",
      metadataKey: "region",
      limit: 100,
    });
  });

  it("samples the value scan and scales its counts", () => {
    const built = buildEventsMetadataValuesQuery({
      projectId: "test-project",
      filter: [],
      key: "region",
      limit: 100,
      sampleRows: 6_000_000,
    });

    expect(built).not.toBeNull();
    if (!built) throw new Error("expected query");

    expect(built.query).toContain("FROM events_core e SAMPLE 6000000");
    expect(built.query).toContain(
      "toUInt64(round(count() * any(e._sample_factor))) AS count",
    );
  });

  it("returns null for an empty key", () => {
    expect(
      buildEventsMetadataValuesQuery({
        projectId: "test-project",
        filter: [],
        key: "",
        limit: 100,
      }),
    ).toBeNull();
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

  it("builds event-table optimized order by columns for a CTE alias", () => {
    const builder = new CTEQueryBuilder()
      .withCTE("base", {
        query:
          "SELECT project_id, start_time, trace_id, id, experiment_id FROM events_core",
        params: {},
        schema: ["project_id", "start_time", "trace_id", "id", "experiment_id"],
      })
      .from("base", "b")
      .select("b.id")
      .orderByColumns(
        [
          { column: "b.start_time", direction: "DESC" },
          { column: "xxHash32(b.trace_id)", direction: "DESC" },
          { column: "b.id", direction: "DESC" },
          { column: "b.experiment_id", direction: "DESC" },
        ],
        { eventTableAlias: "b", matchTablePrimaryKey: true },
      );

    const { query } = builder.buildWithParams();

    expect(query).toContain(
      "ORDER BY b.project_id DESC, toStartOfMinute(b.start_time) DESC, b.start_time DESC, xxHash32(b.trace_id) DESC, b.id DESC, b.experiment_id DESC",
    );
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

describe("ExperimentsAggregationQueryBuilder", () => {
  it("keeps the existing lookback start time bound", () => {
    const { query, params } = new ExperimentsAggregationQueryBuilder({
      projectId: "test-project",
    })
      .selectFieldSet("base")
      .withStartTimeFrom("2026-01-01 00:00:00.000")
      .whereRaw("e.experiment_id != ''")
      .buildWithParams();

    expect(query).toContain(
      "e.start_time >= {startTimeFrom: DateTime64(3)} - INTERVAL 2 DAY",
    );
    expect(query).toContain("e.experiment_id != ''");
    expect(params).toMatchObject({
      projectId: "test-project",
      startTimeFrom: "2026-01-01 00:00:00.000",
    });
  });
});
