import { MAX_EVENTS_METRICS_TIME_SERIES_BINS } from "@langfuse/shared";
import {
  compactNumberFormatter,
  latencyFormatter,
  usdFormatter,
} from "@/src/utils/numbers";

/**
 * Preparer layer for the outlier strip (LFE-14451), following the charts
 * manifesto: every decision (step choice, densification, metric extraction,
 * formatting, scale) happens here in pure functions; the SVG visualiser only
 * renders the prepared model.
 */

/**
 * Steps the client may request from `events.metricsTimeSeries`, in seconds.
 * "Nice" boundaries only, capped at 2 days: epoch-aligned week-sized steps
 * start on Thursdays (Unix epoch is a Thursday), which reads as arbitrary.
 * Day-multiples align to UTC midnight.
 */
export const OUTLIER_STRIP_STEP_LADDER_SECONDS = [
  1,
  2,
  5,
  10,
  15,
  30, // seconds
  60,
  120,
  300,
  600,
  900,
  1800, // minutes
  3600,
  7200,
  10800,
  21600,
  43200, // hours
  86400,
  172800, // days
] as const;

const MAX_LADDER_STEP =
  OUTLIER_STRIP_STEP_LADDER_SECONDS[
    OUTLIER_STRIP_STEP_LADDER_SECONDS.length - 1
  ];

/**
 * Picks the finest ladder step that fits the range into the available bar
 * slots ("fit as many bars as possible in the current width"). Falls back to
 * day-multiples beyond the ladder so any range stays under the server's bin
 * cap.
 */
export function pickStepSeconds(params: {
  rangeMs: number;
  widthPx: number;
  /** Horizontal pixels one bar occupies, gap included. */
  barSlotPx: number;
}): number {
  const rangeSeconds = Math.max(1, params.rangeMs / 1000);
  const maxBars = Math.max(
    1,
    Math.min(
      Math.floor(params.widthPx / params.barSlotPx),
      MAX_EVENTS_METRICS_TIME_SERIES_BINS,
    ),
  );

  for (const step of OUTLIER_STRIP_STEP_LADDER_SECONDS) {
    if (Math.ceil(rangeSeconds / step) <= maxBars) return step;
  }

  // Range too wide for the ladder: smallest day-multiple that fits.
  const days = Math.ceil(rangeSeconds / maxBars / 86400);
  return Math.max(days * 86400, MAX_LADDER_STEP);
}

/** One bucket as served by `events.metricsTimeSeries`. */
export type OutlierStripBin = {
  bucketStart: Date;
  count: number;
  maxTotalCost: number | null;
  maxLatencySeconds: number | null;
  maxTotalTokens: number | null;
};

/** One bucket on the dense epoch grid; `bin` is null for empty buckets. */
export type OutlierStripDenseBin = {
  bucketStartMs: number;
  count: number;
  /** Selected metric's max, null = no data in this bucket. */
  value: number | null;
};

export type OutlierStripMetricKey = "cost" | "latency" | "tokens";

export const OUTLIER_STRIP_METRICS: Record<
  OutlierStripMetricKey,
  {
    label: string;
    shortLabel: string;
    valueOf: (bin: OutlierStripBin) => number | null;
    format: (value: number) => string;
  }
> = {
  cost: {
    label: "Cost (max / bucket)",
    shortLabel: "Cost",
    valueOf: (bin) => bin.maxTotalCost,
    format: (value) => usdFormatter(value, 2, value < 0.1 ? 4 : 2),
  },
  latency: {
    label: "Latency (max / bucket)",
    shortLabel: "Latency",
    valueOf: (bin) => bin.maxLatencySeconds,
    format: (value) => latencyFormatter(value * 1000),
  },
  tokens: {
    label: "Tokens (max / bucket)",
    shortLabel: "Tokens",
    valueOf: (bin) => bin.maxTotalTokens,
    format: (value) => compactNumberFormatter(value),
  },
};

/**
 * Densifies server buckets onto the epoch grid covering [fromMs, toMs] and
 * extracts one metric. Uses the same epoch math as ClickHouse's
 * toStartOfInterval (floor(t / step) * step) — never date-library
 * startOfDay/week, which are timezone/Monday-based and would not join the
 * server's buckets.
 */
export function prepareOutlierSeries(params: {
  bins: OutlierStripBin[];
  metric: OutlierStripMetricKey;
  fromMs: number;
  toMs: number;
  stepSeconds: number;
}): {
  dense: OutlierStripDenseBin[];
  /** Max metric value across buckets; 0 when the range has no data. */
  maxValue: number;
} {
  const stepMs = params.stepSeconds * 1000;
  const metric = OUTLIER_STRIP_METRICS[params.metric];

  const byBucketMs = new Map<number, OutlierStripBin>();
  for (const bin of params.bins) {
    byBucketMs.set(bin.bucketStart.getTime(), bin);
  }

  const firstBucketMs = Math.floor(params.fromMs / stepMs) * stepMs;
  const dense: OutlierStripDenseBin[] = [];
  let maxValue = 0;

  for (
    let bucketMs = firstBucketMs;
    bucketMs <= params.toMs;
    bucketMs += stepMs
  ) {
    const bin = byBucketMs.get(bucketMs);
    const value = bin ? metric.valueOf(bin) : null;
    if (value !== null && value > maxValue) maxValue = value;
    dense.push({
      bucketStartMs: bucketMs,
      count: bin?.count ?? 0,
      value,
    });
  }

  return { dense, maxValue };
}
