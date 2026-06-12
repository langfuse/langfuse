/**
 * Percentile / quantile aggregation for the GreptimeDB read path (04-read-path.md, P0b) — replaces
 * ClickHouse `quantile(p)(x)`.
 *
 * GreptimeDB has no direct `quantile` aggregate; it provides the UDDSketch approximate-quantile
 * functions: build a sketch state with `uddsketch_state(bucket_size, error, x)` then read a
 * percentile with `uddsketch_calc(p, state)`. `p` is in [0, 1].
 *
 * Defaults: 128 buckets, 0.01 relative error — the GreptimeDB doc baseline, accurate enough for the
 * dashboard latency/cost percentiles (p50/p75/p90/p95/p99) while staying compact.
 */

export const UDDSKETCH_BUCKETS = 128;
export const UDDSKETCH_ERROR = 0.01;

/**
 * Quantile aggregation expression over a value expression, e.g.
 * `greptimeQuantile(0.99, "date_diff('millisecond', start_time, end_time)")`.
 */
export const greptimeQuantile = (p: number, valueExpr: string): string => {
  if (p < 0 || p > 1) throw new Error(`quantile p must be in [0, 1], got ${p}`);
  return `uddsketch_calc(${p}, uddsketch_state(${UDDSKETCH_BUCKETS}, ${UDDSKETCH_ERROR}, ${valueExpr}))`;
};

/** Named dashboard percentiles -> p value. */
export const PERCENTILE_P: Record<
  "p50" | "p75" | "p90" | "p95" | "p99",
  number
> = {
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};
