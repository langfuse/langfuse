import { createFilterFromFilterState } from "@langfuse/shared/src/server";
import {
  InvalidRequestError,
  type UiColumnMapping,
  type ColumnDefinition,
} from "@langfuse/shared";

describe("createFilterFromFilterState filter type validation", () => {
  const mappings: Record<string, UiColumnMapping> = {
    metadata: {
      uiTableName: "Metadata",
      uiTableId: "metadata",
      clickhouseTableName: "traces",
      clickhouseSelect: "metadata",
      queryPrefix: "t",
    },
    name: {
      uiTableName: "Name",
      uiTableId: "name",
      clickhouseTableName: "traces",
      clickhouseSelect: "name",
      queryPrefix: "t",
    },
    timestamp: {
      uiTableName: "Timestamp",
      uiTableId: "timestamp",
      clickhouseTableName: "traces",
      clickhouseSelect: "timestamp",
      queryPrefix: "t",
    },
    environment: {
      uiTableName: "Environment",
      uiTableId: "environment",
      clickhouseTableName: "traces",
      clickhouseSelect: "environment",
    },
    tags: {
      uiTableName: "Tags",
      uiTableId: "tags",
      clickhouseTableName: "traces",
      clickhouseSelect: "tags",
      queryPrefix: "t",
    },
    score_categories: {
      uiTableName: "Scores (categorical)",
      uiTableId: "score_categories",
      clickhouseTableName: "scores",
      clickhouseSelect: "s.score_categories",
    },
    eventInput: {
      uiTableName: "Input",
      uiTableId: "input",
      clickhouseTableName: "events_proto",
      clickhouseSelect: "e.input",
    },
    eventOutput: {
      uiTableName: "Output",
      uiTableId: "output",
      clickhouseTableName: "events_proto",
      clickhouseSelect: "e.output",
    },
    eventMetadata: {
      uiTableName: "Metadata",
      uiTableId: "metadata",
      clickhouseTableName: "events_proto",
      clickhouseSelect: "metadata",
      queryPrefix: "e",
    },
    eventName: {
      uiTableName: "Event Name",
      uiTableId: "eventName",
      clickhouseTableName: "events_proto",
      clickhouseSelect: "e.name",
    },
  };

  const columnDefinitions: ColumnDefinition[] = [
    {
      name: "Metadata",
      id: "metadata",
      type: "stringObject",
      internal: "t.metadata",
    },
    {
      name: "Name",
      id: "name",
      type: "stringOptions",
      internal: "t.name",
      options: [],
    },
    {
      name: "Timestamp",
      id: "timestamp",
      type: "datetime",
      internal: "t.timestamp",
    },
    {
      name: "Environment",
      id: "environment",
      type: "stringOptions",
      internal: "t.environment",
      options: [],
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      internal: "t.tags",
      options: [],
    },
    {
      name: "Scores (categorical)",
      id: "score_categories",
      type: "categoryOptions",
      internal: "s.score_categories",
      options: [],
    },
    {
      name: "Input",
      id: "input",
      type: "string",
      internal: "e.input",
    },
    {
      name: "Output",
      id: "output",
      type: "string",
      internal: "e.output",
    },
    {
      name: "Event Name",
      id: "eventName",
      type: "string",
      internal: "e.name",
    },
  ];

  it.each([
    {
      column: "metadata",
      filterType: "string",
      operator: "contains",
      value: "cartesia",
      expectedType: "stringObject",
    },
    {
      column: "name",
      filterType: "number",
      operator: "=",
      value: 42,
      expectedType: "stringOptions",
    },
    {
      column: "timestamp",
      filterType: "string",
      operator: "contains",
      value: "2024",
      expectedType: "datetime",
    },
  ] as const)(
    "rejects $filterType filter on $column column (expected $expectedType)",
    ({ column, filterType, operator, value, expectedType }) => {
      expect(() =>
        createFilterFromFilterState(
          [{ column, type: filterType, operator, value } as any],
          [mappings[column]],
          columnDefinitions,
        ),
      ).toThrow(
        new InvalidRequestError(
          `Invalid filter type '${filterType}' for column '${column}'. Expected filter type '${expectedType}'.`,
        ),
      );
    },
  );

  it("rejects filter with unrecognized column name", () => {
    expect(() =>
      createFilterFromFilterState(
        [
          {
            column: "metadata.deployment_name",
            type: "string",
            operator: "=",
            value: "some-value",
          } as any,
        ],
        Object.values(mappings),
        columnDefinitions,
      ),
    ).toThrow(InvalidRequestError);
  });

  it("matches UiColumnMapping aliases during backend filter resolution", () => {
    const [result] = createFilterFromFilterState(
      [
        {
          column: "Tool Names",
          type: "arrayOptions",
          operator: "any of",
          value: ["create_ticket"],
        },
      ],
      [
        {
          uiTableName: "Tool Names (Available)",
          uiTableId: "toolNames",
          aliases: ["Tool Names"],
          clickhouseTableName: "observations",
          clickhouseSelect: "mapKeys(tool_definitions)",
        },
      ],
    );

    const { query, params } = result.apply();
    expect(query).toContain("mapKeys(tool_definitions)");
    expect(params).toEqual(
      expect.objectContaining({
        [Object.keys(params)[0]]: ["create_ticket"],
      }),
    );
  });

  it.each([
    {
      scenario: "matching filter type",
      column: "metadata",
      filter: {
        type: "stringObject",
        operator: "contains",
        key: "env",
        value: "production",
      },
      colDefs: columnDefinitions,
    },
    {
      scenario: "null filter bypasses validation",
      column: "metadata",
      filter: { type: "null", operator: "is null", value: "" as const },
      colDefs: columnDefinitions,
    },
    {
      scenario: "no columnDefinitions provided",
      column: "metadata",
      filter: { type: "string", operator: "contains", value: "cartesia" },
      colDefs: undefined,
    },
    {
      scenario: "no matching ColumnDefinition for column",
      column: "environment",
      filter: { type: "string", operator: "=", value: "production" },
      colDefs: [columnDefinitions[0]],
    },
    {
      scenario: "string filter on stringOptions column (cross-compatible)",
      column: "name",
      filter: { type: "string", operator: "contains", value: "test" },
      colDefs: columnDefinitions,
    },
    {
      scenario: "stringOptions filter on stringOptions column",
      column: "environment",
      filter: { type: "stringOptions", operator: "any of", value: ["prod"] },
      colDefs: columnDefinitions,
    },
    {
      scenario:
        "stringOptions filter on arrayOptions column (cross-compatible)",
      column: "tags",
      filter: { type: "stringOptions", operator: "any of", value: ["tag1"] },
      colDefs: columnDefinitions,
    },
    {
      scenario:
        "stringOptions filter on categoryOptions column (cross-compatible)",
      column: "score_categories",
      filter: {
        type: "stringOptions",
        operator: "any of",
        value: ["quality:good"],
      },
      colDefs: columnDefinitions,
    },
  ] as const)("allows filter when $scenario", ({ column, filter, colDefs }) => {
    const result = createFilterFromFilterState(
      [{ column, ...filter } as any],
      [mappings[column]],
      colDefs as ColumnDefinition[] | undefined,
    );
    expect(result).toHaveLength(1);
  });

  it("generates case-insensitive FTS SQL for event input/output matches", () => {
    const [result] = createFilterFromFilterState(
      [
        {
          column: "output",
          type: "string",
          operator: "matches",
          value: "needle",
        } as any,
      ],
      [mappings.eventOutput],
      columnDefinitions,
    );

    const { query, params } = result.apply();
    const paramName = Object.keys(params)[0];

    expect(query).toBe(
      `hasAllTokens(lower(e.output), lower({${paramName}: String}))`,
    );
    expect(params).toEqual({ [paramName]: "needle" });
  });

  it("keeps equality acceleration for event input/output filters", () => {
    const [result] = createFilterFromFilterState(
      [
        {
          column: "input",
          type: "string",
          operator: "=",
          value: "needle",
        },
      ],
      [mappings.eventInput],
      columnDefinitions,
    );

    const { query } = result.apply();

    expect(query).toContain("e.input =");
    expect(query).toContain("hasAllTokens(lower(e.input), lower(");
  });

  it("generates case-sensitive FTS SQL for event metadata matches", () => {
    const [result] = createFilterFromFilterState(
      [
        {
          column: "metadata",
          type: "stringObject",
          operator: "matches",
          key: "source",
          value: "needle",
        } as any,
      ],
      [mappings.eventMetadata],
      columnDefinitions,
    );

    const { query, params } = result.apply();

    expect(query).toContain("has(e.metadata_names,");
    expect(query).toContain("hasAllTokens(e.metadata_values,");
    expect(query).toContain(
      "hasAllTokens(e.metadata_values[indexOf(e.metadata_names,",
    );
    expect(query).not.toContain("lower(");
    expect(Object.values(params)).toEqual(["source", "needle"]);
  });

  it.each([
    {
      description: "non-indexed event string column",
      filter: {
        column: "eventName",
        type: "string",
        operator: "matches",
        value: "needle",
      },
      mapping: "eventName",
      colDefs: columnDefinitions,
    },
    {
      description: "non-events table",
      filter: {
        column: "metadata",
        type: "stringObject",
        operator: "matches",
        key: "source",
        value: "needle",
      },
      mapping: "metadata",
      colDefs: columnDefinitions,
    },
    {
      description: "tokenless value",
      filter: {
        column: "output",
        type: "string",
        operator: "matches",
        value: "!!!",
      },
      mapping: "eventOutput",
      colDefs: columnDefinitions,
    },
  ] as const)(
    "rejects matches on $description",
    ({ filter, mapping, colDefs }) => {
      expect(() =>
        createFilterFromFilterState(
          [filter as any],
          [mappings[mapping]],
          colDefs,
        ),
      ).toThrow(InvalidRequestError);
    },
  );
});
