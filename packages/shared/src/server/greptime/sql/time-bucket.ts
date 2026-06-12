/**
 * Time bucketing for the GreptimeDB read path (04-read-path.md, P0b) — replaces ClickHouse's
 * `toStartOf*` / `toStartOfInterval`.
 *
 *   - Calendar granularities (minute/hour/day/week/month) -> `date_trunc('<unit>', col)`. Verified:
 *     week truncates to Monday (matches CH `toMonday`), month to the 1st.
 *   - Fixed monitor granularities (5m..1w) -> `date_bin('<n> <unit>'::INTERVAL, col)`, epoch-aligned
 *     (matches CH `toStartOfInterval`, which also aligns to the epoch rather than the range start).
 *
 * Pure string builders; no DB access.
 */

export type Granularity =
  | "auto"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1d"
  | "2d"
  | "1w";

type Bucket =
  | { kind: "trunc"; unit: "minute" | "hour" | "day" | "week" | "month" }
  | { kind: "bin"; interval: string };

const BUCKET: Record<Exclude<Granularity, "auto">, Bucket> = {
  minute: { kind: "trunc", unit: "minute" },
  hour: { kind: "trunc", unit: "hour" },
  day: { kind: "trunc", unit: "day" },
  week: { kind: "trunc", unit: "week" },
  month: { kind: "trunc", unit: "month" },
  "5m": { kind: "bin", interval: "5 minutes" },
  "10m": { kind: "bin", interval: "10 minutes" },
  "15m": { kind: "bin", interval: "15 minutes" },
  "30m": { kind: "bin", interval: "30 minutes" },
  "1h": { kind: "bin", interval: "1 hour" },
  "2h": { kind: "bin", interval: "2 hours" },
  "4h": { kind: "bin", interval: "4 hours" },
  "1d": { kind: "bin", interval: "1 day" },
  "2d": { kind: "bin", interval: "2 days" },
  "1w": { kind: "bin", interval: "1 week" },
};

/** The `INTERVAL` literal a granularity steps by (gap-fill step / fixed bucket width). */
export const GRANULARITY_STEP: Record<Exclude<Granularity, "auto">, string> = {
  minute: "1 minute",
  hour: "1 hour",
  day: "1 day",
  week: "1 week",
  month: "1 month",
  "5m": "5 minutes",
  "10m": "10 minutes",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1h": "1 hour",
  "2h": "2 hours",
  "4h": "4 hours",
  "1d": "1 day",
  "2d": "2 days",
  "1w": "1 week",
};

/**
 * Resolve `auto` to a calendar granularity from the query window. Mirrors the ClickHouse query
 * builder's thresholds (web `features/query`): <2h minute, <3d hour, <60d day, <1y week, else month.
 */
export const resolveAutoGranularity = (
  fromMs: number,
  toMs: number,
): Exclude<
  Granularity,
  | "auto"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1d"
  | "2d"
  | "1w"
> => {
  const hours = (toMs - fromMs) / 3_600_000;
  if (hours < 2) return "minute";
  if (hours < 72) return "hour";
  if (hours < 1440) return "day";
  if (hours < 8760) return "week";
  return "month";
};

/** Bucket expression for a (quoted) timestamp column reference. */
export const greptimeTimeBucket = (
  granularity: Exclude<Granularity, "auto">,
  colRef: string,
): string => {
  const b = BUCKET[granularity];
  return b.kind === "trunc"
    ? `date_trunc('${b.unit}', ${colRef})`
    : `date_bin('${b.interval}'::INTERVAL, ${colRef})`;
};
