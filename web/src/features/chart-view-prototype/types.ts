import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
export type ObservationKind = "GENERATION" | "SPAN" | "EVENT";

/**
 * A single mock v4 "event" (observation) row — the prototype stand-in for one
 * row of the v4 events read path. The chart view aggregates arrays of these
 * client-side (see `lib/aggregate.ts`) exactly the way the future v4 aggregate
 * endpoint will server-side, so the prototype previews that contract without a
 * backend. Field names mirror the real observations view declaration
 * (`packages/shared/src/features/query/dataModel.ts`).
 */
export interface PrototypeEvent {
  id: string;
  /** ISO-8601 timestamp. */
  startTime: string;
  type: ObservationKind;
  name: string;
  /** `providedModelName`; null for non-generation events. */
  model: string | null;
  level: ObservationLevel;
  environment: string;
  latencyMs: number;
  /** USD. */
  totalCost: number;
  totalTokens: number;
}

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

/**
 * The full visualization spec for the chart view. Phase 1 makes this
 * URL-driven + reversible; phase 2's "Ask AI" emits exactly this object. Kept
 * deliberately flat and enum-heavy so it is cheap to serialize and easy for an
 * LLM to generate (1 metric × 1 dimension × 1 chart type — the happy path).
 */
export interface ChartViewConfig {
  metric: MetricKey;
  aggregation: AggregationFn;
  breakdown: DimensionKey;
  chartType: DashboardWidgetChartType;
  timeGranularity: TimeGranularity;
}
