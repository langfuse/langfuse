import type { FilterState } from "@langfuse/shared";
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
