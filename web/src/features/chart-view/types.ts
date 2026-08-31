import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

/**
 * The "chart view" feature — render the v4 events/observations data as a
 * configurable chart in place, instead of (or alongside) the table. The config
 * spec below is deliberately flat and enum-heavy: cheap to put in the URL, and
 * easy for an LLM to generate (phase 2's "Ask AI → chart"). Happy path only —
 * 1 metric × 1 dimension × 1 standard chart type.
 *
 * The Storybook design harness in `features/chart-view-prototype` renders these
 * same components against mock fixtures; the production wiring (`EventsChartView`)
 * renders them against the real v4 aggregate query.
 */

export type ViewMode = "table" | "chart";

export type MetricKey = "count" | "latency" | "totalCost" | "totalTokens";

export type DimensionKey =
  | "none"
  | "model"
  | "name"
  | "level"
  | "type"
  | "environment";

export type AggregationFn =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "p50"
  | "p95"
  | "p99";

export type TimeGranularity = "minute" | "hour" | "day";

export interface ChartViewConfig {
  metric: MetricKey;
  aggregation: AggregationFn;
  breakdown: DimensionKey;
  chartType: DashboardWidgetChartType;
  timeGranularity: TimeGranularity;
}
