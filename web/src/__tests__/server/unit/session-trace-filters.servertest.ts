import {
  sessionTraceFilterSchema,
  SessionViewInputSchema,
  type FilterState,
} from "@langfuse/shared";

describe("legacy session filters", () => {
  const filters: FilterState = [
    {
      column: "type",
      type: "stringOptions",
      operator: "any of",
      value: ["GENERATION", "SPAN"],
    },
    { column: "hasInput", type: "boolean", operator: "=", value: true },
    { column: "latency", type: "number", operator: ">", value: 1 },
    {
      column: "positionInTrace",
      type: "positionInTrace",
      operator: "=",
      key: "root",
      value: 1,
    },
  ];

  it("preserves legacy filters and normalizes root to first", () => {
    expect(sessionTraceFilterSchema.parse(filters)).toEqual([
      ...filters.slice(0, -1),
      { ...filters[3], key: "first" },
    ]);
  });

  it("uses the same validation for saved views and URL filters", () => {
    const view = SessionViewInputSchema.parse({
      projectId: "project",
      name: "Legacy",
      filters,
      viewMode: "list",
      unmatchedTraces: "hide",
    });
    expect(view.filters).toEqual(sessionTraceFilterSchema.parse(filters));
    expect(
      sessionTraceFilterSchema.safeParse([
        { column: "unknown", type: "string", operator: "=", value: "invalid" },
      ]).success,
    ).toBe(false);
  });

  it("normalizes legacy display names without dropping filters", () => {
    expect(
      sessionTraceFilterSchema.parse([
        {
          column: "Type",
          type: "stringOptions",
          operator: "any of",
          value: ["SPAN"],
        },
        { column: "Has Input", type: "boolean", operator: "=", value: true },
      ]),
    ).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["SPAN"],
      },
      { column: "hasInput", type: "boolean", operator: "=", value: true },
    ]);
  });
});
