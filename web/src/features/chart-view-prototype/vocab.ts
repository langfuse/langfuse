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
  type PrototypeEvent,
} from "./types";

/**
 * The prototype's metric/dimension/aggregation/chart-type vocabulary. This is a
 * deliberately trimmed, faithful subset of the real widget vocabulary
 * (`packages/shared/src/features/query/{dataModel,types}.ts`) — enough to feel
 * real and to make the eventual wiring a straight mapping, without the gnarly
 * long tail (`FilterState`, pivot config, every measure). Pure module: no React,
 * safe to import from both the aggregator and the view components.
 */

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Passed through to `formatMetric` so axes/tooltips render units. */
  unit?: "millisecond" | "USD";
  /**
   * Extracts the numeric value to aggregate from a row. `null` means the metric
   * IS the row count (independent of any field) — the `count` measure.
   */
  valueOf: ((e: PrototypeEvent) => number) | null;
  /** Aggregations that make sense for this metric. */
  aggregations: AggregationFn[];
}

export const METRICS: MetricDef[] = [
  { key: "count", label: "Count", valueOf: null, aggregations: ["count"] },
  {
    key: "latency",
    label: "Latency",
    unit: "millisecond",
    valueOf: (e) => e.latencyMs,
    aggregations: ["avg", "p50", "p95", "p99", "max", "min"],
  },
  {
    key: "totalCost",
    label: "Cost",
    unit: "USD",
    valueOf: (e) => e.totalCost,
    aggregations: ["sum", "avg", "p95", "max"],
  },
  {
    key: "totalTokens",
    label: "Tokens",
    valueOf: (e) => e.totalTokens,
    aggregations: ["sum", "avg", "p95", "max"],
  },
];

export interface DimensionDef {
  key: DimensionKey;
  label: string;
  /** `null` for the "no breakdown" option. */
  valueOf: ((e: PrototypeEvent) => string) | null;
}

export const DIMENSIONS: DimensionDef[] = [
  { key: "none", label: "Total (no breakdown)", valueOf: null },
  { key: "model", label: "Model", valueOf: (e) => e.model ?? "unknown" },
  { key: "name", label: "Name", valueOf: (e) => e.name },
  { key: "level", label: "Level", valueOf: (e) => e.level },
  { key: "type", label: "Type", valueOf: (e) => e.type },
  {
    key: "environment",
    label: "Environment",
    valueOf: (e) => e.environment,
  },
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
 * The chart types offered in-view. A clean representative spread — time series
 * (line/area/bars), categorical (ranked bars / pie), and a single big number.
 * Pivot table and histogram are intentionally left out of the prototype picker:
 * pivot overlaps the table side of the toggle, and the happy path is 1 metric ×
 * 1 dimension.
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

/**
 * Coerces a config to stay internally consistent after a single field changes —
 * e.g. switching metric resets the aggregation to one the metric supports. This
 * is the prototype's stand-in for the validation the URL layer / endpoint will
 * own; keeping it here means the view components never produce an invalid spec.
 */
export const coerceConfig = (config: ChartViewConfig): ChartViewConfig => {
  const metric = getMetric(config.metric);
  const aggregation = metric.aggregations.includes(config.aggregation)
    ? config.aggregation
    : metric.aggregations[0];
  return { ...config, aggregation };
};

export const DEFAULT_CONFIG: ChartViewConfig = {
  metric: "count",
  aggregation: "count",
  breakdown: "model",
  chartType: "LINE_TIME_SERIES",
  timeGranularity: "hour",
};

/**
 * Human sentence describing a config — used as the chart subtitle and as the
 * "here's what I built" confirmation in the Ask-AI flow. Pure label lookup.
 */
export const describeConfig = (config: ChartViewConfig): string => {
  const metric = getMetric(config.metric);
  const metricPart =
    config.metric === "count"
      ? "Count of events"
      : `${AGGREGATION_LABELS[config.aggregation]} ${metric.label.toLowerCase()}`;
  const byPart =
    config.breakdown === "none"
      ? ""
      : ` by ${getDimension(config.breakdown).label.toLowerCase()}`;
  const timePart = isTimeSeriesChartType(config.chartType) ? " over time" : "";
  return `${metricPart}${byPart}${timePart}`;
};
