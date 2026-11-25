import {
  StudioWidgetConfigSchema,
  type StudioWidgetConfig,
} from "./dashboard-studio";
import type { HomeDashboardPresetId } from "./home-dashboard";
import type { FilterState } from "../types";
import { getGenerationLikeTypes } from "./observations";

const metric = (
  id: string,
  measure: string,
  aggregation: StudioWidgetConfig["queries"][number]["metrics"][number]["aggregation"],
) => ({ id, measure, aggregation });
const count = metric("count", "count", "count");
const generations: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: getGenerationLikeTypes(),
  },
];
const roots: FilterState = [
  { column: "isRootObservation", type: "boolean", operator: "=", value: true },
];
const quality: FilterState = [
  {
    column: "dataType",
    type: "stringOptions",
    operator: "any of",
    value: ["NUMERIC"],
  },
];
const query = (
  id: string,
  label: string,
  metrics: StudioWidgetConfig["queries"][number]["metrics"] = [count],
  dimensions: string[] = [],
  filters: FilterState = [],
  view: StudioWidgetConfig["queries"][number]["view"] = "observations",
) => ({
  id,
  label,
  view,
  ...(view.startsWith("scores-") ? { scoreTarget: "all" as const } : {}),
  metrics,
  dimensions: dimensions.map((field) => ({ field })),
  filters,
});
const config = (
  title: string,
  description: string,
  queries: StudioWidgetConfig["queries"],
  chartType: StudioWidgetConfig["display"]["chartType"] = "VERTICAL_BAR",
  options: Partial<StudioWidgetConfig["display"]> = {},
  expressions: StudioWidgetConfig["expressions"] = [],
) =>
  StudioWidgetConfigSchema.parse({
    version: 1,
    title,
    description,
    queries,
    expressions,
    display: { chartType, rowLimit: 25, legend: true, ...options },
  });

const percentiles = ["p50", "p90", "p95", "p99"] as const;
const latencyMetrics = percentiles.map((p) => metric(p, "latency", p));
const latencyOrder: StudioWidgetConfig["queries"][number]["orderBy"] = [
  { field: "p95_latency", direction: "desc" },
];
const recipes: Record<HomeDashboardPresetId, StudioWidgetConfig> = {
  "home-traces": config(
    "Requests by trace name",
    "Count distinct trace IDs grouped by trace name. Observation count and distinct trace count are different measures.",
    [
      query(
        "requests",
        "Distinct traces",
        [metric("traces", "traceId", "uniq")],
        ["traceName"],
      ),
    ],
    "HORIZONTAL_BAR",
    { showHeadline: true, headlineMetricRef: "requests.traces" },
  ),
  "home-model-costs": config(
    "Model cost and tokens",
    "Generation-like cost and token totals, grouped by model. The full-period summary includes models outside the shown model list.",
    [
      query(
        "cost",
        "Cost",
        [
          metric("cost", "totalCost", "sum"),
          metric("tokens", "totalTokens", "sum"),
        ],
        ["providedModelName"],
        generations,
      ),
    ],
    "PIVOT_TABLE",
    { showHeadline: true, headlineMetricRef: "cost.cost" },
  ),
  "home-scores-table": config(
    "Score definitions and distributions",
    "Switch between numeric count/mean, boolean zero/one counts and categorical distributions. Score name, source and data type remain distinct. All score attachment targets are included; use the score-target selector to narrow the scope.",
    [
      query(
        "scores",
        "Numeric scores",
        [metric("mean", "value", "avg"), count],
        ["name", "source", "dataType"],
        quality,
        "scores-numeric",
      ),
      query(
        "boolean",
        "Boolean rates",
        [count, metric("rate", "value", "avg")],
        ["name", "source"],
        [],
        "scores-boolean",
      ),
      query(
        "boolean_zero",
        "Boolean false",
        [count],
        ["name", "source"],
        [
          {
            column: "booleanValue",
            type: "boolean",
            operator: "=",
            value: false,
          },
        ],
        "scores-boolean",
      ),
      query(
        "boolean_one",
        "Boolean true",
        [count],
        ["name", "source"],
        [
          {
            column: "booleanValue",
            type: "boolean",
            operator: "=",
            value: true,
          },
        ],
        "scores-boolean",
      ),
      query(
        "categorical",
        "Categorical counts",
        [count],
        ["name", "source", "stringValue"],
        [],
        "scores-categorical",
      ),
    ],
    "PIVOT_TABLE",
    { activeQueryIds: ["scores"] },
  ),
  "home-traces-obs-time-series": config(
    "Observations and distinct traces",
    "Switch between observations by level and distinct trace IDs per bucket. Each period summary is queried independently.",
    [
      query("observations", "Observations by level", [count], ["level"]),
      query("traces", "Distinct traces", [metric("traces", "traceId", "uniq")]),
    ],
    "LINE_TIME_SERIES",
    { timeSeries: true, showHeadline: true, activeQueryIds: ["observations"] },
  ),
  "home-model-usage": config(
    "Cost and usage views",
    "Four editable views: cost by model, cost by cost-map key, usage by model and usage by usage-map key. Map keys include input, output and custom or cached usage categories.",
    [
      query(
        "cost_by_model",
        "Cost by model",
        [metric("cost", "totalCost", "sum")],
        ["providedModelName"],
        generations,
      ),
      query(
        "cost_by_type",
        "Cost by type",
        [
          {
            ...metric("cost", "costByType", "sum"),
            summary: { measure: "totalCost", aggregation: "sum" },
          },
        ],
        ["costType"],
        generations,
      ),
      query(
        "usage_by_model",
        "Usage by model",
        [metric("tokens", "totalTokens", "sum")],
        ["providedModelName"],
        generations,
      ),
      query(
        "usage_by_type",
        "Usage by token type",
        [
          {
            ...metric("tokens", "usageByType", "sum"),
            summary: { measure: "totalTokens", aggregation: "sum" },
          },
        ],
        ["usageType"],
        generations,
      ),
    ],
    "LINE_TIME_SERIES",
    { timeSeries: true, showHeadline: true, activeQueryIds: ["cost_by_model"] },
  ),
  "home-users": config(
    "User consumption",
    "Switch between cost and distinct trace count by user, including missing attribution. The full-period summary includes users outside the visible top list.",
    [
      query(
        "cost",
        "Cost by user",
        [metric("cost", "totalCost", "sum")],
        ["userId"],
        generations,
      ),
      query(
        "traces",
        "Traces by user",
        [metric("traces", "traceId", "uniq")],
        ["userId"],
      ),
    ],
    "HORIZONTAL_BAR",
    { showHeadline: true, activeQueryIds: ["cost"] },
  ),
  "home-chart-scores": config(
    "Numeric and boolean scores over time",
    "Bucket mean per numeric or boolean score definition, keeping name, source and data type distinct. This is not a rolling moving average. All score attachment targets are included.",
    [
      query(
        "quality",
        "Quality",
        [metric("mean", "value", "avg")],
        ["name", "source", "dataType"],
        [],
        "scores-numeric",
      ),
    ],
    "LINE_TIME_SERIES",
    { timeSeries: true },
  ),
  "home-latency-table-traces": config(
    "Root observation latency",
    "Measures each recorded root observation's own duration. A root lasting 2 seconds contributes 2 seconds even if its external parent takes 5 seconds. Child observations are not counted separately. Instrument a root around the full request to measure end-to-end request latency.",
    [
      {
        ...query("roots", "Root latency", latencyMetrics, ["traceName"], roots),
        orderBy: latencyOrder,
      },
    ],
    "PIVOT_TABLE",
    { unit: "milliseconds", rowLimit: 20 },
  ),
  "home-latency-table-generations": config(
    "Generation latency percentiles",
    "p50, p90, p95 and p99 by generation name, ordered by p95 descending with the same top-20 bound as the preset. Percentiles are non-additive.",
    [
      {
        ...query(
          "generations",
          "Generation latency",
          latencyMetrics,
          ["name"],
          generations,
        ),
        orderBy: latencyOrder,
      },
    ],
    "PIVOT_TABLE",
    { unit: "milliseconds", rowLimit: 20 },
  ),
  "home-latency-table-observations": config(
    "Observation latency percentiles",
    "By observation type and name, excluding GENERATION exactly as the preset does. Ordered by p95 descending, top 20; EMBEDDING remains included.",
    [
      {
        ...query(
          "observations",
          "Latency",
          latencyMetrics,
          ["type", "name"],
          [
            {
              column: "type",
              type: "stringOptions",
              operator: "none of",
              value: ["GENERATION"],
            },
          ],
        ),
        orderBy: latencyOrder,
      },
    ],
    "PIVOT_TABLE",
    { unit: "milliseconds", rowLimit: 20 },
  ),
  "home-generation-latency": config(
    "Model latency percentiles",
    "Five percentile views of generation duration by model. Select a percentile to compare models on the same scale.",
    (["p50", "p75", "p90", "p95", "p99"] as const).map((p) =>
      query(
        p,
        p,
        [metric(p, "latency", p)],
        ["providedModelName"],
        generations,
      ),
    ),
    "LINE_TIME_SERIES",
    {
      unit: "milliseconds",
      timeSeries: true,
      rowLimit: 1000,
      activeQueryIds: ["p50"],
    },
  ),
  "home-score-analytics": config(
    "Typed score views",
    "A score distribution and its trend become ordinary editable charts. Keep score name, source and type distinct when selecting a score definition.",
    [
      query(
        "numeric",
        "Numeric scores",
        [metric("mean", "value", "avg")],
        ["name"],
        quality,
        "scores-numeric",
      ),
      query(
        "boolean",
        "Accepted share",
        [metric("rate", "value", "avg")],
        ["name"],
        [],
        "scores-boolean",
      ),
      query(
        "categorical",
        "Outcomes",
        [count],
        ["stringValue"],
        [],
        "scores-categorical",
      ),
    ],
    "PIVOT_TABLE",
  ),
};

/** Editable recipes for frozen Home cards. Returned definitions are independent copies. */
export const getStudioPresetReplacement = (
  presetId: HomeDashboardPresetId,
): StudioWidgetConfig[] => {
  const recipe = structuredClone(recipes[presetId]);
  if (presetId !== "home-score-analytics") return [recipe];
  return [
    config(
      "Numeric score distribution",
      "Histogram per numeric score name and source. Choose a score definition with a query filter; distributions remain separate.",
      [
        query(
          "numeric",
          "Numeric distribution",
          [metric("distribution", "value", "histogram")],
          ["name", "source"],
          quality,
          "scores-numeric",
        ),
      ],
      "HISTOGRAM",
      { bins: 10 },
    ),
    config(
      "Numeric score trend",
      "Mean score per time bucket, grouped by score name and source. This is a bucket mean, not a rolling average.",
      [
        query(
          "numeric",
          "Numeric mean",
          [metric("mean", "value", "avg")],
          ["name", "source"],
          quality,
          "scores-numeric",
        ),
      ],
      "LINE_TIME_SERIES",
      { timeSeries: true },
    ),
    config(
      "Boolean score distribution",
      "Exact false/true score counts per definition. The explicit intervals contain zero and one respectively; missing values remain visible.",
      [
        query(
          "boolean",
          "Boolean distribution",
          [metric("distribution", "value", "histogram")],
          ["name", "source"],
          [],
          "scores-boolean",
        ),
      ],
      "HISTOGRAM",
      { histogramEdges: [-0.5, 0.5, 1.5] },
    ),
    config(
      "Boolean score trend",
      "Mean of zero/one scores per time bucket: the true share, between zero and one. Choose score name and source using query filters.",
      [
        query(
          "boolean",
          "True share",
          [metric("rate", "value", "avg")],
          ["name", "source"],
          [],
          "scores-boolean",
        ),
      ],
      "LINE_TIME_SERIES",
      { timeSeries: true },
    ),
    config(
      "Categorical score distribution",
      "Count scores per categorical value, keeping the score name and source in the grouping.",
      [
        query(
          "categorical",
          "Category count",
          [count],
          ["name", "source", "stringValue"],
          [],
          "scores-categorical",
        ),
      ],
      "HORIZONTAL_BAR",
    ),
    config(
      "Categorical score trend",
      "Count each category over time. Numeric means and categorical counts retain separate definitions.",
      [
        query(
          "categorical",
          "Category count",
          [count],
          ["name", "source", "stringValue"],
          [],
          "scores-categorical",
        ),
      ],
      "BAR_TIME_SERIES",
      { timeSeries: true },
    ),
  ];
};
