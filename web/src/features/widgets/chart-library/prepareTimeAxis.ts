/**
 * PREPARER LAYER — time axis.
 *
 * One source of truth for turning raw time-bucket values into presentable axis
 * + tooltip labels. The visualiser (chart components) renders whatever this
 * returns and makes no formatting decisions of its own. Data → preparer →
 * visualiser, one way. (LFE-10549)
 *
 * It is deliberately data-adaptive: the bucket granularity is *inferred from the
 * data itself* (median spacing between buckets), so the same code handles any
 * time range or scale — minute buckets over an hour, hourly over a day, daily
 * over a quarter — without being told the granularity up front.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 28 * DAY;

/**
 * Parse a raw bucket value (epoch ms, epoch string, ISO, or a "YYYY-MM-DD
 * HH:MM:SS" ClickHouse datetime) into a Date. Values without an explicit
 * timezone are treated as UTC, because the buckets come back UTC-aligned —
 * parsing them as local is what produced wrong dates.
 */
export function parseChartTimestamp(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;
  if (/^\d+$/.test(s)) return new Date(Number(s));

  const match = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (match) {
    const [, y, mo, d, h, mi, se, tz] = match;
    if (tz) {
      const parsed = new Date(s.replace(" ", "T"));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    // No timezone → interpret as UTC (the buckets are UTC-aligned).
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, se ? +se : 0));
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Median spacing between sorted buckets — the inferred bucket size in ms. */
function inferBucketMs(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff > 0) diffs.push(diff);
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export type TimeAxisFormatters = {
  /** Compact label for an x-axis tick (granularity-aware). */
  formatTick: (raw: unknown) => string;
  /** Fuller label for the hover tooltip (always carries the date + year). */
  formatTooltip: (raw: unknown) => string;
  /** Inferred bucket size in ms (0 when it can't be inferred). */
  bucketMs: number;
};

/**
 * Build the axis + tooltip time formatters for a set of raw bucket values.
 * Call once per chart with all its bucket values; the chart applies the
 * returned formatters and decides nothing about time formatting itself.
 */
export function prepareTimeAxis(rawValues: unknown[]): TimeAxisFormatters {
  const timestamps: number[] = [];
  for (const value of rawValues) {
    const date = parseChartTimestamp(value);
    if (date) timestamps.push(date.getTime());
  }
  const bucketMs = inferBucketMs(timestamps);

  const dateOnly = bucketMs >= DAY;
  const monthly = bucketMs >= MONTH;
  const subHour = bucketMs > 0 && bucketMs < HOUR;

  const formatTick = (raw: unknown): string => {
    const date = parseChartTimestamp(raw);
    if (!date) return typeof raw === "string" ? raw : "";
    if (monthly) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }
    if (dateOnly) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
    const datePart = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      ...(subHour ? { minute: "2-digit" } : {}),
    });
    return `${datePart}, ${timePart}`;
  };

  const formatTooltip = (raw: unknown): string => {
    const date = parseChartTimestamp(raw);
    if (!date) return typeof raw === "string" ? raw : "";
    if (dateOnly) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return { formatTick, formatTooltip, bucketMs };
}
