// Re-export the production chart-view vocabulary (labels, query mappings,
// coerceConfig, describeConfig, chart types, …) so the harness and its tests
// use the exact same source of truth as the real view.
export * from "@/src/features/chart-view/vocab";

import {
  type DimensionKey,
  type MetricKey,
  type PrototypeEvent,
} from "./types";

/**
 * Mock-only value extractors that pull the metric/dimension value out of a
 * {@link PrototypeEvent}. Production reads these from ClickHouse via the
 * observations view; the harness extracts them client-side. `null` metric =
 * the row count (the `count` measure); `null` dimension = "no breakdown".
 */
export const METRIC_EXTRACTORS: Record<
  MetricKey,
  ((e: PrototypeEvent) => number) | null
> = {
  count: null,
  latency: (e) => e.latencyMs,
  totalCost: (e) => e.totalCost,
  totalTokens: (e) => e.totalTokens,
};

export const DIMENSION_EXTRACTORS: Record<
  DimensionKey,
  ((e: PrototypeEvent) => string) | null
> = {
  none: null,
  model: (e) => e.model ?? "unknown",
  name: (e) => e.name,
  level: (e) => e.level,
  type: (e) => e.type,
  environment: (e) => e.environment,
};
