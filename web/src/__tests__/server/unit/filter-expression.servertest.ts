import {
  combineFilterInputsWithAnd,
  filterExpression,
  filterInput,
  getFilterExpressionBoundsIssue,
  getMandatoryFilterExpressionLeafFilters,
  MAX_FILTER_EXPRESSION_DEPTH,
  MAX_FILTER_EXPRESSION_NODES,
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

// Strip parentheses and randomized param suffixes so two structurally
// equivalent compilations compare equal.
const normalizeSql = (query: string) =>
  query
    .replace(/[()]/g, "")
    .replace(/stringFilter\w+/g, "stringFilter")
    .replace(/\s+/g, " ")
    .trim();

const leaf = (column: string, value: string): FilterCondition => ({
  type: "string",
  column,
  operator: "=",
  value,
});

describe("filter expression contract", () => {
  it("normalizes flat filters into a top-level AND group", () => {
    const flatFilters: FilterCondition[] = [
      leaf("name", "alpha"),
      leaf("environment", "prod"),
    ];

    expect(normalizeFilterExpressionInput(flatFilters)).toEqual({
      type: "group",
      operator: "AND",
      conditions: flatFilters,
    });
  });

  it("normalizes empty / nullish input to undefined", () => {
    expect(normalizeFilterExpressionInput([])).toBeUndefined();
    expect(normalizeFilterExpressionInput(undefined)).toBeUndefined();
    expect(normalizeFilterExpressionInput(null)).toBeUndefined();
  });

  it("parses nested AND/OR groups", () => {
    const nestedFilter = {
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "group",
          operator: "AND",
          conditions: [leaf("name", "alpha"), leaf("environment", "prod")],
        },
        leaf("type", "SPAN"),
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

  it("returns AND-only leaves as mandatory, none under an OR", () => {
    const andOnly: FilterExpression = {
      type: "group",
      operator: "AND",
      conditions: [
        leaf("name", "alpha"),
        {
          type: "group",
          operator: "AND",
          conditions: [leaf("environment", "prod")],
        },
      ],
    };
    expect(
      getMandatoryFilterExpressionLeafFilters(andOnly).map((f) => f.column),
    ).toEqual(["name", "environment"]);

    const withOr: FilterExpression = {
      type: "group",
      operator: "AND",
      conditions: [
        leaf("name", "alpha"),
        {
          type: "group",
          operator: "OR",
          conditions: [leaf("environment", "prod"), leaf("type", "SPAN")],
        },
      ],
    };
    // The OR subtree contributes nothing — only the AND-reachable leaf remains.
    expect(
      getMandatoryFilterExpressionLeafFilters(withOr).map((f) => f.column),
    ).toEqual(["name"]);
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
          conditions: [leaf("name", "alpha"), leaf("environment", "prod")],
        },
        leaf("type", "SPAN"),
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
      leaf("name", "alpha"),
      leaf("environment", "prod"),
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

  it("collapses a single-child group to the unwrapped child", () => {
    const compiled = createFilterTreeFromFilterExpression(
      {
        type: "group",
        operator: "OR",
        conditions: [leaf("name", "alpha")],
      },
      testColumnMappings,
    ).apply();

    // No OR / parentheses for a single condition.
    expect(compiled.query).not.toContain(" OR ");
    expect(compiled.query).toMatch(/^t\.name = \{stringFilter\w+: String\}$/);
  });

  it("emits nothing for an empty tree", () => {
    expect(
      createFilterTreeFromFilterExpression(
        undefined,
        testColumnMappings,
      ).apply(),
    ).toEqual({ query: "", params: {} });
  });
});

describe("filter expression bounds", () => {
  const nestToDepth = (depth: number): FilterExpression => {
    let expression: FilterExpression = leaf("name", "alpha");
    for (let i = 0; i < depth; i++) {
      expression = { type: "group", operator: "AND", conditions: [expression] };
    }
    return expression;
  };

  it("accepts an expression within the depth and node bounds", () => {
    expect(getFilterExpressionBoundsIssue(nestToDepth(3))).toBeNull();
    expect(
      filterInput.safeParse([leaf("name", "alpha"), leaf("type", "SPAN")])
        .success,
    ).toBe(true);
  });

  it("rejects an expression nested beyond the depth bound", () => {
    const tooDeep = nestToDepth(MAX_FILTER_EXPRESSION_DEPTH + 1);
    expect(getFilterExpressionBoundsIssue(tooDeep)).toMatch(
      /nested too deeply/,
    );
    expect(filterInput.safeParse(tooDeep).success).toBe(false);
  });

  it("counts leaf conditions, not the wrapping group (no off-by-one)", () => {
    // Exactly MAX flat conditions must be ALLOWED — the normalized wrapping AND
    // group does not count toward the condition cap.
    const exact: FilterCondition[] = Array.from(
      { length: MAX_FILTER_EXPRESSION_NODES },
      (_, i) => leaf("name", `value-${i}`),
    );
    expect(
      getFilterExpressionBoundsIssue(normalizeFilterExpressionInput(exact)),
    ).toBeNull();
    expect(filterInput.safeParse(exact).success).toBe(true);
  });

  it("rejects an expression with too many conditions", () => {
    const wide: FilterCondition[] = Array.from(
      { length: MAX_FILTER_EXPRESSION_NODES + 1 },
      (_, i) => leaf("name", `value-${i}`),
    );
    expect(
      getFilterExpressionBoundsIssue(normalizeFilterExpressionInput(wide)),
    ).toMatch(/too many conditions/);
    expect(filterInput.safeParse(wide).success).toBe(false);
  });

  it("treats a single-branch OR as mandatory (stays in sync with SQL collapse)", () => {
    const singletonOr: FilterExpression = {
      type: "group",
      operator: "OR",
      conditions: [leaf("name", "alpha")],
    };
    expect(
      getMandatoryFilterExpressionLeafFilters(singletonOr).map((f) => f.column),
    ).toEqual(["name"]);
  });

  it("rejects oversized trees at the compiler boundary too", () => {
    expect(() =>
      createFilterTreeFromFilterExpression(
        nestToDepth(MAX_FILTER_EXPRESSION_DEPTH + 1),
        testColumnMappings,
      ),
    ).toThrow(/nested too deeply/);
  });
});

describe("combineFilterInputsWithAnd", () => {
  const leafA = leaf("name", "a");
  const leafB = leaf("environment", "prod");
  const orTree: FilterExpression = {
    type: "group",
    operator: "OR",
    conditions: [leaf("level", "ERROR"), leaf("level", "WARNING")],
  };

  it("returns a flat array when every combined condition is a leaf", () => {
    expect(combineFilterInputsWithAnd([leafA], [leafB])).toEqual([
      leafA,
      leafB,
    ]);
  });

  it("flattens AND-of-AND so the depth budget is not wasted", () => {
    const innerAnd: FilterExpression = {
      type: "group",
      operator: "AND",
      conditions: [leafA, leafB],
    };
    // innerAnd + a leaf must yield a single flat AND, not AND(AND(...), leaf).
    expect(
      combineFilterInputsWithAnd(innerAnd, [leaf("type", "SPAN")]),
    ).toEqual([leafA, leafB, leaf("type", "SPAN")]);
  });

  it("wraps an OR tree in an outer AND with extra leaves (never inside the OR)", () => {
    expect(combineFilterInputsWithAnd(orTree, [leafB])).toEqual({
      type: "group",
      operator: "AND",
      conditions: [orTree, leafB],
    });
  });

  it("collapses to the single branch and ignores empty inputs", () => {
    expect(combineFilterInputsWithAnd(orTree, [], undefined)).toEqual(orTree);
    expect(combineFilterInputsWithAnd([], undefined)).toBeUndefined();
  });
});
