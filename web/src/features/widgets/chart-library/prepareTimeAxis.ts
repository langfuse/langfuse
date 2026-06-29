/**
 * PREPARER LAYER — time axis.
 *
 * One source of truth for the time x-axis: from the raw bucket values it decides
 * the *scale-appropriate* label format AND the tick placement, and hands the
 * visualiser ready-to-use formatters + a tick interval. The visualiser renders
 * them and decides nothing. Data → preparer → visualiser, one way. (LFE-10549)
 *
 * Scale rule (one unit per scale — never "date, time" on every tick):
 * - intraday span  → show TIME only            ("2 PM", "2:30 PM")
 * - multi-day span → show DATES, day-aligned    ("Jun 28", "Jul 2", …) at an
 *                    even number-of-days step so the gaps are identical
 * - very long span → show MONTHS                ("Jun 2026")
 * The exact date+time always lives in the tooltip, so nothing is lost.
 */

import { getEvenTickInterval } from "@/src/features/widgets/chart-library/utils";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Below this total span we're "zoomed into a day" → time-only ticks. */
const TIME_SCALE_MAX = 2 * DAY;
/** Above this total span we switch from day labels to month labels. */
const MONTH_SCALE_MIN = 180 * DAY;

type AxisMode = "time" | "date" | "month";

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

export type TimeAxis = {
  /** recharts numeric x-axis `interval` (ticks skipped between shown ticks). */
  interval: number;
  /** Scale-appropriate label for a shown tick. */
  formatTick: (raw: unknown) => string;
  /** Fuller label for the tooltip (always date + year, time when intraday). */
  formatTooltip: (raw: unknown) => string;
  mode: AxisMode;
};

/**
 * Decide the time-axis format + tick spacing for a set of raw bucket values.
 * `maxTicks` is how many labels fit the chart's measured width.
 */
export function prepareTimeAxis(rawValues: unknown[], maxTicks = 6): TimeAxis {
  const timestamps: number[] = [];
  for (const value of rawValues) {
    const date = parseChartTimestamp(value);
    if (date) timestamps.push(date.getTime());
  }
  const count = timestamps.length;
  const bucketMs = inferBucketMs(timestamps);
  const span =
    count >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;

  const mode: AxisMode =
    span > 0 && span <= TIME_SCALE_MAX
      ? "time"
      : span >= MONTH_SCALE_MIN
        ? "month"
        : "date";

  const target = Math.max(2, maxTicks);
  let interval: number;
  if (mode === "time" || mode === "month") {
    // Evenly spaced by bucket index.
    interval = getEvenTickInterval(count, target);
  } else {
    // Date mode: align ticks to a whole number of days so each shown tick is a
    // distinct day at the same time-of-day — identical gaps, no repeated dates.
    const bucketsPerDay =
      bucketMs > 0 ? Math.max(1, Math.round(DAY / bucketMs)) : 1;
    const dayCount = Math.max(1, Math.round(count / bucketsPerDay));
    const dayStep = Math.max(1, Math.ceil(dayCount / target));
    interval = bucketsPerDay * dayStep - 1;
  }

  const subHour = bucketMs > 0 && bucketMs < HOUR;

  const formatTick = (raw: unknown): string => {
    const date = parseChartTimestamp(raw);
    if (!date) return typeof raw === "string" ? raw : "";
    if (mode === "time") {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        ...(subHour ? { minute: "2-digit" } : {}),
      });
    }
    if (mode === "month") {
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatTooltip = (raw: unknown): string => {
    const date = parseChartTimestamp(raw);
    if (!date) return typeof raw === "string" ? raw : "";
    if (mode === "time") {
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return { interval, formatTick, formatTooltip, mode };
}
