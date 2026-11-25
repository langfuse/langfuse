import { describe, expect, it } from "vitest";
import { type MultiQueryConfig } from "@langfuse/shared";
import {
  normalizeMultiQueryConfig,
  multiQueryTabSchema,
} from "@langfuse/shared/dashboards";
import { applyMultiQueryFormulas } from "./multiQueryFormulas";
import {
  buildMultiQueryPlan,
  normalizeMultiQueryResults,
  resolveMultiQueryView,
} from "./multiQueryModel";

const config: MultiQueryConfig = {
  version: 1,
  title: "Metadata populations",
  description: "",
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
  it("keeps a comparison together and converts a saved default view to an independent first tab", () => {
    const views = [
      { id: "abc", label: "Has abc", queryIds: ["a"] },
      { id: "bbc", label: "Has bbc", queryIds: ["b"] },
    ];
    const comparison = normalizeMultiQueryConfig({ ...config, views });
    expect(
      comparison.tabs.map((tab) => tab.queries.map((query) => query.id)),
    ).toEqual([["a", "b"]]);
    const custom = normalizeMultiQueryConfig({
      ...config,
      views: [
        { id: "customers", label: "Paying customers", queryIds: ["a"] },
        { id: "both", label: "All traffic", queryIds: ["a", "b"] },
      ],
    });
    expect(custom.tabs.map((tab) => tab.id)).toEqual([
      "chart",
      "customers",
      "both",
    ]);
    const migrated = normalizeMultiQueryConfig({
      ...config,
      views,
      defaultViewId: "bbc",
    });
    expect(migrated.tabs[0]).toMatchObject({
      id: "bbc",
      queries: [{ id: "b" }],
    });
    expect(
      migrated.tabs.flatMap((tab) => tab.queries.map((query) => query.id)),
    ).toContain("a");
  });

  it("preserves the query and its top-group ranking when upgrading mixed-unit panels", () => {
    const source = {
      ...config.queries[0]!,
      metrics: [
        { id: "cost", measure: "totalCost", aggregation: "sum" as const },
        { id: "tokens", measure: "totalTokens", aggregation: "sum" as const },
      ],
      orderBy: [{ field: "sum_totalCost", direction: "desc" as const }],
    };
    const { tabs } = normalizeMultiQueryConfig({
      ...config,
      queries: [source],
    });
    expect(
      tabs.map((t) =>
        t.queries[0]!.metrics.filter((m) => !m.hidden).map((m) => m.id),
      ),
    ).toEqual([["cost"], ["tokens"]]);
    expect(tabs.map((t) => t.queries[0]!.orderBy)).toEqual([
      source.orderBy,
      source.orderBy,
    ]);
    const tab = tabs[0]!;
    for (const expression of ["a.cost + a.tokens", "outside.cost / a.cost"]) {
      const parsed = multiQueryTabSchema.safeParse({
        ...tab,
        formulas: [
          { id: "invalid", label: "Invalid", expression, format: "number" },
        ],
      });
      expect(parsed.success).toBe(false);
    }
  });
  it("aligns hidden formula operands by bucket and breakdown, retaining null for missing or zero denominators", () => {
    const {
      tabs: [base],
    } = normalizeMultiQueryConfig(config);
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

  it("switches named execution subsets without invalidating the other saved views and falls back after deletion", () => {
    const named = {
      ...config,
      views: [
        { id: "abc", label: "Only abc", queryIds: ["a"] },
        { id: "bbc", label: "Only bbc", queryIds: ["b"] },
      ],
      defaultViewId: "abc",
    };
    for (const [viewId, queryId] of [
      ["abc", "a"],
      ["bbc", "b"],
    ]) {
      const selected = resolveMultiQueryView(named, viewId);
      expect(
        buildMultiQueryPlan(named, context, selected.queryIds).queries.map(
          (query) => query.source.id,
        ),
      ).toEqual([queryId]);
    }
    expect(
      resolveMultiQueryView({ ...named, views: named.views.slice(0, 1) }, "bbc")
        .viewId,
    ).toBe("abc");
    expect(resolveMultiQueryView(named, "all").queryIds).toEqual(["a", "b"]);
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
    presentationOnly.title = "Different title";
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
    const score: MultiQueryConfig = {
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
  const grouped: MultiQueryConfig = {
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
