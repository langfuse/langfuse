const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Upper bounds (inclusive) of the bounded query-window buckets, smallest first.
 * A span is labelled with the first bucket it fits in, so a 10-day range is
 * `30d`. A span beyond the last bound is `gt_1y`.
 */
const QUERY_WINDOW_BOUNDS = [
  ["1h", HOUR_MS],
  ["1d", DAY_MS],
  ["7d", 7 * DAY_MS],
  ["30d", 30 * DAY_MS],
  ["90d", 90 * DAY_MS],
  ["180d", 180 * DAY_MS],
  ["1y", 365 * DAY_MS],
] as const;

/**
 * Bounded time-range label for latency metrics. `none` marks a query or
 * evaluation without a structured time range, so a breakdown by window still
 * adds up to the total.
 */
export type QueryWindow =
  | (typeof QUERY_WINDOW_BOUNDS)[number][0]
  | "gt_1y"
  | "none";

export const QUERY_WINDOW_NONE = "none" satisfies QueryWindow;

/**
 * Buckets a time-range span in milliseconds. A span that is not a finite,
 * non-negative number is `none`.
 */
export function queryWindowFromMs(spanMs: number): QueryWindow {
  if (!Number.isFinite(spanMs) || spanMs < 0) return QUERY_WINDOW_NONE;
  for (const [label, bound] of QUERY_WINDOW_BOUNDS) {
    if (spanMs <= bound) return label;
  }
  return "gt_1y";
}

/** Buckets the span between two timestamps; unparsable timestamps are `none`. */
export function queryWindowFromRange(
  fromTimestamp: string | Date,
  toTimestamp: string | Date,
): QueryWindow {
  return queryWindowFromMs(
    new Date(toTimestamp).getTime() - new Date(fromTimestamp).getTime(),
  );
}
