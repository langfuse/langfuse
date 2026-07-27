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
 * Grid steps for the strip's scan bands / sparse time labels, in seconds.
 * Purely presentational; the data granularity comes from
 * {@link pickChartGranularity}.
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

/**
 * The fixed-width `dashboard.executeQuery` granularity presets the strip may
 * request, finest first. All are epoch-aligned in ClickHouse
 * (toStartOfMinute / toStartOfInterval), so client grid math matches the
 * server's buckets. Variable-length tokens (month, toMonday weeks) are
 * excluded on purpose. Finer sub-minute steps need a backend addition —
 * tracked as a follow-up to LFE-14451.
 */
export const OUTLIER_STRIP_GRANULARITIES = [
  { granularity: "minute", stepSeconds: 60 },
  { granularity: "5m", stepSeconds: 300 },
  { granularity: "10m", stepSeconds: 600 },
  { granularity: "15m", stepSeconds: 900 },
  { granularity: "30m", stepSeconds: 1800 },
  { granularity: "1h", stepSeconds: 3600 },
  { granularity: "2h", stepSeconds: 7200 },
  { granularity: "4h", stepSeconds: 14400 },
  { granularity: "1d", stepSeconds: 86400 },
  { granularity: "2d", stepSeconds: 172800 },
  { granularity: "1w", stepSeconds: 604800 },
] as const;

export type OutlierStripGranularity =
  (typeof OUTLIER_STRIP_GRANULARITIES)[number];

/** Never ask the backend for more buckets than this, whatever the width. */
const MAX_STRIP_BUCKETS = 2000;

/**
 * Picks the finest granularity preset that fits the range into the available
 * bar slots ("fit as many bars as possible in the current width"). Falls back
 * to the coarsest preset for extreme range×width combinations — the strip
 * then renders more bars than ideally fit rather than failing.
 */
export function pickChartGranularity(params: {
  rangeMs: number;
  widthPx: number;
  /** Horizontal pixels one bar occupies, gap included. */
  barSlotPx: number;
}): OutlierStripGranularity {
  const rangeSeconds = Math.max(1, params.rangeMs / 1000);
  const maxBars = Math.max(
    1,
    Math.min(Math.floor(params.widthPx / params.barSlotPx), MAX_STRIP_BUCKETS),
  );

  for (const entry of OUTLIER_STRIP_GRANULARITIES) {
    if (Math.ceil(rangeSeconds / entry.stepSeconds) <= maxBars) return entry;
  }

  return OUTLIER_STRIP_GRANULARITIES[OUTLIER_STRIP_GRANULARITIES.length - 1];
}

/**
 * One bucket of max-per-bucket aggregates, mapped from
 * `dashboard.executeQuery` rows (metrics: max totalCost/latency/totalTokens +
 * count over the v2 observations view).
 */
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
