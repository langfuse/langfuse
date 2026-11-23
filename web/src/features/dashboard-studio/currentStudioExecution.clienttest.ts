import { describe, expect, it } from "vitest";
import { createStudioWidget } from "./catalog";
import {
  createCurrentStudioPlan,
  normalizeCurrentStudioResults,
  validateCurrentStudioConfig,
} from "./currentStudioExecution";

const context = {
  version: "v2" as const,
  fromTimestamp: "2026-11-01T00:00:00Z",
  toTimestamp: "2026-11-03T00:00:00Z",
  filters: [],
};

describe("current production query composition", () => {
  it("preserves metadata key presence and rejects prototype-only semantics before execution", () => {
    const config = createStudioWidget();
    config.queries[0]!.filters = [
      {
        column: "metadata",
        type: "stringObject",
        key: "abc",
        operator: "is set",
        value: "",
      },
    ];
    expect(validateCurrentStudioConfig(config).valid).toBe(true);
    const plan = createCurrentStudioPlan(config, context);
    expect(plan.requests[0]!.query.filters).toEqual(config.queries[0]!.filters);
    config.queries[0]!.filters[0] = {
      column: "metadata",
      type: "stringObject",
      key: "abc",
      operator: "contains",
      value: "",
    };
    expect(
      createCurrentStudioPlan(config, context).requests[0]!.query.filters[0],
    ).toMatchObject({ operator: "is set", value: "" });
    config.queries[0]!.filters[0] = {
      column: "metadata",
      type: "stringObject",
      key: "abc",
      operator: "=",
      value: "",
    };
    expect(
      createCurrentStudioPlan(config, context).requests[0]!.query.filters[0],
    ).toMatchObject({ operator: "=", value: "" });
    for (const edit of [
      () => {
        config.queries[0]!.metrics[0]!.percentile = 10;
      },
      () => {
        config.queries[0]!.metrics[0] = {
          id: "days",
          measure: "activeDays",
          aggregation: "uniq",
        };
      },
      () => {
        config.display.histogramEdges = [0, 1000, 5000];
      },
    ]) {
      const original = structuredClone(config);
      edit();
      expect(validateCurrentStudioConfig(config).valid).toBe(false);
      Object.assign(config, original);
    }
    config.queries = Array.from({ length: 6 }, (_, index) => ({
      ...config.queries[0]!,
      id: `q${index}`,
    }));
    expect(validateCurrentStudioConfig(config)).toMatchObject({
      valid: false,
      reason: expect.stringContaining("five"),
    });
  });

  it.each(["scores-numeric", "scores-boolean"] as const)(
    "keeps real zero means and evaluation counts while masking empty buckets on %s",
    (view) => {
      const config = createStudioWidget();
      config.queries[0] = {
        ...config.queries[0]!,
        view,
        metrics: [{ id: "mean", measure: "value", aggregation: "avg" }],
        filters: [
          {
            column: "dataType",
            type: "stringOptions",
            operator: "any of",
            value: [view === "scores-boolean" ? "BOOLEAN" : "NUMERIC"],
          },
        ],
      };
      config.display = {
        chartType: "LINE_TIME_SERIES",
        timeSeries: true,
        showHeadline: true,
      };
      config.expressions = [
        {
          id: "doubled",
          label: "Doubled mean",
          formula: `${config.queries[0]!.id}.mean * 2`,
        },
      ];
      const plan = createCurrentStudioPlan(config, context);
      expect(plan.requests[0]!.query.metrics).toContainEqual({
        measure: "count",
        aggregation: "count",
      });
      expect(plan.requests).toHaveLength(2);
      const result = normalizeCurrentStudioResults(plan, [
        {
          rows: [
            { time_dimension: "2026-11-01", avg_value: 0, count_count: 0 },
            { time_dimension: "2026-11-02", avg_value: 0, count_count: 2 },
          ],
        },
        { rows: [{ avg_value: 0.75, count_count: 8 }] },
      ]);
      const sourceRows = result.rows.filter((row) => row.queryId !== "doubled");
      const sourceSummaries = result.summaries.filter(
        (row) => row.queryId !== "doubled",
      );
      expect(sourceRows.map((row) => row.value)).toEqual([null, 0]);
      expect(sourceRows.map((row) => row.evaluationCount)).toEqual([0, 2]);
      expect(sourceSummaries.map((row) => row.value)).toEqual([0.75]);
      expect(sourceSummaries.map((row) => row.evaluationCount)).toEqual([8]);
      const derivedRows = result.rows
        .concat(result.summaries)
        .filter((row) => row.queryId === "doubled");
      expect(derivedRows).toHaveLength(3);
      expect(
        derivedRows.every((row) => row.evaluationCount === undefined),
      ).toBe(true);
      expect(result.diagnostics[0]!.queryCount).toBe(2);
    },
  );

  it("aligns only referenced formula inputs and retains hidden audit values with null division", () => {
    const config = createStudioWidget();
    config.queries = ["errors", "all"].map((id) => ({
      ...config.queries[0]!,
      id,
      label: id,
      hidden: true,
    }));
    config.expressions = [
      {
        id: "rate",
        label: "Rate",
        formula: "errors.count / all.count",
        unit: "percent",
      },
    ];
    const plan = createCurrentStudioPlan(config, context);
    const result = normalizeCurrentStudioResults(plan, [
      { rows: [{ count_count: 2 }] },
      { rows: [{ count_count: 8 }] },
    ]);
    expect(
      Object.fromEntries(result.rows.map((row) => [row.seriesId, row.value])),
    ).toEqual({ "errors.count": 2, "all.count": 8, rate: 0.25 });
    expect(result.series.find((series) => series.id === "rate")).toMatchObject({
      unit: "percent",
      rawUnit: "ratio",
    });
    expect(
      normalizeCurrentStudioResults(plan, [
        { rows: [{ count_count: 0 }] },
        { rows: [{ count_count: 0 }] },
      ]).rows.find((row) => row.queryId === "rate")!.value,
    ).toBeNull();
    config.queries.forEach((query) => {
      query.dimensions = [{ field: "name" }];
    });
    expect(validateCurrentStudioConfig(config).valid).toBe(false);
  });

  it("uses native histogram tuples without claiming exact custom boundaries", () => {
    const config = createStudioWidget();
    config.queries[0]!.metrics = [
      { id: "distribution", measure: "latency", aggregation: "histogram" },
    ];
    config.display = { chartType: "HISTOGRAM", bins: 10 };
    const plan = createCurrentStudioPlan(config, context);
    const result = normalizeCurrentStudioResults(plan, [
      {
        rows: [
          {
            histogram_latency: [
              [0, 10, 2],
              [10, 30, 3],
            ],
            count_count: 5,
          },
        ],
      },
    ]);
    expect(result.rows.map((row) => row.value)).toEqual([2, 3]);
    expect(result.rows.map((row) => row.dimension)).toEqual([
      "0 – 10",
      "10 – 30",
    ]);
    expect(result.series[0]).toMatchObject({
      unit: "observations",
      bucketUnit: "milliseconds",
    });
    config.display.timeSeries = true;
    expect(validateCurrentStudioConfig(config)).toMatchObject({
      valid: false,
      reason: expect.stringContaining("over time"),
    });
  });
});
