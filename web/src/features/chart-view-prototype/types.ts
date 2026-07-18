// The chart-view config + vocabulary now live in the production feature
// (`features/chart-view`). This prototype is its Storybook design harness, so it
// re-exports those shared types and only adds the mock event row.
export type {
  ChartViewConfig,
  MetricKey,
  DimensionKey,
  AggregationFn,
  TimeGranularity,
  ViewMode,
} from "@/src/features/chart-view/types";

export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
export type ObservationKind = "GENERATION" | "SPAN" | "EVENT";

/**
 * A single mock v4 "event" (observation) row — the harness stand-in for one row
 * of the v4 events read path. The mock aggregator (`lib/aggregate.ts`) turns
 * arrays of these into chart data client-side, the way the production view's
 * server query does. Field names mirror the observations view declaration.
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
