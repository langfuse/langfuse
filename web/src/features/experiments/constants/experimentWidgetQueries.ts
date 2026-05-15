import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type ViewVersion,
  type metricAggregations,
} from "@/src/features/query";
import { type z } from "zod";
import {
  type WidgetMetricConfig,
  type WidgetDimensionConfig,
} from "@/src/features/widgets/components/InlineWidget";
import { type WidgetChartConfig } from "@/src/features/widgets/utils";

type MetricAggregation = z.infer<typeof metricAggregations>;

type ExperimentWidgetConfig = {
  // Query fields
  view: "observations";
  dimensions: WidgetDimensionConfig[];
  metrics: (WidgetMetricConfig & { aggregation: MetricAggregation })[];
  timeDimension: null;
  entityDimension: { field: string };
  orderBy: { field: string; direction: "asc" | "desc" }[];
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
