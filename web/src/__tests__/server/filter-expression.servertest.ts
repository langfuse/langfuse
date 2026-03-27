import {
  filterExpression,
  normalizeFilterExpressionInput,
  type FilterCondition,
  type FilterExpression,
  type UiColumnMapping,
} from "@langfuse/shared";
import {
  FilterList,
  createFilterFromFilterState,
  createFilterTreeFromFilterExpression,
  createFilterTreeFromFilterInput,
} from "@langfuse/shared/src/server";

const testColumnMappings: UiColumnMapping[] = [
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "traces",
    clickhouseSelect: "name",
    queryPrefix: "t",
  },
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "traces",
    clickhouseSelect: "environment",
    queryPrefix: "t",
  },
  {
    uiTableName: "Type",
    uiTableId: "type",
    clickhouseTableName: "traces",
    clickhouseSelect: "type",
    queryPrefix: "t",
  },
];

const normalizeSql = (query: string) =>
  query
    .replace(/[()]/g, "")
    .replace(/stringFilter\w+/g, "stringFilter")
    .replace(/\s+/g, " ")
    .trim();

describe("filter expression helpers", () => {
  it("normalizes flat filters into a top-level AND group", () => {
    const flatFilters: FilterCondition[] = [
      {
        type: "string",
        column: "name",
        operator: "=",
        value: "alpha",
      },
      {
        type: "string",
        column: "environment",
        operator: "=",
        value: "prod",
      },
    ];

    expect(normalizeFilterExpressionInput(flatFilters)).toEqual({
      type: "group",
      operator: "AND",
      conditions: flatFilters,
    });
  });

  it("parses nested AND/OR groups", () => {
    const nestedFilter = {
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "group",
          operator: "AND",
          conditions: [
            {
              type: "string",
              column: "name",
              operator: "=",
              value: "alpha",
            },
            {
              type: "string",
              column: "environment",
              operator: "=",
              value: "prod",
            },
          ],
        },
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "SPAN",
        },
      ],
    } satisfies FilterExpression;

    expect(filterExpression.parse(nestedFilter)).toEqual(nestedFilter);
  });

  it("rejects empty groups", () => {
    const result = filterExpression.safeParse({
      type: "group",
      operator: "AND",
      conditions: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("recursive ClickHouse filter compilation", () => {
  it("compiles nested filters with explicit parentheses and unique params", () => {
    const expression: FilterExpression = {
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "group",
          operator: "AND",
          conditions: [
            {
              type: "string",
              column: "name",
              operator: "=",
              value: "alpha",
            },
            {
              type: "string",
              column: "environment",
              operator: "=",
              value: "prod",
            },
          ],
        },
        {
          type: "string",
          column: "type",
          operator: "=",
          value: "SPAN",
        },
      ],
    };

    const compiled = createFilterTreeFromFilterExpression(
      expression,
      testColumnMappings,
    ).apply();

    expect(compiled.query).toMatch(
      /^\(\(t\.name = \{stringFilter\w+: String\}\) AND \(t\.environment = \{stringFilter\w+: String\}\)\) OR \(t\.type = \{stringFilter\w+: String\}\)$/,
    );
    expect(Object.keys(compiled.params)).toHaveLength(3);
    expect(Object.values(compiled.params).sort()).toEqual([
      "SPAN",
      "alpha",
      "prod",
    ]);
  });

  it("keeps legacy flat filters equivalent after normalization", () => {
    const flatFilters: FilterCondition[] = [
      {
        type: "string",
        column: "name",
        operator: "=",
        value: "alpha",
      },
      {
        type: "string",
        column: "environment",
        operator: "=",
        value: "prod",
      },
    ];

    const legacyCompiled = new FilterList(
      createFilterFromFilterState(flatFilters, testColumnMappings),
    ).apply();
    const treeCompiled = createFilterTreeFromFilterInput(
      flatFilters,
      testColumnMappings,
    ).apply();

    expect(normalizeSql(treeCompiled.query)).toBe(
      normalizeSql(legacyCompiled.query),
    );
    expect(Object.values(treeCompiled.params).sort()).toEqual(
      Object.values(legacyCompiled.params).sort(),
    );
  });
});
