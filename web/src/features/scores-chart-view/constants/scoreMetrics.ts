import {
  type ScoreChartDataset,
  type ScoreMetricDef,
} from "@/src/features/scores-chart-view/types";

/**
 * The measures the three score views expose. `value` is a `number`-typed
 * measure on both `scores-numeric` and `scores-boolean` (see
 * `packages/shared/src/features/query/dataModel.ts`), and the actual
 * dashboard widget builder offers EVERY aggregation for a `number`-typed
 * measure (`getValidAggregationsForMeasureType` in
 * `packages/shared/src/features/query/types.ts` returns the full
 * `metricAggregations` list, not just `avg`) — so `value` gets the full set
 * our shared `AggregationFn` expresses here too, matching that screen
 * instead of the narrower choice the fixed "Scores" dashboard widgets
 * (`ChartScores`, `NumericScoreTimeSeriesChart`) happen to hardcode. For
 * "boolean", `avg` is the true-rate; the other aggregations (min/max/p50 of
 * a 0/1 value) are less commonly useful but still valid, same as the
 * builder. Categorical scores have no numeric value to aggregate (see the
 * `ScoreChartDataset` doc comment), so their only metric is a plain count.
 *
 * Labels are the plain measure name ("Count"/"Value"), matching the widget
 * builder's own `startCase(measureKey)` labeling (`WidgetForm.tsx`'s
 * `singleChartMetrics`) instead of a more "explanatory" label invented here.
 */
const VALUE_AGGREGATIONS: ScoreMetricDef["aggregations"] = [
  "avg",
  "sum",
  "min",
  "max",
  "count",
  "p50",
  "p95",
  "p99",
];

export const SCORE_METRICS: ScoreMetricDef[] = [
  {
    key: "count",
    label: "Count",
    dataset: "numeric",
    measure: "count",
    aggregations: ["count"],
  },
  {
    key: "value",
    label: "Value",
    dataset: "numeric",
    measure: "value",
    aggregations: VALUE_AGGREGATIONS,
  },
  {
    key: "count",
    label: "Count",
    dataset: "boolean",
    measure: "count",
    aggregations: ["count"],
  },
  {
    key: "value",
    label: "Value",
    dataset: "boolean",
    measure: "value",
    aggregations: VALUE_AGGREGATIONS,
  },
  {
    key: "count",
    label: "Count",
    dataset: "categorical",
    measure: "count",
    aggregations: ["count"],
  },
];

/** The metrics valid for one dataset — drives the "Metric" picker options. */
export const getScoreMetricsForDataset = (
  dataset: ScoreChartDataset,
): ScoreMetricDef[] => SCORE_METRICS.filter((m) => m.dataset === dataset);
