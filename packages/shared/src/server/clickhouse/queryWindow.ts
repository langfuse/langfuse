const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

/** queryWindowBounds lists the inclusive upper bound of each bounded bucket, smallest first. */
const queryWindowBounds = [
  ["1h", hourMs],
  ["1d", dayMs],
  ["7d", 7 * dayMs],
  ["30d", 30 * dayMs],
  ["90d", 90 * dayMs],
  ["180d", 180 * dayMs],
  ["1y", 365 * dayMs],
] as const;

/** queryWindowNone labels a query or evaluation without a structured time range. */
export const queryWindowNone = "none" satisfies QueryWindow;

/** queryWindowFromRange buckets the span between two timestamps; unparsable timestamps are `none`. */
export function queryWindowFromRange(
  fromTimestamp: string | Date,
  toTimestamp: string | Date,
): QueryWindow {
  return queryWindowFromMs(
    new Date(toTimestamp).getTime() - new Date(fromTimestamp).getTime(),
  );
}

/** queryWindowFromMs labels a span with the first bucket it fits in; a non-finite or negative span is `none`. */
export function queryWindowFromMs(spanMs: number): QueryWindow {
  if (!Number.isFinite(spanMs) || spanMs < 0) return queryWindowNone;
  for (const [label, bound] of queryWindowBounds) {
    if (spanMs <= bound) return label;
  }
  return "gt_1y";
}

/** QueryWindow is the bounded time-range label of latency metrics. */
export type QueryWindow =
  | (typeof queryWindowBounds)[number][0]
  | "gt_1y"
  | "none";
