import type { ScoreLevel as ScoreTagLevel } from "@/src/components/score-tag";
import type {
  ScoreLevel,
  ScoreMetricSpec,
} from "@/src/features/experiments/types/charts";
import type { WidgetDimensionConfig } from "@/src/features/widgets";
import type { FilterCondition } from "@langfuse/shared";

// Base chart IDs
export const BASE_CHART_IDS = {
  COST: "base:cost",
  LATENCY: "base:latency",
} as const;

/**
 * The level tag shown next to a score name in the metric dropdown, in the
 * vocabulary the tracing tables' score pickers use (`ScoreTag`).
 */
export const SCORE_LEVEL_TAGS: Record<ScoreLevel, ScoreTagLevel> = {
  obs: "observation",
  experiment: "experiment",
};

/**
 * Where the boolean score names sit per level. Booleans are also listed under
 * `*_scores_avg` (they are stored as 0/1), so this is what tells a numeric
 * option apart from a boolean one.
 */
export const SCORE_BOOLEAN_FILTER_KEYS: Record<
  ScoreLevel,
  "obs_score_booleans" | "experiment_score_booleans"
> = {
  obs: "obs_score_booleans",
  experiment: "experiment_score_booleans",
};

export const SCORE_METRIC_SPECS: ScoreMetricSpec = {
  "obs:numeric": {
    level: "obs",
    dataType: "numeric",
    filterKey: "obs_scores_avg",
  },
  "obs:categorical": {
    level: "obs",
    dataType: "categorical",
    filterKey: "obs_score_categories",
  },
  "experiment:numeric": {
    level: "experiment",
    dataType: "numeric",
    filterKey: "experiment_scores_avg",
  },
  "experiment:categorical": {
    level: "experiment",
    dataType: "categorical",
    filterKey: "experiment_score_categories",
  },
};

const BASE_EXPERIMENT_WIDGET_CONFIG = {
  view: "observations",
  minVersion: "v2",
  dimensions: [] as WidgetDimensionConfig[],
  // Entity (x-axis) order follows the experiments table order, applied
  // client-side in InlineWidget, so no query-side ordering is needed.
  orderBy: null,
  chartType: "LINE_TIME_SERIES",
  chartConfig: { type: "LINE_TIME_SERIES" },
  timeDimension: null,
  entityDimension: { field: "experimentId" },
  filters: [],
} as const;

/**
 * Full configuration for experiment cost widget.
 * Used for both query building and widget display.
 */
export const EXPERIMENT_COST_WIDGET_CONFIG = {
  ...BASE_EXPERIMENT_WIDGET_CONFIG,
  metrics: [{ measure: "totalCost", agg: "sum" }],
  schedulerId: "experiments:cost-chart",
} as const;

export const EXPERIMENT_LATENCY_WIDGET_CONFIG = {
  ...BASE_EXPERIMENT_WIDGET_CONFIG,
  metrics: [{ measure: "latency", agg: "avg" }],
  schedulerId: "experiments:latency-chart",
} as const;

const BASE_SCORE_CHART_CONFIG = {
  entityDimension: { field: "experimentId" },
  timeDimension: null,
  minVersion: "v2",
  // Entity (x-axis) order follows the experiments table order, applied
  // client-side in InlineWidget, so no query-side ordering is needed.
  orderBy: null,
} as const;

export const SCORE_LEVEL_ENTITY_DIMENSIONS: Record<
  ScoreLevel,
  { field: string }
> = {
  obs: { field: "experimentId" },
  experiment: { field: "datasetRunId" },
};

export const NUMERIC_SCORE_CHART_CONFIG = {
  ...BASE_SCORE_CHART_CONFIG,
  view: "scores-numeric",
  dimensions: [],
  metrics: [{ measure: "value", agg: "avg" }],
  filters: [],
  chartType: "LINE_TIME_SERIES",
  chartConfig: { type: "LINE_TIME_SERIES" },
} as const;

export const CATEGORICAL_SCORE_CHART_CONFIG = {
  ...BASE_SCORE_CHART_CONFIG,
  view: "scores-categorical",
  dimensions: [{ field: "stringValue" }],
  metrics: [{ measure: "count", agg: "count" }],
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
