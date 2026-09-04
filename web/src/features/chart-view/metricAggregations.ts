import { type AggregationFn, type MetricKey } from "./types";

/**
 * Per-metric allowed aggregations — the single source of truth shared by the
 * vocab (UI pickers + `coerceConfig`) and the Ask-AI prompt. Keeping one map
 * means the LLM is never taught a `(metric, aggregation)` combination the chart
 * can't honour (which `coerceConfig` would otherwise silently demote). Pure
 * module: no React / `lucide`, so it is safe to import server-side.
 *
 * `count` is the row count and only ever uses `count`; the numeric metrics use
 * the subset that makes sense for their type (latency has no `sum`; cost/tokens
 * skip `min`/`p50`/`p99`).
 */
export const METRIC_AGGREGATIONS: Record<MetricKey, AggregationFn[]> = {
  count: ["count"],
  latency: ["avg", "p50", "p95", "p99", "max", "min"],
  totalCost: ["sum", "avg", "p95", "max"],
  totalTokens: ["sum", "avg", "p95", "max"],
};
