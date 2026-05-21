import type {
  ScoreLevel,
  ScoreMetricSpec,
} from "@/src/features/experiments/types/charts";
import type { WidgetDimensionConfig } from "@/src/features/widgets/hooks/useWidgetQuery";
import type { FilterCondition } from "@langfuse/shared";

// Base chart IDs
export const BASE_CHART_IDS = {
  COST: "base:cost",
  LATENCY: "base:latency",
} as const;

export const MAX_CHARTS = 4;

export const SCORE_METRIC_SPECS: ScoreMetricSpec = {
  "obs:numeric": {
    level: "obs",
    dataType: "numeric",
    filterKey: "obs_scores_avg",
    group: "Observation Scores",
  },
  "obs:categorical": {
    level: "obs",
    dataType: "categorical",
    filterKey: "obs_score_categories",
    group: "Observation Scores",
  },
  "experiment:numeric": {
    level: "experiment",
    dataType: "numeric",
    filterKey: "experiment_scores_avg",
    group: "Experiment Scores",
  },
  "experiment:categorical": {
    level: "experiment",
    dataType: "categorical",
    filterKey: "experiment_score_categories",
    group: "Experiment Scores",
  },
};

const BASE_EXPERIMENT_WIDGET_CONFIG = {
  view: "observations",
  minVersion: "v2",
  dimensions: [] as WidgetDimensionConfig[],
  orderBy: [{ field: "min_startTime", direction: "asc" }],
  chartType: "LINE_TIME_SERIES",
  chartConfig: { type: "LINE_TIME_SERIES" },
  timeDimension: null,
  entityDimension: { field: "experimentName" },
  filters: [],
} as const;

/**
 * Full configuration for experiment cost widget.
 * Used for both query building and widget display.
 */
export const EXPERIMENT_COST_WIDGET_CONFIG = {
  ...BASE_EXPERIMENT_WIDGET_CONFIG,
  metrics: [
    { measure: "totalCost", agg: "sum" },
    { measure: "startTime", agg: "min" }, // for ordering
  ],
  schedulerId: "experiments:cost-chart",
} as const;

export const EXPERIMENT_LATENCY_WIDGET_CONFIG = {
  ...BASE_EXPERIMENT_WIDGET_CONFIG,
  metrics: [
    { measure: "latency", agg: "avg" },
    { measure: "startTime", agg: "min" }, // for ordering
  ],
  schedulerId: "experiments:latency-chart",
} as const;

const BASE_SCORE_CHART_CONFIG = {
  entityDimension: { field: "experimentName" },
  timeDimension: null,
  minVersion: "v2",
  orderBy: [{ field: "min_timestamp", direction: "desc" }],
} as const;

export const SCORE_LEVEL_ENTITY_DIMENSIONS: Record<
  ScoreLevel,
  { field: string }
> = {
  obs: { field: "experimentName" },
  experiment: { field: "datasetRunId" },
};

export const NUMERIC_SCORE_CHART_CONFIG = {
  ...BASE_SCORE_CHART_CONFIG,
  view: "scores-numeric",
  dimensions: [],
  metrics: [
    { measure: "value", agg: "avg" },
    { measure: "timestamp", agg: "min" },
  ],
  filters: [],
  chartType: "LINE_TIME_SERIES",
  chartConfig: { type: "LINE_TIME_SERIES" },
} as const;

export const CATEGORICAL_SCORE_CHART_CONFIG = {
  ...BASE_SCORE_CHART_CONFIG,
  view: "scores-categorical",
  dimensions: [{ field: "stringValue" }],
  metrics: [
    { measure: "count", agg: "count" },
    { measure: "timestamp", agg: "min" },
  ],
  filters: [],
  chartType: "BAR_TIME_SERIES",
  chartConfig: { type: "BAR_TIME_SERIES" },
} as const;

export const SCORE_LEVEL_FILTERS: Record<ScoreLevel, FilterCondition[]> = {
  obs: [
    {
      column: "observationId",
      operator: "is not null",
      value: "",
      type: "null",
    },
  ],
  experiment: [
    {
      column: "datasetRunId",
      operator: "is not null",
      value: "",
      type: "null",
    },
  ],
};
