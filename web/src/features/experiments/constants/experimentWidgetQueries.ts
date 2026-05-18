import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type QueryType,
  type ViewVersion,
  type viewsV2,
  type metricAggregations,
} from "@/src/features/query";
import { type z } from "zod";
import {
  type WidgetMetricConfig,
  type WidgetDimensionConfig,
} from "@/src/features/widgets/components/InlineWidget";
import { type WidgetChartConfig } from "@/src/features/widgets/utils";

type MetricAggregation = z.infer<typeof metricAggregations>;

export type ExperimentWidgetConfig = {
  // Query fields
  view: z.infer<typeof viewsV2>;
  dimensions: WidgetDimensionConfig[];
  metrics: (WidgetMetricConfig & { aggregation: MetricAggregation })[];
  timeDimension: null;
  entityDimension: { field: string };
  orderBy: { field: string; direction: "asc" | "desc" }[];
  filters?: QueryType["filters"];
  // Widget display fields
  version: ViewVersion;
  chartType: DashboardWidgetChartType;
  chartConfig: WidgetChartConfig;
  schedulerId: string;
  name: string;
  description: string;
};

/**
 * Full configuration for experiment cost widget.
 * Used for both query building and widget display.
 */
export const EXPERIMENT_COST_WIDGET_CONFIG: ExperimentWidgetConfig = {
  // Query fields
  view: "observations",
  dimensions: [],
  metrics: [
    { measure: "totalCost", agg: "sum", aggregation: "sum" },
    { measure: "startTime", agg: "min", aggregation: "min" }, // for ordering
  ],
  timeDimension: null,
  entityDimension: { field: "experimentName" },
  orderBy: [{ field: "min_startTime", direction: "asc" }],
  // Widget display fields
  version: "v2",
  chartType: "LINE_TIME_SERIES",
  chartConfig: { type: "LINE_TIME_SERIES" },
  schedulerId: "experiments:cost-chart",
  name: "Cost by Experiment",
  description: "The cost of all experiments in the current view",
};

export const EXPERIMENT_LATENCY_WIDGET_CONFIG: ExperimentWidgetConfig = {
  view: "observations",
  dimensions: [],
  metrics: [
    { measure: "latency", agg: "avg", aggregation: "avg" },
    { measure: "startTime", agg: "min", aggregation: "min" }, // for ordering
  ],
  timeDimension: null,
  entityDimension: { field: "experimentName" },
  orderBy: [{ field: "min_startTime", direction: "asc" }],
  version: "v2",
  chartType: "LINE_TIME_SERIES",
  chartConfig: { type: "LINE_TIME_SERIES" },
  schedulerId: "experiments:latency-chart",
  name: "Latency by Experiment",
  description: "The latency of all experiments in the current view",
};

export const EXPERIMENT_WIDGET_CONFIGS = [
  EXPERIMENT_COST_WIDGET_CONFIG,
  EXPERIMENT_LATENCY_WIDGET_CONFIG,
];

export function createNumericExperimentScoreWidgetConfig(params: {
  scoreName: string;
  schedulerId?: string;
  name?: string;
  description?: string;
}): ExperimentWidgetConfig {
  return {
    view: "scores-numeric",
    dimensions: [],
    metrics: [{ measure: "value", agg: "avg", aggregation: "avg" }],
    timeDimension: null,
    entityDimension: { field: "experimentName" },
    orderBy: [{ field: "entity_dimension", direction: "asc" }],
    filters: [
      {
        column: "name",
        operator: "=",
        value: params.scoreName,
        type: "string",
      },
    ],
    version: "v2",
    chartType: "LINE_TIME_SERIES",
    chartConfig: { type: "LINE_TIME_SERIES" },
    schedulerId:
      params.schedulerId ?? `experiments:score-numeric:${params.scoreName}`,
    name: params.name ?? `${params.scoreName} by Experiment`,
    description:
      params.description ??
      `Average numeric score '${params.scoreName}' grouped by experiment`,
  };
}

export function createCategoricalExperimentScoreWidgetConfig(params: {
  scoreName: string;
  schedulerId?: string;
  name?: string;
  description?: string;
}): ExperimentWidgetConfig {
  return {
    view: "scores-categorical",
    dimensions: [{ field: "stringValue" }],
    metrics: [{ measure: "count", agg: "count", aggregation: "count" }],
    timeDimension: null,
    entityDimension: { field: "experimentName" },
    orderBy: [{ field: "entity_dimension", direction: "asc" }],
    filters: [
      {
        column: "name",
        operator: "=",
        value: params.scoreName,
        type: "string",
      },
    ],
    version: "v2",
    chartType: "BAR_TIME_SERIES",
    chartConfig: { type: "BAR_TIME_SERIES" },
    schedulerId:
      params.schedulerId ?? `experiments:score-categorical:${params.scoreName}`,
    name: params.name ?? `${params.scoreName} by Experiment`,
    description:
      params.description ??
      `Categorical score counts for '${params.scoreName}' grouped by experiment`,
  };
}

/**
 * Create widget config for experiment-run-level numeric scores.
 * These scores are attached directly to the experiment run (dataset_run_id).
 * Uses datasetRunId as entity dimension since these scores don't go through events.
 */
export function createNumericExperimentRunScoreWidgetConfig(params: {
  scoreName: string;
  schedulerId?: string;
  name?: string;
  description?: string;
}): ExperimentWidgetConfig {
  return {
    view: "scores-numeric",
    dimensions: [],
    metrics: [{ measure: "value", agg: "avg", aggregation: "avg" }],
    timeDimension: null,
    entityDimension: { field: "datasetRunId" },
    orderBy: [{ field: "entity_dimension", direction: "asc" }],
    filters: [
      {
        column: "name",
        operator: "=",
        value: params.scoreName,
        type: "string",
      },
      {
        column: "datasetRunId",
        operator: "is not null",
        value: "",
        type: "null",
      },
    ],
    version: "v2",
    chartType: "LINE_TIME_SERIES",
    chartConfig: { type: "LINE_TIME_SERIES" },
    schedulerId:
      params.schedulerId ?? `experiments:run-score-numeric:${params.scoreName}`,
    name: params.name ?? `Run: ${params.scoreName}`,
    description:
      params.description ??
      `Average experiment-run score '${params.scoreName}' grouped by experiment`,
  };
}

/**
 * Create widget config for experiment-run-level categorical scores.
 * These scores are attached directly to the experiment run (dataset_run_id).
 * Uses datasetRunId as entity dimension since these scores don't go through events.
 */
export function createCategoricalExperimentRunScoreWidgetConfig(params: {
  scoreName: string;
  schedulerId?: string;
  name?: string;
  description?: string;
}): ExperimentWidgetConfig {
  return {
    view: "scores-categorical",
    dimensions: [{ field: "stringValue" }],
    metrics: [{ measure: "count", agg: "count", aggregation: "count" }],
    timeDimension: null,
    entityDimension: { field: "datasetRunId" },
    orderBy: [{ field: "entity_dimension", direction: "asc" }],
    filters: [
      {
        column: "name",
        operator: "=",
        value: params.scoreName,
        type: "string",
      },
      {
        column: "datasetRunId",
        operator: "is not null",
        value: "",
        type: "null",
      },
    ],
    version: "v2",
    chartType: "BAR_TIME_SERIES",
    chartConfig: { type: "BAR_TIME_SERIES" },
    schedulerId:
      params.schedulerId ??
      `experiments:run-score-categorical:${params.scoreName}`,
    name: params.name ?? `Run: ${params.scoreName}`,
    description:
      params.description ??
      `Categorical experiment-run score counts for '${params.scoreName}' grouped by experiment`,
  };
}
