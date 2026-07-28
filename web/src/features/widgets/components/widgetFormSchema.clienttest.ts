import {
  deriveSaveReason,
  makeWidgetFormSchema,
  type WidgetFormValues,
} from "./widgetFormSchema";

/** A valid, minimal non-pivot line-chart widget on the observations view. */
const baseValues = (): WidgetFormValues => ({
  name: null,
  description: null,
  view: "observations",
  filters: [],
  metrics: [{ measure: "latency", aggregation: "avg" }],
  dimensions: [],
  chart: { type: "LINE_TIME_SERIES", bins: 10, rowLimit: 100, sort: null },
});

const parse = (values: WidgetFormValues, version: "v1" | "v2" = "v2") =>
  makeWidgetFormSchema(version).safeParse(values);

describe("makeWidgetFormSchema superRefine", () => {
  it("accepts a valid non-pivot line chart", () => {
    expect(parse(baseValues()).success).toBe(true);
  });

  it("accepts a valid histogram on a histogram-capable measure", () => {
    const result = parse({
      ...baseValues(),
      metrics: [{ measure: "latency", aggregation: "histogram" }],
      chart: { type: "HISTOGRAM", bins: 20, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(true);
  });

  it("rejects HISTOGRAM on the count measure (not histogram-capable)", () => {
    const result = parse({
      ...baseValues(),
      metrics: [{ measure: "count", aggregation: "histogram" }],
      chart: { type: "HISTOGRAM", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects HISTOGRAM when the aggregation is not histogram", () => {
    const result = parse({
      ...baseValues(),
      metrics: [{ measure: "latency", aggregation: "avg" }],
      chart: { type: "HISTOGRAM", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects the histogram aggregation on a non-histogram chart", () => {
    const result = parse({
      ...baseValues(),
      metrics: [{ measure: "latency", aggregation: "histogram" }],
      chart: { type: "LINE_TIME_SERIES", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a breakdown dimension on a non-breakdown chart type", () => {
    const result = parse({
      ...baseValues(),
      dimensions: [{ field: "environment" }],
      chart: { type: "NUMBER", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than one metric on a non-pivot chart", () => {
    const result = parse({
      ...baseValues(),
      metrics: [
        { measure: "latency", aggregation: "avg" },
        { measure: "totalCost", aggregation: "sum" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than one dimension on a non-pivot breakdown chart", () => {
    const result = parse({
      ...baseValues(),
      dimensions: [{ field: "environment" }, { field: "name" }],
      chart: { type: "VERTICAL_BAR", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a pivot table with multiple metrics and dimensions", () => {
    const result = parse({
      ...baseValues(),
      metrics: [
        { measure: "latency", aggregation: "avg" },
        { measure: "count", aggregation: "count" },
      ],
      dimensions: [{ field: "environment" }, { field: "name" }],
      chart: {
        type: "PIVOT_TABLE",
        bins: 10,
        rowLimit: 50,
        sort: { column: "avg_latency", order: "DESC" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a pivot table with an empty metrics array (zod .min(1))", () => {
    const result = parse({
      ...baseValues(),
      metrics: [],
      chart: { type: "PIVOT_TABLE", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pivot table with more than the maximum metrics", () => {
    const result = parse({
      ...baseValues(),
      metrics: Array.from({ length: 11 }, () => ({
        measure: "latency",
        aggregation: "avg" as const,
      })),
      chart: { type: "PIVOT_TABLE", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pivot table with more than the maximum dimensions", () => {
    const result = parse({
      ...baseValues(),
      metrics: [{ measure: "latency", aggregation: "avg" }],
      dimensions: [
        { field: "environment" },
        { field: "name" },
        { field: "userId" },
      ],
      chart: { type: "PIVOT_TABLE", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });

  it("coerces string chart.bins / chart.rowLimit and enforces bounds", () => {
    const ok = parse({
      ...baseValues(),
      metrics: [{ measure: "latency", aggregation: "histogram" }],
      chart: {
        type: "HISTOGRAM",
        bins: "25" as unknown as number,
        rowLimit: 100,
        sort: null,
      },
    });
    expect(ok.success).toBe(true);

    const tooManyBins = parse({
      ...baseValues(),
      metrics: [{ measure: "latency", aggregation: "histogram" }],
      chart: { type: "HISTOGRAM", bins: 101, rowLimit: 100, sort: null },
    });
    expect(tooManyBins.success).toBe(false);
  });

  it("allows a pivot table with a trailing empty metric slot (>=1 non-empty)", () => {
    const result = parse({
      ...baseValues(),
      metrics: [
        { measure: "latency", aggregation: "avg" },
        { measure: "", aggregation: "sum" },
      ],
      chart: { type: "PIVOT_TABLE", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-pivot chart with an empty measure", () => {
    const result = parse({
      ...baseValues(),
      metrics: [{ measure: "", aggregation: "count" }],
      chart: { type: "LINE_TIME_SERIES", bins: 10, rowLimit: 100, sort: null },
    });
    expect(result.success).toBe(false);
  });
});

describe("makeWidgetFormSchema superRefine issue paths", () => {
  // Guards against a silent path rename: each invariant must emit an issue at
  // the exact path the UI reads for its inline marker, with a real message.
  const issues = (values: WidgetFormValues) => {
    const result = parse(values);
    return result.success ? [] : result.error.issues;
  };
  const hasIssueAt = (values: WidgetFormValues, path: (string | number)[]) =>
    issues(values).some(
      (issue) =>
        JSON.stringify(issue.path) === JSON.stringify(path) &&
        typeof issue.message === "string" &&
        issue.message.length > 0,
    );

  it("HISTOGRAM on a non-histogram-capable measure -> issue at chart.type", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          metrics: [{ measure: "count", aggregation: "histogram" }],
          chart: { type: "HISTOGRAM", bins: 10, rowLimit: 100, sort: null },
        },
        ["chart", "type"],
      ),
    ).toBe(true);
  });

  it("HISTOGRAM with a non-histogram aggregation -> issue at metrics.0.aggregation", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          metrics: [{ measure: "latency", aggregation: "avg" }],
          chart: { type: "HISTOGRAM", bins: 10, rowLimit: 100, sort: null },
        },
        ["metrics", 0, "aggregation"],
      ),
    ).toBe(true);
  });

  it("histogram aggregation on a non-histogram chart -> issue at metrics.0.aggregation", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          metrics: [{ measure: "latency", aggregation: "histogram" }],
        },
        ["metrics", 0, "aggregation"],
      ),
    ).toBe(true);
  });

  it("breakdown dimension on a non-breakdown chart -> issue at dimensions", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          dimensions: [{ field: "environment" }],
          chart: { type: "NUMBER", bins: 10, rowLimit: 100, sort: null },
        },
        ["dimensions"],
      ),
    ).toBe(true);
  });

  it("non-pivot with two metrics -> issue at metrics", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          metrics: [
            { measure: "latency", aggregation: "avg" },
            { measure: "totalCost", aggregation: "sum" },
          ],
        },
        ["metrics"],
      ),
    ).toBe(true);
  });

  it("non-pivot with an empty measure -> issue at metrics.0.measure", () => {
    expect(
      hasIssueAt(
        { ...baseValues(), metrics: [{ measure: "", aggregation: "count" }] },
        ["metrics", 0, "measure"],
      ),
    ).toBe(true);
  });

  it("pivot with too many metrics -> issue at metrics", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          metrics: Array.from({ length: 11 }, () => ({
            measure: "latency",
            aggregation: "avg" as const,
          })),
          chart: { type: "PIVOT_TABLE", bins: 10, rowLimit: 100, sort: null },
        },
        ["metrics"],
      ),
    ).toBe(true);
  });

  it("pivot with too many dimensions -> issue at dimensions", () => {
    expect(
      hasIssueAt(
        {
          ...baseValues(),
          metrics: [{ measure: "latency", aggregation: "avg" }],
          dimensions: [
            { field: "environment" },
            { field: "name" },
            { field: "userId" },
          ],
          chart: { type: "PIVOT_TABLE", bins: 10, rowLimit: 100, sort: null },
        },
        ["dimensions"],
      ),
    ).toBe(true);
  });
});

describe("deriveSaveReason", () => {
  it("returns undefined when there are no errors", () => {
    expect(deriveSaveReason({})).toBeUndefined();
  });

  it("prefers metrics -> dimensions -> chart.type order", () => {
    expect(
      deriveSaveReason({
        metrics: { message: "metric problem" },
        dimensions: { message: "dimension problem" },
        chart: { type: { message: "chart problem" } },
      }),
    ).toBe("metric problem");
    expect(
      deriveSaveReason({
        dimensions: { message: "dimension problem" },
        chart: { type: { message: "chart problem" } },
      }),
    ).toBe("dimension problem");
    expect(
      deriveSaveReason({ chart: { type: { message: "chart problem" } } }),
    ).toBe("chart problem");
  });

  it("reads a nested metrics.0.aggregation message", () => {
    expect(
      deriveSaveReason({
        metrics: [{ aggregation: { message: "bad aggregation" } }],
      }),
    ).toBe("bad aggregation");
  });

  it("falls back to the first message anywhere for an unlisted path", () => {
    expect(
      deriveSaveReason({
        chart: { bins: { message: "bins out of range" } },
      }),
    ).toBe("bins out of range");
  });
});
