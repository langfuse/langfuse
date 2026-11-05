import {
  sessionTraceFilterSchema,
  SessionViewInputSchema,
  normalizeLegacySessionPositionInTraceFilters,
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

  it("normalizes legacy root positions without making them supported", () => {
    expect(normalizeLegacySessionPositionInTraceFilters(filters)).toEqual([
      ...filters.slice(0, -1),
      { ...filters[3], key: "first" },
    ]);
  });

  it.each(filters)("rejects unsupported legacy $column filters", (filter) => {
    expect(sessionTraceFilterSchema.safeParse([filter]).success).toBe(false);
    expect(
      SessionViewInputSchema.safeParse({
        projectId: "project",
        name: "Legacy",
        filters: [filter],
        viewMode: "list",
        unmatchedTraces: "hide",
      }).success,
    ).toBe(false);
  });

  it("uses the same normalization for supported saved views and URL filters", () => {
    const supportedFilters: FilterState = [
      { column: "rootType", type: "string", operator: "=", value: "SPAN" },
    ];
    const view = SessionViewInputSchema.parse({
      projectId: "project",
      name: "Legacy",
      filters: supportedFilters,
      viewMode: "list",
      unmatchedTraces: "hide",
    });
    expect(view.filters).toEqual(
      sessionTraceFilterSchema.parse(supportedFilters),
    );
    expect(view.filters).toEqual([
      { column: "type", type: "string", operator: "=", value: "SPAN" },
    ]);
    expect(
      sessionTraceFilterSchema.safeParse([
        { column: "unknown", type: "string", operator: "=", value: "invalid" },
      ]).success,
    ).toBe(false);
  });

  it("normalizes supported legacy display names without dropping filters", () => {
    expect(
      sessionTraceFilterSchema.parse([
        {
          column: "Type",
          type: "string",
          operator: "=",
          value: "SPAN",
        },
        {
          column: "Environment",
          type: "string",
          operator: "=",
          value: "production",
        },
      ]),
    ).toEqual([
      {
        column: "type",
        type: "string",
        operator: "=",
        value: "SPAN",
      },
      {
        column: "environment",
        type: "string",
        operator: "=",
        value: "production",
      },
    ]);
  });
});
