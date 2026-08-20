import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  Hash,
  LineChart,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
  type TimeGranularity,
} from "./types";
import { METRIC_AGGREGATIONS } from "./metricAggregations";

/**
 * The chart-view vocabulary: a trimmed, faithful subset of the real widget
 * vocabulary (`packages/shared/src/features/query/{dataModel,types}.ts`). Each
 * metric/dimension carries the real query identifier (`measure` / `field`) so
 * building the aggregate query is a straight mapping. Pure module — no React,
 * no mock-data coupling — shared by the production view and the Storybook
 * harness.
 */

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** The observations-view measure name this metric aggregates over. */
  measure: string;
  /** Passed through to `formatMetric` so axes/tooltips render units. */
  unit?: "millisecond" | "USD";
  /** Aggregations that make sense for this metric. */
  aggregations: AggregationFn[];
}

export const METRICS: MetricDef[] = [
  {
    key: "count",
    label: "Count",
    measure: "count",
    aggregations: METRIC_AGGREGATIONS.count,
  },
  {
    key: "latency",
    label: "Latency",
    measure: "latency",
    unit: "millisecond",
    aggregations: METRIC_AGGREGATIONS.latency,
  },
  {
    key: "totalCost",
    label: "Cost",
    measure: "totalCost",
    unit: "USD",
    aggregations: METRIC_AGGREGATIONS.totalCost,
  },
  {
    key: "totalTokens",
    label: "Tokens",
    measure: "totalTokens",
    aggregations: METRIC_AGGREGATIONS.totalTokens,
  },
];

export interface DimensionDef {
  key: DimensionKey;
  label: string;
  /** The observations-view dimension field; `null` for "no breakdown". */
  field: string | null;
}

export const DIMENSIONS: DimensionDef[] = [
  { key: "none", label: "Total (no breakdown)", field: null },
  { key: "model", label: "Model", field: "providedModelName" },
  { key: "name", label: "Name", field: "name" },
  { key: "level", label: "Level", field: "level" },
  { key: "type", label: "Type", field: "type" },
  { key: "environment", label: "Environment", field: "environment" },
];

export const AGGREGATION_LABELS: Record<AggregationFn, string> = {
  count: "Count",
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
  p50: "Median (p50)",
  p95: "p95",
  p99: "p99",
};

export interface ChartTypeOption {
  value: DashboardWidgetChartType;
  label: string;
  icon: LucideIcon;
  isTimeSeries: boolean;
}

/**
 * The chart types offered in-view: time series (line/area/bars), categorical
 * (ranked bars / pie), and a single big number. Pivot table and histogram are
 * intentionally left out — pivot overlaps the table side of the toggle, and the
 * happy path is 1 metric × 1 dimension.
 */
export const CHART_TYPES: ChartTypeOption[] = [
  {
    value: "LINE_TIME_SERIES",
    label: "Line",
    icon: LineChart,
    isTimeSeries: true,
  },
  {
    value: "AREA_TIME_SERIES",
    label: "Area",
    icon: AreaChart,
    isTimeSeries: true,
  },
  {
    value: "BAR_TIME_SERIES",
    label: "Bars",
    icon: BarChart3,
    isTimeSeries: true,
  },
  {
    value: "HORIZONTAL_BAR",
    label: "Ranked",
    icon: BarChartHorizontal,
    isTimeSeries: false,
  },
  { value: "PIE", label: "Pie", icon: PieChart, isTimeSeries: false },
  { value: "NUMBER", label: "Number", icon: Hash, isTimeSeries: false },
];

export const getMetric = (key: MetricKey): MetricDef =>
  METRICS.find((m) => m.key === key) ?? METRICS[0];

export const getDimension = (key: DimensionKey): DimensionDef =>
  DIMENSIONS.find((d) => d.key === key) ?? DIMENSIONS[0];

export const getChartType = (
  value: DashboardWidgetChartType,
): ChartTypeOption =>
  CHART_TYPES.find((c) => c.value === value) ?? CHART_TYPES[0];

export const isTimeSeriesChartType = (
  value: DashboardWidgetChartType,
): boolean => getChartType(value).isTimeSeries;

export const GRANULARITIES: TimeGranularity[] = ["minute", "hour", "day"];

/**
 * Coerces a config to a valid, internally-consistent spec. Clamps every field
 * to a known enum member (URL params are untrusted) and resets the aggregation
 * to one the metric supports when the metric changes. The view components and
 * the URL state both round-trip through this, so neither can produce an invalid
 * query.
 */
export const coerceConfig = (config: ChartViewConfig): ChartViewConfig => {
  const metric = getMetric(config.metric);
  const aggregation = metric.aggregations.includes(config.aggregation)
    ? config.aggregation
    : metric.aggregations[0];
  const breakdown = DIMENSIONS.some((d) => d.key === config.breakdown)
    ? config.breakdown
    : "none";
  const chartType = CHART_TYPES.some((c) => c.value === config.chartType)
    ? config.chartType
    : CHART_TYPES[0].value;
  const timeGranularity = GRANULARITIES.includes(config.timeGranularity)
    ? config.timeGranularity
    : "hour";
  return {
    metric: metric.key,
    aggregation,
    breakdown,
    chartType,
    timeGranularity,
  };
};

export const DEFAULT_CONFIG: ChartViewConfig = {
  metric: "count",
  aggregation: "count",
  breakdown: "model",
  chartType: "LINE_TIME_SERIES",
  timeGranularity: "hour",
};

/**
 * Human sentence describing a config — the chart subtitle, and the "here's what
 * I built" confirmation in the Ask-AI flow. Pure label lookup.
 */
export const describeConfig = (config: ChartViewConfig): string => {
  const metric = getMetric(config.metric);
  const metricPart =
    config.metric === "count"
      ? "Count of events"
      : `${AGGREGATION_LABELS[config.aggregation]} ${metric.label.toLowerCase()}`;
  // A big number is a single total — it ignores any breakdown, so don't claim
  // one in the subtitle.
  const byPart =
    config.breakdown === "none" || config.chartType === "NUMBER"
      ? ""
      : ` by ${getDimension(config.breakdown).label.toLowerCase()}`;
  const timePart = isTimeSeriesChartType(config.chartType) ? " over time" : "";
  return `${metricPart}${byPart}${timePart}`;
};
