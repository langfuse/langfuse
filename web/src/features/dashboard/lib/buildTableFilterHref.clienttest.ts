import {
  type FilterState,
  observationsTableCols,
  tracesTableCols,
} from "@langfuse/shared";
import {
  buildTableFilterHref,
  buildViewAsTableHint,
} from "./buildTableFilterHref";
import {
  decodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@/src/features/filters/lib/filter-query-encoding";

const DATE_RANGE = {
  from: new Date("2026-07-01T00:00:00.000Z"),
  to: new Date("2026-07-02T00:00:00.000Z"),
};

// Parse the ?filter= value the way the destination table does: the URL layer
// decodes the transport-encoding once, then decodeFiltersGeneric parses the
// semicolon/comma format.
const decodeHrefFilters = (href: string): FilterState => {
  const url = new URL("http://localhost" + href);
  const filterParam = url.searchParams.get("filter");
  return filterParam ? decodeFiltersGeneric(filterParam) : [];
};

describe("buildTableFilterHref", () => {
  it("links a traces-view widget to the traces table with translated column ids", () => {
    const uiFilters: FilterState = [
      {
        column: "traceName",
        type: "stringOptions",
        operator: "any of",
        value: ["checkout"],
      },
      { column: "user", type: "string", operator: "=", value: "u-1" },
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: ["prod"],
      },
    ];

    const { href, notApplicable } = buildTableFilterHref(
      "proj-1",
      "traces",
      uiFilters,
      DATE_RANGE,
    );

    expect(href.startsWith("/project/proj-1/traces?")).toBe(true);

    const decoded = decodeHrefFilters(href);
    expect(decoded.map((f) => f.column)).toEqual([
      "traceName",
      "userId",
      "traceTags",
    ]);
    // every emitted id is a real traces table column
    const ids = new Set(tracesTableCols.map((c) => c.id));
    decoded.forEach((f) => expect(ids.has(f.column)).toBe(true));
    expect(notApplicable.size).toBe(0);
  });

  it("links an observations-view widget to the observations table (model rename, tags kept)", () => {
    const uiFilters: FilterState = [
      {
        column: "model",
        type: "stringOptions",
        operator: "any of",
        value: ["gpt-4"],
      },
      { column: "user", type: "string", operator: "=", value: "u-1" },
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: ["a"],
      },
    ];

    const { href } = buildTableFilterHref(
      "proj-1",
      "observations",
      uiFilters,
      DATE_RANGE,
    );

    expect(href.startsWith("/project/proj-1/observations?")).toBe(true);

    const decoded = decodeHrefFilters(href);
    expect(decoded.map((f) => f.column)).toEqual(["model", "userId", "tags"]);
    const ids = new Set(observationsTableCols.map((c) => c.id));
    decoded.forEach((f) => expect(ids.has(f.column)).toBe(true));
  });

  it("drops a sessionId filter for an observations widget and reports it", () => {
    const uiFilters: FilterState = [
      { column: "session", type: "string", operator: "=", value: "s-1" },
      { column: "user", type: "string", operator: "=", value: "u-1" },
    ];

    const { href, notApplicable } = buildTableFilterHref(
      "proj-1",
      "observations",
      uiFilters,
      DATE_RANGE,
    );

    const decoded = decodeHrefFilters(href);
    expect(decoded.map((f) => f.column)).toEqual(["userId"]);
    expect(notApplicable.get("sessionId")).toMatch(/session/i);
  });

  it('drops a dashboard-global "Version" filter on an observations widget (parity with the widget query, which maps it to the dropped traceVersion)', () => {
    // The "stored" mapping variant the widget query uses resolves the legacy
    // "Version" alias to `traceVersion`, which the observations table can't
    // express. The builder must match: no observation `version` filter leaks in.
    const uiFilters: FilterState = [
      { column: "Version", type: "string", operator: "=", value: "v1" },
      { column: "user", type: "string", operator: "=", value: "u-1" },
    ];

    const { href, notApplicable } = buildTableFilterHref(
      "proj-1",
      "observations",
      uiFilters,
      DATE_RANGE,
    );

    const decoded = decodeHrefFilters(href);
    expect(decoded.map((f) => f.column)).toEqual(["userId"]);
    expect(decoded.some((f) => f.column === "version")).toBe(false);
    expect(notApplicable.has("traceVersion")).toBe(true);
  });

  it("encodes the widget time range as a custom dateRange", () => {
    const { href } = buildTableFilterHref("proj-1", "traces", [], DATE_RANGE);
    const url = new URL("http://localhost" + href);
    expect(url.searchParams.get("dateRange")).toBe(
      `${DATE_RANGE.from.getTime()}-${DATE_RANGE.to.getTime()}`,
    );
  });

  it("omits filter/dateRange params when there is nothing to encode", () => {
    const { href } = buildTableFilterHref("proj-1", "traces", [], undefined);
    expect(href).toBe("/project/proj-1/traces");
  });

  it("survives operators with spaces through URL transport", () => {
    const uiFilters: FilterState = [
      {
        column: "traceName",
        type: "stringOptions",
        operator: "any of",
        value: ["a b", "c"],
      },
    ];
    const { href } = buildTableFilterHref(
      "proj-1",
      "traces",
      uiFilters,
      undefined,
    );
    const decoded = decodeHrefFilters(href);
    expect(decoded[0]).toMatchObject({
      column: "traceName",
      operator: "any of",
      value: ["a b", "c"],
    });
  });

  it("drops the largest filters to stay within the URL length budget, still navigating", () => {
    const huge = Array.from(
      { length: 800 },
      (_, i) => `value-${i}-${"x".repeat(20)}`,
    );
    const uiFilters: FilterState = [
      { column: "user", type: "string", operator: "=", value: "keep-me" },
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: huge,
      },
    ];

    const { href, droppedForLength } = buildTableFilterHref(
      "proj-1",
      "traces",
      uiFilters,
      DATE_RANGE,
    );

    expect(droppedForLength).toBe(1);
    const url = new URL("http://localhost" + href);
    const filterParam = url.searchParams.get("filter") ?? "";
    expect(filterParam.length).toBeLessThanOrEqual(MAX_URL_FILTER_QUERY_LENGTH);
    // the small, high-value filter is retained
    const decoded = decodeHrefFilters(href);
    expect(decoded.map((f) => f.column)).toEqual(["userId"]);
  });
});

describe("buildViewAsTableHint", () => {
  it("returns null when nothing was dropped", () => {
    const result = buildTableFilterHref(
      "proj-1",
      "traces",
      [{ column: "user", type: "string", operator: "=", value: "u-1" }],
      DATE_RANGE,
    );
    expect(result.notApplicable.size).toBe(0);
    expect(result.droppedForLength).toBe(0);
    expect(buildViewAsTableHint(result)).toBeNull();
  });

  it("counts not-applicable dimensions with their reasons in the tooltip", () => {
    const result = buildTableFilterHref(
      "proj-1",
      "observations",
      [{ column: "session", type: "string", operator: "=", value: "s-1" }],
      DATE_RANGE,
    );
    const hint = buildViewAsTableHint(result);
    expect(hint?.count).toBe(1);
    expect(hint?.title).toMatch(/session/i);
  });

  // Regression: a filter dropped purely for URL length must still surface in
  // the hint. A hint keyed only on notApplicable would be silently zero here,
  // landing the user on a table quietly missing a filter they configured.
  it("surfaces length-dropped filters even when notApplicable is empty", () => {
    const huge = Array.from(
      { length: 800 },
      (_, i) => `value-${i}-${"x".repeat(20)}`,
    );
    const result = buildTableFilterHref(
      "proj-1",
      "traces",
      [
        { column: "user", type: "string", operator: "=", value: "keep-me" },
        {
          column: "traceTags",
          type: "arrayOptions",
          operator: "any of",
          value: huge,
        },
      ],
      DATE_RANGE,
    );

    expect(result.notApplicable.size).toBe(0);
    expect(result.droppedForLength).toBe(1);

    const hint = buildViewAsTableHint(result);
    expect(hint).not.toBeNull();
    expect(hint?.count).toBe(1); // not silently zero
    expect(hint?.title).toMatch(/dropped to keep the table URL/i);
  });

  it("sums not-applicable and length-dropped filters into one count", () => {
    const huge = Array.from(
      { length: 800 },
      (_, i) => `value-${i}-${"x".repeat(20)}`,
    );
    const result = buildTableFilterHref(
      "proj-1",
      "observations",
      [
        // sessionId -> not-applicable on observations
        { column: "session", type: "string", operator: "=", value: "s-1" },
        { column: "user", type: "string", operator: "=", value: "keep-me" },
        // huge applicable tags filter -> dropped for length
        {
          column: "traceTags",
          type: "arrayOptions",
          operator: "any of",
          value: huge,
        },
      ],
      DATE_RANGE,
    );

    expect(result.notApplicable.size).toBe(1);
    expect(result.droppedForLength).toBe(1);
    expect(buildViewAsTableHint(result)?.count).toBe(2);
  });
});
