import { describe, expect, it, vi } from "vitest";

import { InvalidRequestError } from "../../../errors";
import type { FilterCondition } from "../../../types";
import { getViewDeclaration } from "../dataModel";
import type { QueryType, ViewVersion } from "../types";
import { validateQuery } from "../validateQuery";
import { QueryBuilder } from "./queryBuilder";

// QueryBuilder.build checks the OTEL FINAL optimization before filter lowering.
// Mock it so these validation tests stay unit-level and do not need ClickHouse.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

const baseQuery = {
  view: "observations",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-02T00:00:00.000Z",
  orderBy: null,
} as QueryType;

const buildQueryWithFilter = (
  filter: FilterCondition,
  queryOverrides: Partial<QueryType> = {},
  version: ViewVersion = "v1",
) =>
  new QueryBuilder(undefined, version).build(
    {
      ...baseQuery,
      ...queryOverrides,
      filters: [filter],
    } as QueryType,
    "test-project",
  );

describe("queryBuilder filter type validation", () => {
  it("exposes only the typed Boolean score value as a dimension", () => {
    const view = getViewDeclaration("scores-boolean", "v2");

    expect(view.dimensions.booleanValue?.uiHidden).toBeUndefined();
    expect(view.dimensions.value).toBeUndefined();
  });

  it.each(["v1", "v2"] as const)(
    "declares prompt version dimensions as numbers in the %s scores view",
    (version) => {
      const scoresView = getViewDeclaration("scores-numeric", version);
      const observationsView = getViewDeclaration("observations", version);

      expect(scoresView.dimensions.observationPromptVersion?.type).toBe(
        "number",
      );
      expect(observationsView.dimensions.promptVersion?.type).toBe("number");
    },
  );

  it.each(["v1", "v2"] as const)(
    "lowers a numeric observationPromptVersion filter in the %s scores view",
    async (version) => {
      const { query } = await buildQueryWithFilter(
        {
          column: "observationPromptVersion",
          operator: "=",
          value: 2,
          type: "number",
        },
        { view: "scores-numeric" },
        version,
      );

      expect(query).toContain("prompt_version = {numberFilter");
      expect(query).not.toContain("position(");
    },
  );

  it.each(["v1", "v2"] as const)(
    "rejects a string observationPromptVersion filter in the %s scores view",
    async (version) => {
      await expect(
        buildQueryWithFilter(
          {
            column: "observationPromptVersion",
            operator: "contains",
            value: "2",
            type: "string",
          },
          { view: "scores-numeric" },
          version,
        ),
      ).rejects.toThrow(
        "Filter type 'string' is not supported for dimension type 'number'",
      );
    },
  );

  it.each(["v1", "v2"] as const)(
    "selects observationPromptVersion when grouping scores in %s",
    async (version) => {
      const { query } = await new QueryBuilder(undefined, version).build(
        {
          ...baseQuery,
          view: "scores-numeric",
          dimensions: [{ field: "observationPromptVersion" }],
        } as QueryType,
        "test-project",
      );

      expect(query).toContain("prompt_version");
      expect(query).toContain("observationPromptVersion");
    },
  );

  it.each(["v1", "v2"] as const)(
    "lowers a numeric promptVersion filter in the %s observations view",
    async (version) => {
      const { query } = await buildQueryWithFilter(
        {
          column: "promptVersion",
          operator: "=",
          value: 3,
          type: "number",
        },
        undefined,
        version,
      );

      expect(query).toContain("prompt_version = {numberFilter");
    },
  );

  it.each([
    {
      name: "arrayOptions on scalar string dimension",
      filter: {
        column: "sessionId",
        operator: "any of",
        value: ["session-a"],
        type: "arrayOptions",
      },
      expectedMessage:
        "Filter type 'arrayOptions' is not supported for dimension type 'string'",
    },
    {
      name: "number on scalar string dimension",
      filter: {
        column: "name",
        operator: ">",
        value: 1,
        type: "number",
      },
      expectedMessage:
        "Filter type 'number' is not supported for dimension type 'string'",
    },
    {
      name: "string on numeric dimension",
      filter: {
        column: "value",
        operator: "contains",
        value: "1",
        type: "string",
      },
      queryOverrides: {
        view: "scores-numeric",
      },
      expectedMessage:
        "Filter type 'string' is not supported for dimension type 'number'",
    },
    {
      name: "string on boolean score dimension",
      filter: {
        column: "booleanValue",
        operator: "=",
        value: "true",
        type: "string",
      },
      queryOverrides: {
        view: "scores-boolean",
      },
      expectedMessage:
        "Filter type 'string' is not supported for dimension type 'boolean'",
    },
    {
      name: "string on time dimension",
      filter: {
        column: "start_time",
        operator: "=",
        value: "2025-01-01",
        type: "string",
      },
      expectedMessage:
        "Filter type 'string' is not supported for time dimension 'start_time'",
    },
    {
      name: "stringOptions on query array dimension",
      filter: {
        column: "tags",
        operator: "any of",
        value: ["tag-a"],
        type: "stringOptions",
      },
      expectedMessage:
        "Filter type 'stringOptions' is not supported for dimension type 'string[]'. Expected 'arrayOptions'.",
    },
  ])(
    "rejects incompatible filter type: $name",
    async ({ filter, queryOverrides, expectedMessage }) => {
      await expect(
        buildQueryWithFilter(
          filter as FilterCondition,
          queryOverrides as Partial<QueryType> | undefined,
        ),
      ).rejects.toThrow(expectedMessage);
    },
  );

  it("rejects filters on pair-expanded dimensions", async () => {
    const result = buildQueryWithFilter(
      {
        column: "usageType",
        operator: "contains",
        value: "cache",
        type: "string",
      },
      undefined,
      "v2",
    );

    await expect(result).rejects.toThrow(InvalidRequestError);
    await expect(result).rejects.toThrow(
      "Field 'usageType' cannot be used as a filter.",
    );
  });

  it.each([
    {
      name: "arrayOptions on string array dimension",
      filter: {
        column: "tags",
        operator: "all of",
        value: ["tag-a", "tag-b"],
        type: "arrayOptions",
      },
    },
    {
      name: "arrayOptions on arrayString dimension",
      filter: {
        column: "toolNames",
        operator: "any of",
        value: ["search"],
        type: "arrayOptions",
      },
    },
  ])("allows compatible filter type: $name", async ({ filter }) => {
    const { query } = await buildQueryWithFilter(filter as FilterCondition);

    expect(query).toContain("has");
  });

  it("lowers a compatible boolean score filter to a Boolean SQL predicate", async () => {
    const { query } = await buildQueryWithFilter(
      {
        column: "booleanValue",
        operator: "=",
        value: true,
        type: "boolean",
      },
      { view: "scores-boolean" },
    );

    expect(query).toContain("toBool(scores_boolean.value) = {booleanFilter");
    expect(query).toContain(": Boolean}");
  });

  it.each(["v1", "v2"] as const)(
    "lowers evaluator score filters in the %s scores view",
    async (version) => {
      const { query } = await buildQueryWithFilter(
        {
          column: "evaluatorId",
          operator: "any of",
          value: ["evaluator-1", "rule-1"],
          type: "stringOptions",
        },
        { view: "scores-numeric" },
        version,
      );

      expect(query).toContain("scores_numeric.evaluator_id");
      expect(query).toContain("IN ({stringOptionsFilter");
    },
  );

  it.each(["v1", "v2"] as const)(
    "lowers rule score filters in the %s scores view",
    async (version) => {
      const { query } = await buildQueryWithFilter(
        {
          column: "ruleId",
          operator: "any of",
          value: ["rule-1"],
          type: "stringOptions",
        },
        { view: "scores-numeric" },
        version,
      );

      expect(query).toContain("scores_numeric.evaluation_rule_id");
      expect(query).toContain("IN ({stringOptionsFilter");
    },
  );

  it.each(["v1", "v2"] as const)(
    "lowers evaluator test filters in the %s scores view",
    async (version) => {
      const { query } = await buildQueryWithFilter(
        {
          column: "isEvaluatorTest",
          operator: "=",
          value: false,
          type: "boolean",
        },
        { view: "scores-numeric" },
        version,
      );

      expect(query).toContain("scores_numeric.metadata['evaluator_test']");
      expect(query).toContain(": Boolean}");
    },
  );

  it("lowers evaluator identity and test filters in the v2 observations view", async () => {
    const evaluatorIdQuery = await buildQueryWithFilter(
      {
        column: "evaluatorId",
        operator: "is not empty",
        value: "",
        type: "string",
      },
      { view: "observations" },
      "v2",
    );
    const evaluatorTestQuery = await buildQueryWithFilter(
      {
        column: "isEvaluatorTest",
        operator: "=",
        value: false,
        type: "boolean",
      },
      { view: "observations" },
      "v2",
    );

    expect(evaluatorIdQuery.query).toContain(
      "coalesce(nullIf(events_observations.evaluator_id, ''), events_observations.evaluation_rule_id)",
    );
    expect(evaluatorTestQuery.query).toContain(
      "events_observations.evaluator_execution_is_test",
    );
    expect(evaluatorIdQuery.query).toContain("!= ''");
    expect(evaluatorTestQuery.query).toContain(": Boolean}");
  });

  it("lowers the semantic-root observation filter only in the v2 events view", async () => {
    const { query } = await buildQueryWithFilter(
      {
        column: "isRootObservation",
        operator: "=",
        value: true,
        type: "boolean",
      },
      undefined,
      "v2",
    );

    expect(query).toContain(
      "toBool((events_observations.parent_span_id = '' OR events_observations.is_app_root = true)) = {booleanFilter",
    );
    expect(query).toContain(": Boolean}");

    await expect(
      buildQueryWithFilter(
        {
          column: "isRootObservation",
          operator: "=",
          value: true,
          type: "boolean",
        },
        undefined,
        "v1",
      ),
    ).rejects.toThrow(/Invalid filter column isRootObservation/);
  });
});

describe("legacy traces compatibility when routed through v2", () => {
  it.each([
    ["uniqueUserIds", "user_id"],
    ["uniqueSessionIds", "session_id"],
  ] as const)(
    "preserves the legacy numeric fallback for max(%s) in v2",
    async (measure, column) => {
      const query = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure, aggregation: "max" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-01-02T00:00:00.000Z",
        orderBy: null,
      } as QueryType;

      await expect(
        new QueryBuilder(undefined, "v1").build(query, "test-project"),
      ).resolves.toBeDefined();

      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        "v2",
      ).build(query, "test-project", true);

      expect(compiledQuery).toContain(
        `uniq(nullIf(events_traces.${column}, '')) as ${measure}`,
      );
      expect(compiledQuery).toContain(`max(${measure}) as max_${measure}`);
    },
  );

  it.each([
    ["uniqueUserIds", "user_id"],
    ["uniqueSessionIds", "session_id"],
  ] as const)(
    "remaps count(%s) to uniq while preserving the legacy result alias",
    async (measure, column) => {
      const query = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure, aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-01-02T00:00:00.000Z",
        orderBy: null,
      } as QueryType;

      const { query: twoLevelQuery } = await new QueryBuilder(
        undefined,
        "v2",
      ).build(query, "test-project");

      expect(twoLevelQuery).toContain(
        `argMaxIf(nullIf(events_traces.${column}, ''), events_traces.event_ts, events_traces.${column} <> '') as ${measure}`,
      );
      expect(twoLevelQuery).toContain(`uniq(${measure}) as count_${measure}`);
    },
  );

  it.each([
    ["uniqueUserIds", "user_id"],
    ["uniqueSessionIds", "session_id"],
  ] as const)(
    "uses canonical per-trace uniq aggregation for %s",
    async (measure, column) => {
      const query = {
        view: "traces",
        dimensions: [],
        metrics: [{ measure, aggregation: "uniq" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-01-02T00:00:00.000Z",
        orderBy: null,
      } as QueryType;

      const { query: compiledQuery } = await new QueryBuilder(
        undefined,
        "v2",
      ).build(query, "test-project");

      expect(compiledQuery).toContain(
        `argMaxIf(nullIf(events_traces.${column}, ''), events_traces.event_ts, events_traces.${column} <> '') as ${measure}`,
      );
      expect(compiledQuery).toContain(`uniq(${measure}) as uniq_${measure}`);
    },
  );

  it.each(["id", "userId", "sessionId"] as const)(
    "keeps a legacy %s time-series breakdown valid in v2",
    (dimension) => {
      const query = {
        view: "traces",
        dimensions: [{ field: dimension }],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: { granularity: "auto" },
        fromTimestamp: "2025-01-01T00:00:00.000Z",
        toTimestamp: "2025-01-02T00:00:00.000Z",
        orderBy: null,
      } as QueryType;

      expect(validateQuery(query, "v1")).toEqual({ valid: true });
      expect(validateQuery(query, "v2")).toEqual({ valid: true });
    },
  );
});

describe("queryBuilder DateTime64 parameter encoding", () => {
  it("encodes epoch fromTimestamp without ClickHouse-rejected numeric 0", async () => {
    const query = {
      view: "traces",
      dimensions: [],
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "1970-01-01T00:00:00.000Z",
      toTimestamp: "2026-08-14T21:30:00.000Z",
      orderBy: null,
    } as QueryType;

    const queryBuilder = new QueryBuilder(undefined, "v2");
    queryBuilder.setRootEventConditionMaxWindowHours(0);

    const { query: compiledQuery, parameters } = await queryBuilder.build(
      query,
      "test-project",
      true,
    );

    expect(compiledQuery).toContain("DateTime64(3, 'UTC')");
    expect(compiledQuery).not.toContain(": DateTime64(3)}");

    const dateTimeParams = Object.entries(parameters).filter(
      ([key]) =>
        key.startsWith("dateTimeFilter") ||
        key.startsWith("subFrom") ||
        key.startsWith("subTo"),
    );

    expect(dateTimeParams.length).toBeGreaterThan(0);
    expect(dateTimeParams.some(([key]) => key.startsWith("subFrom"))).toBe(
      true,
    );
    expect(dateTimeParams.some(([key]) => key.startsWith("subTo"))).toBe(true);
    for (const [, value] of dateTimeParams) {
      // ClickHouse rejects numeric 0 for DateTime64(3) query parameters.
      expect(value).not.toBe(0);
      expect(typeof value).toBe("string");
    }
    expect(Object.values(parameters)).toContain("1970-01-01 00:00:00.000");
    expect(Object.values(parameters)).toContain("2026-08-14 21:30:00.000");
  });

  it("binds WITH FILL bounds as UTC DateTime64 parameters", async () => {
    const query = {
      view: "traces",
      dimensions: [],
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [],
      timeDimension: { granularity: "day" },
      fromTimestamp: "2025-01-01T00:00:00.000Z",
      toTimestamp: "2025-01-02T00:00:00.000Z",
      orderBy: null,
    } as QueryType;

    const { query: compiledQuery, parameters } = await new QueryBuilder(
      undefined,
      "v2",
    ).build(query, "test-project", true);

    expect(compiledQuery).toContain(
      "toDate({fillFromDate: DateTime64(3, 'UTC')})",
    );
    expect(compiledQuery).toContain(
      "toDate({fillToDate: DateTime64(3, 'UTC')})",
    );
    expect(parameters.fillFromDate).toBe("2025-01-01 00:00:00.000");
    expect(parameters.fillToDate).toBe("2025-01-02 00:00:00.000");
  });
});

describe("toolCallInvocations measure", () => {
  it("auto-includes distinct calledToolNames in a two-level query", async () => {
    const { query: compiledQuery } = await new QueryBuilder(
      undefined,
      "v1",
    ).build(
      {
        ...baseQuery,
        metrics: [{ measure: "toolCallInvocations", aggregation: "sum" }],
      },
      "test-project",
    );

    expect(compiledQuery).toContain(
      "arrayJoin(arrayDistinct(observations.tool_call_names)) as calledToolNames",
    );
    expect(compiledQuery).toContain(
      "countEqual(any(observations.tool_call_names), calledToolNames)",
    );
    expect(compiledQuery).toContain("sum(toolCallInvocations)");
  });

  it("stays single-level for the events view", async () => {
    const { query: compiledQuery } = await new QueryBuilder(
      undefined,
      "v2",
    ).build(
      {
        ...baseQuery,
        metrics: [{ measure: "toolCallInvocations", aggregation: "sum" }],
      },
      "test-project",
      true,
    );

    expect(compiledQuery).toContain(
      "arrayJoin(arrayDistinct(events_observations.tool_call_names)) as calledToolNames",
    );
    expect(compiledQuery).toContain(
      "sum(countEqual((events_observations.tool_call_names), calledToolNames))",
    );
    expect(compiledQuery).not.toContain(
      "any(events_observations.tool_call_names)",
    );
    expect(compiledQuery.match(/\bSELECT\b/g)).toHaveLength(1);
  });

  it("honors a stored count aggregation instead of the UI default sum", async () => {
    const { query: compiledQuery } = await new QueryBuilder(
      undefined,
      "v1",
    ).build(
      {
        ...baseQuery,
        metrics: [{ measure: "toolCallInvocations", aggregation: "count" }],
      },
      "test-project",
    );

    expect(compiledQuery).toContain("count(toolCallInvocations)");
    expect(compiledQuery).not.toContain("sum(toolCallInvocations)");
  });
});

describe("toolCalls stored aggregation", () => {
  it("compiles count(toolCalls) when the widget stored count, not the UI default sum", async () => {
    const { query: compiledQuery } = await new QueryBuilder(
      undefined,
      "v1",
    ).build(
      {
        ...baseQuery,
        metrics: [{ measure: "toolCalls", aggregation: "count" }],
      },
      "test-project",
    );

    expect(compiledQuery).toContain("count(toolCalls)");
    expect(compiledQuery).not.toContain("sum(toolCalls)");
  });
});
