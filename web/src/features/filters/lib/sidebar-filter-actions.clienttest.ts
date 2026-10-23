// @vitest-environment node

import {
  type FilterState,
  singleFilter,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
} from "@langfuse/shared";
import {
  addTextFilterEntry,
  applyCheckboxSelection,
  applyKeyedFilterEntries,
  applyNumericRange,
  applySelection,
  applyStringContains,
  buildOnlySelection,
  clearCategoricalColumn,
  deriveOperatorChange,
  removeColumnFiltersOfType,
  removeTextFilterEntry,
  type SidebarFilterActionContext,
} from "./sidebar-filter-actions";

// The exclusion/complement gestures (LFE-10717) are covered end-to-end in
// sidebarArrayOptionsExclusion.clienttest.tsx; these tests pin the pure
// per-action transitions directly.

const ctx: SidebarFilterActionContext = {
  facets: [
    { type: "categorical", column: "env", label: "Environment" },
    { type: "categorical", column: "tags", label: "Tags" },
    {
      type: "boolean",
      column: "bookmarked",
      label: "Bookmarked",
      trueLabel: "Starred",
      falseLabel: "Not starred",
    },
    { type: "numeric", column: "latency", label: "Latency", min: 0, max: 10 },
  ],
  columnDefinitions: [
    {
      id: "env",
      name: "Environment",
      type: "stringOptions",
      options: [],
      internal: "e",
    },
    {
      id: "tags",
      name: "Tags",
      type: "arrayOptions",
      options: [],
      internal: "t",
    },
  ],
  options: {
    env: ["prod", "dev", "test"],
    tags: ["a", "b"],
    bookmarked: [],
  },
};

describe("applySelection", () => {
  it.each(["any of", "all of", "none of"] as const)(
    "keeps an empty tag selection when toggling to %s",
    (operator) => {
      const empty = applyCheckboxSelection(ctx, [], "tags", []);
      const change = deriveOperatorChange(ctx, empty, "tags")!;
      expect(change.values).toEqual([]);
      expect(applySelection(ctx, empty, "tags", change.values, operator)).toBe(
        empty,
      );
    },
  );

  it.each(["env", "tags"])(
    "matches nothing when every default %s option is unchecked",
    (column) => {
      const type = column === "tags" ? "arrayOptions" : "stringOptions";
      const defaultValue = column === "tags" ? "a" : "prod";
      const other: FilterState = [
        { column: "bookmarked", type: "boolean", operator: "=", value: true },
      ];
      for (const current of [
        other,
        [
          ...other,
          { column, type, operator: "none of", value: ["stale"] },
        ] satisfies FilterState,
      ]) {
        const empty = applyCheckboxSelection(ctx, current, column, []);
        const value = current.length > 1 ? "stale" : defaultValue;
        expect(empty).toEqual([
          ...other,
          { column, type, operator: "any of", value: [value] },
          { column, type, operator: "none of", value: [value] },
        ]);
        expect(decodeFiltersGeneric(encodeFiltersGeneric(empty))).toEqual(
          empty,
        );
      }
    },
  );

  it("keeps an explicit empty all-of waiting for selection", () => {
    const change = deriveOperatorChange(ctx, [], "tags")!;
    const next = applySelection(ctx, [], "tags", change.values, "all of");
    expect(next).toEqual([
      { column: "tags", type: "arrayOptions", operator: "all of", value: [] },
    ]);
    expect(singleFilter.safeParse(next[0]).success).toBe(true);
    expect(applyCheckboxSelection(ctx, next, "tags", ["a"])).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["a"],
      },
    ]);
  });

  it.each([
    {
      column: "env",
      type: "stringOptions",
      operator: "any of",
      value: ["prod"],
      target: "run-b",
    },
    {
      column: "tags",
      type: "arrayOptions",
      operator: "any of",
      value: ["a"],
      target: "run-b",
    },
    {
      column: "tags",
      type: "arrayOptions",
      operator: "all of",
      value: ["a"],
      target: "run-b",
    },
  ] satisfies FilterState)(
    "keeps an empty positive selection for $column ($operator)",
    (filter) => {
      const { column, type, value } = filter;
      const current: FilterState = [filter];
      const empty = applyCheckboxSelection(ctx, current, column, []);
      expect(empty).toEqual([
        {
          column,
          type,
          operator: "any of",
          value: [value[0]],
          target: "run-b",
        },
        {
          column,
          type,
          operator: "none of",
          value: [value[0]],
          target: "run-b",
        },
      ]);
      expect(
        empty.every((filter) => singleFilter.safeParse(filter).success),
      ).toBe(true);
      expect(decodeFiltersGeneric(encodeFiltersGeneric(empty))).toEqual(empty);
      expect(deriveOperatorChange(ctx, empty, column)?.values).toEqual([]);
      expect(applyCheckboxSelection(ctx, empty, column, value)).toEqual([
        { column, type, operator: "any of", value, target: "run-b" },
      ]);
      expect(clearCategoricalColumn(empty, column)).toEqual([]);
    },
  );

  it.each(["env", "tags"])(
    "keeps empty %s selections valid when options are blank or unavailable",
    (column) => {
      const type = column === "tags" ? "arrayOptions" : "stringOptions";
      for (const options of [[], [""]]) {
        const empty = applyCheckboxSelection(
          { ...ctx, options: { [column]: options } },
          [{ column, type, operator: "any of", value: [""] }],
          column,
          [],
        );
        expect(empty).toHaveLength(2);
        expect(
          empty.every((filter) => singleFilter.safeParse(filter).success),
        ).toBe(true);
        expect(decodeFiltersGeneric(encodeFiltersGeneric(empty))).toEqual(
          empty,
        );
      }
    },
  );

  it("keeps all managed environments unchecked and allows reselecting one", () => {
    const managedCtx: SidebarFilterActionContext = {
      ...ctx,
      managedEnvironmentColumn: "env",
      hiddenEnvironments: ["test"],
    };
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: ["dev", "test"],
      },
    ];
    const empty = applyCheckboxSelection(managedCtx, current, "env", []);
    expect(empty).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["dev"],
      },
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: ["dev"],
      },
    ]);
    expect(applyCheckboxSelection(managedCtx, empty, "env", ["prod"])).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ]);
    expect(clearCategoricalColumn(empty, "env")).toEqual([]);
  });

  it.each([false, true])(
    "keeps neither boolean label selected (inverted: %s)",
    (invertValue) => {
      const booleanCtx: SidebarFilterActionContext = {
        ...ctx,
        facets: [
          {
            type: "boolean",
            column: "bookmarked",
            label: "Bookmarked",
            invertValue,
          },
        ],
      };
      const current: FilterState = [
        {
          column: "bookmarked",
          type: "boolean",
          operator: "=",
          value: !invertValue,
          target: "run-b",
        },
      ];
      const empty = applyCheckboxSelection(
        booleanCtx,
        current,
        "bookmarked",
        [],
      );
      expect(empty).toEqual([
        { ...current[0], value: true },
        { ...current[0], value: false },
      ]);
      expect(
        applyCheckboxSelection(booleanCtx, empty, "bookmarked", ["True"]),
      ).toEqual(current);
      expect(
        applyCheckboxSelection(booleanCtx, empty, "bookmarked", [
          "True",
          "False",
        ]),
      ).toEqual([]);
    },
  );

  it("keeps a categorical filter's target and refuses to merge different targets", () => {
    const current = [
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
        target: "run-b",
      },
    ] satisfies FilterState;
    expect(applyCheckboxSelection(ctx, current, "env", ["dev"])).toEqual([
      { ...current[0], value: ["dev"] },
    ]);
    const text = addTextFilterEntry(current, "env", "contains", "dev")!;
    expect(text[0].target).toBe("run-b");
    expect(applyCheckboxSelection(ctx, text, "env", ["dev"])[0].target).toBe(
      "run-b",
    );
    const multiple: FilterState = [
      ...current,
      { ...current[0], target: "baseline", value: ["test"] },
    ];
    expect(applyCheckboxSelection(ctx, multiple, "env", ["dev"])).toEqual(
      multiple,
    );
    expect(addTextFilterEntry(multiple, "env", "contains", "dev")).toBeNull();
  });

  it("returns current for unknown columns and non-enumerable options", () => {
    const current: FilterState = [];
    expect(applySelection(ctx, current, "nope", ["x"])).toBe(current);
    expect(
      applySelection(
        { ...ctx, options: { env: { a: ["b"] } } },
        current,
        "env",
        ["x"],
      ),
    ).toBe(current);
  });

  it("maps boolean facet labels to boolean filters, honoring invertValue", () => {
    expect(applySelection(ctx, [], "bookmarked", ["Starred"])).toEqual([
      { column: "bookmarked", type: "boolean", operator: "=", value: true },
    ]);
    expect(applySelection(ctx, [], "bookmarked", ["Not starred"])).toEqual([
      { column: "bookmarked", type: "boolean", operator: "=", value: false },
    ]);
    // both labels = no filter
    expect(
      applySelection(ctx, [], "bookmarked", ["Starred", "Not starred"]),
    ).toEqual([]);
  });

  it("removes the filter when every option is selected implicitly", () => {
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(
      applySelection(ctx, current, "env", ["prod", "dev", "test"]),
    ).toEqual([]);
  });

  it("persists an explicit keep-everything override for the managed env column", () => {
    const managedCtx = { ...ctx, managedEnvironmentColumn: "env" };
    expect(
      applySelection(managedCtx, [], "env", ["prod", "dev", "test"]),
    ).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod", "dev", "test"],
      },
    ]);
  });

  it("keeps none-of when unchecking a default env while hidden stay excluded", () => {
    const hidden = ["langfuse-evaluation", "sdk-experiment"];
    const managedCtx: SidebarFilterActionContext = {
      ...ctx,
      managedEnvironmentColumn: "env",
      hiddenEnvironments: hidden,
      options: {
        ...ctx.options,
        env: ["production", "staging", ...hidden],
      },
    };

    expect(applySelection(managedCtx, [], "env", ["staging"])).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: ["production", ...hidden],
      },
    ]);
  });

  it("stores any-of when every hidden env is checked and a default env is not", () => {
    const hidden = ["langfuse-evaluation", "sdk-experiment"];
    const managedCtx: SidebarFilterActionContext = {
      ...ctx,
      managedEnvironmentColumn: "env",
      hiddenEnvironments: hidden,
      options: {
        ...ctx.options,
        env: ["production", "staging", ...hidden],
      },
    };
    const existing: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: ["production", ...hidden],
      },
    ];
    const checked = ["staging", ...hidden];

    expect(applySelection(managedCtx, existing, "env", checked)).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: checked,
      },
    ]);
  });

  it("stores any-of when a hidden environment is enabled from the default", () => {
    const hidden = ["langfuse-evaluation", "sdk-experiment"];
    const managedCtx: SidebarFilterActionContext = {
      ...ctx,
      managedEnvironmentColumn: "env",
      hiddenEnvironments: hidden,
      options: {
        ...ctx.options,
        env: ["production", "staging", ...hidden],
      },
    };
    const checked = ["production", "staging", "langfuse-evaluation"];

    expect(applySelection(managedCtx, [], "env", checked)).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: checked,
      },
    ]);
  });

  it("promotes extras-only none-of from the explicit-operator path to any-of", () => {
    const hidden = ["langfuse-evaluation", "sdk-experiment"];
    const managedCtx: SidebarFilterActionContext = {
      ...ctx,
      managedEnvironmentColumn: "env",
      hiddenEnvironments: hidden,
      options: {
        ...ctx.options,
        env: ["production", "staging", ...hidden],
      },
    };

    expect(
      applySelection(managedCtx, [], "env", ["production"], "none of"),
    ).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ]);
  });

  it("keeps an explicit none-of that already excludes every hidden env", () => {
    const hidden = ["langfuse-evaluation", "sdk-experiment"];
    const managedCtx: SidebarFilterActionContext = {
      ...ctx,
      managedEnvironmentColumn: "env",
      hiddenEnvironments: hidden,
      options: {
        ...ctx.options,
        env: ["production", "staging", ...hidden],
      },
    };
    const exclusions = ["production", ...hidden];

    expect(
      applySelection(managedCtx, [], "env", exclusions, "none of"),
    ).toEqual([
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: exclusions,
      },
    ]);
  });

  it("treats an explicit empty none-of as a no-op reset", () => {
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(applySelection(ctx, current, "env", [], "none of")).toEqual([]);
  });
});

describe("applyCheckboxSelection", () => {
  it("keeps excluding user IDs when the last value is unchecked and clears on re-selection", () => {
    const userCtx: SidebarFilterActionContext = {
      facets: [{ type: "categorical", column: "userId", label: "User ID" }],
      columnDefinitions: [
        {
          id: "userId",
          name: "User ID",
          type: "stringOptions",
          options: [],
          internal: "user_id",
        },
      ],
      options: { userId: ["user-a", "user-b"] },
    };
    const first = applyCheckboxSelection(userCtx, [], "userId", ["user-b"]);
    expect(first).toEqual([
      {
        column: "userId",
        type: "stringOptions",
        operator: "none of",
        value: ["user-a"],
      },
    ]);
    const second = applyCheckboxSelection(userCtx, first, "userId", []);
    expect(second).toEqual([
      { ...first[0], operator: "any of", value: ["user-a"] },
      first[0],
    ]);
    const reselected = applyCheckboxSelection(userCtx, second, "userId", [
      "user-a",
    ]);
    expect(reselected).toEqual([
      { ...first[0], operator: "any of", value: ["user-a"] },
    ]);
    expect(
      applyCheckboxSelection(userCtx, reselected, "userId", [
        "user-a",
        "user-b",
      ]),
    ).toEqual([]);
  });

  it("keeps every managed environment excluded when the last value is unchecked", () => {
    const managedCtx = { ...ctx, managedEnvironmentColumn: "env" };
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: ["prod", "dev"],
      },
    ];
    expect(applyCheckboxSelection(managedCtx, current, "env", [])).toEqual([
      { ...current[0], operator: "any of", value: ["prod"] },
      { ...current[0], value: ["prod"] },
    ]);
  });

  it("drops the column's text filters before applying the selection", () => {
    const current: FilterState = [
      { column: "env", type: "string", operator: "contains", value: "pr" },
      { column: "other", type: "string", operator: "contains", value: "x" },
    ];
    const next = applyCheckboxSelection(
      ctx,
      current,
      "env",
      ["prod"],
      "any of",
    );
    expect(next).toEqual([
      { column: "other", type: "string", operator: "contains", value: "x" },
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ]);
  });
});

describe("buildOnlySelection", () => {
  it("returns a plain single value for boolean facets (no operator)", () => {
    expect(buildOnlySelection(ctx, [], "bookmarked", "Starred")).toEqual({
      values: ["Starred"],
    });
  });

  it("replaces an active none-of with a positive any-of", () => {
    const current: FilterState = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["a"],
      },
    ];
    expect(buildOnlySelection(ctx, current, "tags", "b")).toEqual({
      values: ["b"],
      operator: "any of",
    });
  });

  it("keeps an active all-of operator", () => {
    const current: FilterState = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["a"],
      },
    ];
    expect(buildOnlySelection(ctx, current, "tags", "b")).toEqual({
      values: ["b"],
      operator: "all of",
    });
  });

  it("returns null for unknown columns", () => {
    expect(buildOnlySelection(ctx, [], "nope", "x")).toBeNull();
  });
});

describe("deriveOperatorChange", () => {
  it("derives the kept complement for a stringOptions none-of filter", () => {
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "none of",
        value: ["prod"],
      },
    ];
    expect(deriveOperatorChange(ctx, current, "env")).toEqual({
      values: ["dev", "test"],
      fromOperator: "none of",
    });
  });

  it("keeps the stored exclusions for an arrayOptions none-of filter", () => {
    const current: FilterState = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["a", "stale"],
      },
    ];
    expect(deriveOperatorChange(ctx, current, "tags")).toEqual({
      values: ["a", "stale"],
      fromOperator: "none of",
    });
  });

  it("returns empty values without a persisted filter, null for non-checkbox filters", () => {
    expect(deriveOperatorChange(ctx, [], "tags")).toEqual({
      values: [],
      fromOperator: undefined,
    });
    const numeric: FilterState = [
      { column: "tags", type: "number", operator: ">=", value: 1 },
    ];
    expect(deriveOperatorChange(ctx, numeric, "tags")).toBeNull();
  });
});

describe("numeric / string / text transitions", () => {
  it("applyNumericRange persists both bounds and clears on null", () => {
    const next = applyNumericRange([], "latency", [1, 5]);
    expect(next).toEqual([
      { column: "latency", type: "number", operator: ">=", value: 1 },
      { column: "latency", type: "number", operator: "<=", value: 5 },
    ]);
    expect(applyNumericRange(next, "latency", null)).toEqual([]);
  });

  it("applyStringContains sets a contains filter and clears on blank", () => {
    const next = applyStringContains([], "id", "abc");
    expect(next).toEqual([
      { column: "id", type: "string", operator: "contains", value: "abc" },
    ]);
    expect(applyStringContains(next, "id", "  ")).toEqual([]);
  });

  it("addTextFilterEntry trims, rejects blank, and drops checkbox filters", () => {
    expect(addTextFilterEntry([], "env", "contains", "   ")).toBeNull();
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(addTextFilterEntry(current, "env", "contains", " pr ")).toEqual([
      { column: "env", type: "string", operator: "contains", value: "pr" },
    ]);
  });

  it("removeTextFilterEntry removes exactly the matching entry", () => {
    const current: FilterState = [
      { column: "env", type: "string", operator: "contains", value: "a" },
      {
        column: "env",
        type: "string",
        operator: "does not contain",
        value: "a",
      },
    ];
    expect(removeTextFilterEntry(current, "env", "contains", "a")).toEqual([
      {
        column: "env",
        type: "string",
        operator: "does not contain",
        value: "a",
      },
    ]);
  });
});

describe("keyed facet transitions", () => {
  it("persists only complete rows and replaces just its own kind", () => {
    const current: FilterState = [
      {
        column: "metadata",
        type: "stringObject",
        operator: "=",
        key: "old",
        value: "gone",
      },
      {
        column: "metadata",
        type: "string",
        operator: "contains",
        value: "keep",
      },
    ];
    const next = applyKeyedFilterEntries(current, "metadata", {
      kind: "stringObject",
      entries: [
        { key: "env", operator: "=", value: "prod" },
        { key: "", operator: "=", value: "draft-no-key" },
        { key: "draft-no-value", operator: "=", value: "  " },
      ],
    });
    expect(next).toEqual([
      {
        column: "metadata",
        type: "string",
        operator: "contains",
        value: "keep",
      },
      {
        column: "metadata",
        type: "stringObject",
        operator: "=",
        key: "env",
        value: "prod",
      },
    ]);
  });

  it("keeps `is set` / `is not set` presence rows even with an empty value", () => {
    const next = applyKeyedFilterEntries([], "metadata", {
      kind: "stringObject",
      entries: [
        { key: "env", operator: "is set", value: "" },
        { key: "region", operator: "is not set", value: "" },
        { key: "", operator: "is set", value: "" },
      ],
    });
    expect(next).toEqual([
      {
        column: "metadata",
        type: "stringObject",
        operator: "is set",
        key: "env",
        value: "",
      },
      {
        column: "metadata",
        type: "stringObject",
        operator: "is not set",
        key: "region",
        value: "",
      },
    ]);
  });

  it("filters numeric and boolean drafts by their empty-value sentinel", () => {
    expect(
      applyKeyedFilterEntries([], "scores_avg", {
        kind: "numberObject",
        entries: [
          { key: "acc", operator: ">=", value: 0 },
          { key: "acc", operator: ">=", value: "" },
        ],
      }),
    ).toEqual([
      {
        column: "scores_avg",
        type: "numberObject",
        operator: ">=",
        key: "acc",
        value: 0,
      },
    ]);
    expect(
      applyKeyedFilterEntries([], "score_booleans", {
        kind: "booleanObject",
        entries: [{ key: "flag", operator: "=", value: false }],
      }),
    ).toEqual([
      {
        column: "score_booleans",
        type: "booleanObject",
        operator: "=",
        key: "flag",
        value: false,
      },
    ]);
  });

  it("removeColumnFiltersOfType scopes to column and kind", () => {
    const current: FilterState = [
      {
        column: "metadata",
        type: "stringObject",
        operator: "=",
        key: "a",
        value: "1",
      },
      {
        column: "other",
        type: "stringObject",
        operator: "=",
        key: "b",
        value: "2",
      },
    ];
    expect(
      removeColumnFiltersOfType(current, "metadata", "stringObject"),
    ).toEqual([
      {
        column: "other",
        type: "stringObject",
        operator: "=",
        key: "b",
        value: "2",
      },
    ]);
  });
});

describe("clearCategoricalColumn", () => {
  it("clears checkbox and text filters but leaves other filter types", () => {
    const current: FilterState = [
      {
        column: "env",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
      { column: "env", type: "string", operator: "contains", value: "p" },
      { column: "env", type: "number", operator: ">=", value: 1 },
      { column: "other", type: "string", operator: "contains", value: "x" },
    ];
    expect(clearCategoricalColumn(current, "env")).toEqual([
      { column: "env", type: "number", operator: ">=", value: 1 },
      { column: "other", type: "string", operator: "contains", value: "x" },
    ]);
  });
});
