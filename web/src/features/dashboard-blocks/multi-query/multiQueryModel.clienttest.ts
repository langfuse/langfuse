import { describe, expect, it } from "vitest";
import {
  multiQueryTabSchema,
  multiQueryTabSaveSchema,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { applyMultiQueryFormulas } from "./multiQueryFormulas";
import {
  formatMultiQueryFormula,
  parseMultiQueryFormulaInput,
} from "./formulaOperands";
import {
  buildMultiQueryPlan,
  normalizeMultiQueryResults,
} from "./multiQueryModel";

const config: MultiQueryTab = {
  id: "main",
  label: "Metadata populations",
  display: { chartType: "VERTICAL_BAR" },
  queries: ["abc", "bbc"].map((key, index) => ({
    id: index ? "b" : "a",
    label: `Has ${key}`,
    view: "observations",
    metrics: [{ id: "count", measure: "count", aggregation: "count" }],
    dimensions: [],
    filters: [
      {
        type: "stringObject",
        column: "metadata",
        key,
        operator: "is set",
        value: "",
      },
    ],
  })),
};
const context = {
  dateRange: {
    from: new Date("2026-11-01T00:00:00Z"),
    to: new Date("2026-11-02T00:00:00Z"),
  },
  filterState: [],
  readPath: "v4" as const,
};

describe("multi-query ordinary query composition", () => {
  it("keeps source queries running while a formula is incomplete, but rejects invalid queries and saves", () => {
    const draft: MultiQueryTab = {
      ...config,
      formulas: [
        { id: "f", label: "", expression: "a.count +", format: "number" },
      ],
    };
    expect(buildMultiQueryPlan(draft, context)).toEqual(
      buildMultiQueryPlan(config, context),
    );
    expect(multiQueryTabSaveSchema.safeParse(draft).success).toBe(false);
    const invalid = structuredClone(draft);
    invalid.queries[0]!.metrics[0]!.measure = "missingMeasure";
    expect(() => buildMultiQueryPlan(invalid, context)).toThrow(
      /Unknown measure/,
    );
  });
  it("preserves a classic pivot table's saved dimension sort", () => {
    const pivot = structuredClone(config);
    pivot.display = {
      chartType: "PIVOT_TABLE",
      defaultSort: { column: "name", order: "ASC" },
    };
    pivot.queries[0]!.dimensions = [{ field: "name" }];
    const plan = buildMultiQueryPlan(pivot, context);
    expect(plan.queries[0]!.query.orderBy).toEqual([
      { field: "name", direction: "asc" },
    ]);
  });
  it("runs saved Home map categories against their original data on the legacy read path", () => {
    const categories = structuredClone(config);
    categories.display.chartType = "LINE_TIME_SERIES";
    categories.queries = [
      {
        id: "usage",
        label: "Usage by type",
        view: "observations",
        dimensions: [{ field: "usageType" }],
        metrics: [{ id: "tokens", measure: "usageByType", aggregation: "sum" }],
        filters: [
          {
            column: "providedModelName",
            type: "stringOptions",
            operator: "any of",
            value: ["Model A"],
          },
        ],
      },
    ];
    const [legacy] = buildMultiQueryPlan(categories, {
      ...context,
      readPath: "v3",
    }).queries;
    expect(legacy?.homeCategory?.queryName).toBe(
      "observations-usage-by-type-timeseries",
    );
    expect(legacy?.homeCategory?.filters).toContainEqual({
      column: "model",
      type: "stringOptions",
      operator: "any of",
      value: ["Model A"],
    });
    const result = normalizeMultiQueryResults(
      { queries: [legacy!], warnings: [] },
      [
        {
          data: [
            {
              usageType: "input",
              time_dimension: "2026-11-01T00:00:00Z",
              sum_usageByType: 12,
            },
            {
              usageType: null,
              time_dimension: "2026-11-02T00:00:00Z",
              sum_usageByType: 0,
            },
          ],
          isPending: false,
          isError: false,
          error: null,
        },
      ],
    );
    expect(result.series[0]).toMatchObject({ label: "input", unit: "tokens" });
    expect(result.series).toHaveLength(1);
    expect(result.bucketTimes).toHaveLength(2);
    expect(
      buildMultiQueryPlan(categories, context).queries[0]?.homeCategory,
    ).toBeUndefined();
    categories.queries[0]!.dimensions.push({ field: "name" });
    expect(() =>
      buildMultiQueryPlan(categories, { ...context, readPath: "v3" }),
    ).toThrow(/category/i);
  });
  it("aligns hidden formula operands by bucket and breakdown, retaining null for missing or zero denominators", () => {
    const base = config;
    const tab = {
      ...base!,
      queries: base!.queries.map((q) => ({
        ...q,
        hidden: true,
        dimensions: [{ field: "name" }],
      })),
      formulas: [
        {
          id: "rate",
          label: "Error rate",
          expression: "a.count / b.count",
          format: "percent" as const,
        },
      ],
    };
    const plan = buildMultiQueryPlan(
      {
        ...config,
        display: { chartType: "LINE_TIME_SERIES" },
        queries: tab.queries,
      },
      context,
    );
    const result = normalizeMultiQueryResults(plan, [
      {
        data: [
          { name: "a", time_dimension: "day1", count_count: 2 },
          { name: "b", time_dimension: "day1", count_count: 7 },
          { name: "a", time_dimension: "day2", count_count: 2 },
        ],
        isPending: false,
        isError: false,
        error: null,
      },
      {
        data: [
          { name: "b", time_dimension: "day1", count_count: 0 },
          { name: "a", time_dimension: "day1", count_count: 8 },
        ],
        isPending: false,
        isError: false,
        error: null,
      },
    ]);
    const computed = applyMultiQueryFormulas(tab, result);
    expect(
      computed.values.map((v) => [v.time, v.dimensions.name, v.value, v.unit]),
    ).toEqual([
      ["day1", "a", 25, "percent"],
      ["day1", "b", null, "percent"],
      ["day2", "a", null, "percent"],
    ]);
    const emptyDenominator = applyMultiQueryFormulas(
      {
        ...tab,
        formulas: tab.formulas.map((f) => ({ ...f, format: "number" })),
      },
      { ...result, values: result.values.filter((row) => row.queryId === "a") },
    );
    expect(emptyDenominator.values.map((row) => [row.value, row.unit])).toEqual(
      [
        [null, undefined],
        [null, undefined],
        [null, undefined],
      ],
    );
  });

  it("labels unnamed formulas with their tab expression until a name is supplied", () => {
    const tab = structuredClone(config);
    const result = normalizeMultiQueryResults(
      buildMultiQueryPlan(config, context),
      config.queries.map(() => ({
        data: [{ count_count: 3 }],
        isPending: false,
        isError: false,
        error: null,
      })),
    );
    for (const [label, expression, expected] of [
      ["", "a.count / b.count", "Has abc / Has bbc"],
      ["", "(a.count + b.count) / 2", "(Has abc + Has bbc) / 2"],
      ["Average", "(a.count + b.count) / 2", "Average"],
    ] as const) {
      const saved = multiQueryTabSchema.parse({
        ...tab,
        formulas: [{ id: "f", label, expression, format: "number" }],
      });
      const chart = applyMultiQueryFormulas(saved, result);
      expect(chart.series.find((s) => s.id === "formula:f")?.label).toBe(
        expected,
      );
      expect(chart.values.find((v) => v.queryId === "f")).toMatchObject({
        queryLabel: expected,
        metricLabel: expected,
      });
    }
  });

  it("round-trips duplicate series names alongside a literal name that looks like their qualifier", () => {
    const tab = structuredClone(config);
    const source = tab.queries[0]!;
    tab.queries = [
      { ...source, id: "a", label: "Count" },
      { ...source, id: "b", label: "Count" },
      { ...source, id: "c", label: "Count [A]" },
    ];
    const stored = "a.count + b.count / c.count";
    const named = 'Count [A] + Count [B] / "Count [A]"';
    expect(formatMultiQueryFormula(tab, stored)).toBe(named);
    expect(parseMultiQueryFormulaInput(tab, named)).toBe(stored);
    expect(parseMultiQueryFormulaInput(tab, "A + B / C")).toBe(stored);
  });

  it("builds separate presence queries with production environment override and canonical query versions", () => {
    const local = {
      ...config,
      queries: config.queries.map((query, index) =>
        index
          ? query
          : {
              ...query,
              filters: [
                ...query.filters,
                {
                  type: "stringOptions" as const,
                  column: "environment",
                  operator: "any of" as const,
                  value: ["staging"],
                },
              ],
            },
      ),
    };
    const plan = buildMultiQueryPlan(local, {
      ...context,
      filterState: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["production"],
        },
      ],
    });
    expect(plan.queries).toHaveLength(2);
    expect(plan.queries[0]!.query.filters).toContainEqual(
      config.queries[0]!.filters[0],
    );
    expect(
      plan.queries.map(
        (item) =>
          item.query.filters.find((filter) => filter.column === "environment")
            ?.value,
      ),
    ).toEqual([["staging"], ["production"]]);
    expect(plan.queries.every((item) => item.version === "v2")).toBe(true);
    expect(plan.warnings).toHaveLength(1);
    const presentationOnly = structuredClone(local);
    presentationOnly.label = "Different title";
    presentationOnly.queries[0]!.label = "Different name";
    expect(
      buildMultiQueryPlan(presentationOnly, context).queries.map(
        (item) => item.query,
      ),
    ).toEqual(
      buildMultiQueryPlan(local, context).queries.map((item) => item.query),
    );
  });

  it("distinguishes an actual zero score mean from an empty bucket and preserves completed series on partial failure", () => {
    const score: MultiQueryTab = {
      ...config,
      display: { chartType: "LINE_TIME_SERIES" },
      queries: [
        {
          id: "score",
          label: "Quality",
          view: "scores-numeric",
          metrics: [{ id: "mean", measure: "value", aggregation: "avg" }],
          dimensions: [],
          filters: [],
        },
        config.queries[0]!,
      ],
    };
    const plan = buildMultiQueryPlan(score, context);
    expect(plan.queries[0]!.query.metrics).toContainEqual({
      measure: "count",
      aggregation: "count",
    });
    const prepared = normalizeMultiQueryResults(plan, [
      {
        data: [
          {
            time_dimension: "2026-11-01T00:00:00Z",
            avg_value: 0,
            count_count: 1,
          },
          {
            time_dimension: "2026-11-01T01:00:00Z",
            avg_value: 0,
            count_count: 0,
          },
        ],
        isPending: false,
        isError: false,
        error: null,
      },
      {
        data: undefined,
        isPending: false,
        isError: true,
        error: "Query failed",
      },
    ]);
    expect(
      prepared.values.map((row) => [row.value, row.evaluationCount]),
    ).toEqual([
      [0, 1],
      [null, 0],
    ]);
    expect(prepared.status).toBe("partial");
    expect(prepared.failures).toEqual([
      { id: "a", label: "Has abc", message: "Query failed" },
    ]);
    const reversed = normalizeMultiQueryResults(plan, [
      {
        data: [...plan.queries[0]!.source.metrics].flatMap(() => [
          {
            time_dimension: "2026-11-01T01:00:00Z",
            avg_value: 0,
            count_count: 0,
          },
          {
            time_dimension: "2026-11-01T00:00:00Z",
            avg_value: 0,
            count_count: 1,
          },
        ]),
        isPending: false,
        isError: false,
        error: null,
      },
      { data: [], isPending: false, isError: false, error: null },
    ]);
    expect(reversed.series.map((series) => [series.id, series.color])).toEqual(
      prepared.series.map((series) => [series.id, series.color]),
    );
  });
});

it("keeps an oversized result inside the chart's error state", () => {
  const plan = buildMultiQueryPlan(config, context);
  const result = normalizeMultiQueryResults(plan, [
    {
      data: Array.from({ length: 100_001 }, () => ({ count_count: 1 })),
      isPending: false,
      isError: false,
      error: null,
    },
  ]);
  expect(result.status).toBe("error");
  expect(result.values).toHaveLength(0);
  expect(result.failures[0]?.message).toContain("time range");
});

it("preserves successful grouped bucket markers without inventing series for empty or failed queries", () => {
  const grouped: MultiQueryTab = {
    ...config,
    display: { chartType: "LINE_TIME_SERIES" },
    queries: config.queries.map((source) => ({
      ...source,
      metrics: [
        { id: "cost", measure: "totalCost", aggregation: "sum" },
        { id: "traces", measure: "traceId", aggregation: "uniq" },
      ],
      dimensions: [{ field: "providedModelName" }],
    })),
  };
  const plan = buildMultiQueryPlan(grouped, context);
  expect(
    plan.queries.every((source) =>
      source.query.metrics.some(
        (metric) =>
          metric.measure === "count" && metric.aggregation === "count",
      ),
    ),
  ).toBe(true);
  const result = normalizeMultiQueryResults(plan, [
    {
      data: [
        {
          time_dimension: "2026-11-01T00:00:00Z",
          providedModelName: "one",
          sum_totalCost: 2,
          uniq_traceId: 1,
          count_count: 1,
        },
        {
          time_dimension: "2026-11-02T00:00:00Z",
          providedModelName: null,
          sum_totalCost: 0,
          uniq_traceId: 0,
          count_count: 0,
        },
        {
          time_dimension: "2026-11-03T00:00:00Z",
          providedModelName: null,
          sum_totalCost: 0,
          uniq_traceId: 0,
          count_count: 1,
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    },
    { data: undefined, isPending: false, isError: true, error: "Query failed" },
  ]);
  expect(result.bucketTimes).toEqual([
    "2026-11-01T00:00:00Z",
    "2026-11-02T00:00:00Z",
    "2026-11-03T00:00:00Z",
  ]);
  expect(result.series).toHaveLength(4);
  expect(result.values.map((row) => row.value)).toEqual([2, 1, 0, 0]);
  expect(
    result.values.every((row) => row.time !== "2026-11-02T00:00:00Z"),
  ).toBe(true);
  expect(result.status).toBe("partial");
});
