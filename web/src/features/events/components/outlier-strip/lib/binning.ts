import { format } from "date-fns";
import { latencyFormatter, usdFormatter } from "@/src/utils/numbers";
import { parseChartTimestamp } from "@/src/features/widgets/chart-library/prepareTimeAxis";

/**
 * Preparer layer for the outlier strip (LFE-14451), following the charts
 * manifesto: every decision (step choice, densification, metric extraction,
 * tick placement, formatting, scale inputs) happens here in pure functions;
 * the SVG visualiser only renders the prepared model.
 *
 * The METRIC REGISTRY is the single source of truth for what the strip can
 * plot: each aggregation option declares its executeQuery aggregation once,
 * and the query metrics, result-column extraction, dropdown options, and
 * labels are all DERIVED from it — a new option is one line, and cannot be
 * half-wired (the class of bug where a switch changed the label but not the
 * data).
 */

/**
 * Grid steps for the strip's sparse gridline ticks, in seconds. Purely
 * presentational; the data granularity comes from {@link pickChartGranularity}.
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
/** Densification guard: even the coarsest preset on an URL-injected absurd
 * custom range must not build an unbounded client-side array. */
const MAX_DENSE_BINS = 4000;
/** Minimum horizontal pixels between gridline ticks / labels. */
const TICK_MIN_SPACING_PX = 110;

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

// ---------------------------------------------------------------------------
// Metric registry
// ---------------------------------------------------------------------------

export type OutlierStripMetricKey = "cost" | "latency";
export type OutlierStripLatencyAgg = "p95" | "p50";
export type OutlierStripCostAgg = "sum";
export type OutlierStripAggKey = OutlierStripLatencyAgg | OutlierStripCostAgg;

type AggregationDef = {
  /** The user-facing option key (currently 1:1 with the query aggregation). */
  key: OutlierStripAggKey;
  /** The executeQuery aggregation this option lowers to. */
  queryAggregation: "sum" | "p95" | "p50";
};

export type OutlierStripMetricDef = {
  shortLabel: string;
  /** First entry is the default. */
  aggregations: readonly AggregationDef[];
  /** The executeQuery measure name on the v2 observations view. */
  measure: string;
  /** Raw result value → plotted unit (e.g. latency ms → s). */
  fromRaw: (raw: number) => number;
  format: (value: number) => string;
};

export const OUTLIER_STRIP_METRICS: Record<
  OutlierStripMetricKey,
  OutlierStripMetricDef
> = {
  cost: {
    shortLabel: "Cost",
    measure: "totalCost",
    aggregations: [{ key: "sum", queryAggregation: "sum" }],
    fromRaw: (raw) => raw,
    format: (value) =>
      usdFormatter(value, 2, value < 0.001 ? 6 : value < 0.1 ? 4 : 2),
  },
  latency: {
    shortLabel: "Latency",
    measure: "latency",
    aggregations: [
      { key: "p95", queryAggregation: "p95" },
      { key: "p50", queryAggregation: "p50" },
    ],
    fromRaw: (raw) => raw / 1000, // executeQuery latency is in ms
    format: (value) => latencyFormatter(value * 1000),
  },
};

/** executeQuery result column for a (measure, aggregation) pair. */
export const outlierStripResultColumn = (
  measure: string,
  queryAggregation: string,
): string => `${queryAggregation}_${measure}`;

/**
 * The executeQuery `metrics` array — derived from the registry so every
 * registered aggregation option is fetched in the one shared scan.
 */
export const outlierStripQueryMetrics = (): {
  measure: string;
  aggregation: "count" | AggregationDef["queryAggregation"];
}[] => [
  { measure: "count", aggregation: "count" },
  ...Object.values(OUTLIER_STRIP_METRICS).flatMap((def) =>
    def.aggregations.map((agg) => ({
      measure: def.measure,
      aggregation: agg.queryAggregation,
    })),
  ),
];

/** Resolves an aggregation option, falling back to the metric's default. */
export const resolveAggregation = (
  metric: OutlierStripMetricKey,
  aggregation: string | undefined,
): AggregationDef => {
  const def = OUTLIER_STRIP_METRICS[metric];
  return (
    def.aggregations.find((agg) => agg.key === aggregation) ??
    def.aggregations[0]
  );
};

// ---------------------------------------------------------------------------
// Row → bin mapping
// ---------------------------------------------------------------------------

/** One executeQuery row; metric columns are looked up via the registry. */
export type OutlierQueryRow = Record<string, unknown> & {
  time_dimension?: string;
  count_count?: unknown;
};

/**
 * One bucket of aggregates. `values` is keyed by result column
 * ({@link outlierStripResultColumn}), holding RAW query values (unit mapping
 * happens at extraction via the registry's `fromRaw`).
 */
export type OutlierStripBin = {
  bucketStart: Date;
  count: number;
  values: Record<string, number | null>;
};

const toNumberOrNull = (raw: unknown): number | null =>
  raw === null || raw === undefined ? null : Number(raw);

/**
 * Maps executeQuery rows to strip bins.
 *
 * WITH FILL rows (count 0) are dropped rather than mapped: ClickHouse fills
 * non-nullable measures with type DEFAULTS (e.g. tokens UInt64 → 0) while
 * nullable ones fill as null — mapping those rows would draw a phantom
 * baseline across every empty bucket. The client densifies empty buckets to
 * honest nulls anyway.
 */
export const rowsToOutlierBins = (rows: OutlierQueryRow[]): OutlierStripBin[] =>
  rows.flatMap((row) => {
    const bucketStart = parseChartTimestamp(row.time_dimension);
    const count = Number(row.count_count ?? 0);
    if (!bucketStart || count === 0) return [];
    const values: Record<string, number | null> = {};
    for (const def of Object.values(OUTLIER_STRIP_METRICS)) {
      for (const agg of def.aggregations) {
        const column = outlierStripResultColumn(
          def.measure,
          agg.queryAggregation,
        );
        values[column] = toNumberOrNull(row[column]);
      }
    }
    return [{ bucketStart, count, values }];
  });

// ---------------------------------------------------------------------------
// Series preparation (densify + ticks)
// ---------------------------------------------------------------------------

/** One bucket on the dense grid; `value` null = no data in this bucket. */
export type OutlierStripDenseBin = {
  bucketStartMs: number;
  count: number;
  value: number | null;
};

/** A prepared gridline tick: dense-bin index + presentation-ready label. */
export type OutlierStripTick = { index: number; label: string };

/** A bucket's tooltip time range, day-scale buckets without the time part. */
export const formatBucketRange = (fromMs: number, stepMs: number): string => {
  const from = new Date(fromMs);
  const to = new Date(fromMs + stepMs);
  const dayPattern = stepMs >= 86_400_000 ? "MMM d" : "MMM d, HH:mm:ss";
  return `${format(from, dayPattern)} – ${format(to, stepMs >= 86_400_000 ? "MMM d" : "HH:mm:ss")}`;
};

/**
 * Smallest "nice" tick step at least `minPx` wide at the current bar slot.
 * Ticks must be MULTIPLES of the bucket step — placement subtracts the grid
 * phase and tests a modulo, and a non-multiple would place ticks irregularly.
 */
const pickTickStepMs = (
  stepMs: number,
  slotPx: number,
  minPx: number,
): number => {
  for (const step of OUTLIER_STRIP_STEP_LADDER_SECONDS) {
    const tickMs = step * 1000;
    if (tickMs % stepMs === 0 && (tickMs / stepMs) * slotPx >= minPx) {
      return tickMs;
    }
  }
  // Every k-th bucket, k sized to the pixel budget — aligned by construction.
  return Math.max(1, Math.ceil(minPx / slotPx)) * stepMs;
};

/**
 * Densifies server buckets onto the bucket grid covering [fromMs, toMs),
 * extracts one metric/aggregation via the registry, and places gridline
 * ticks. Grid math uses the same epoch arithmetic as ClickHouse's
 * toStartOfInterval — never date-library startOfDay/week — and snaps its
 * PHASE to the server's returned buckets, so a self-hosted non-UTC ClickHouse
 * yields a shifted-but-correct chart instead of a blank one.
 */
export function prepareOutlierSeries(params: {
  bins: OutlierStripBin[];
  metric: OutlierStripMetricKey;
  /** Aggregation option key; invalid values fall back to the metric default. */
  aggregation?: string;
  fromMs: number;
  toMs: number;
  stepSeconds: number;
  /** Plot width; drives tick spacing. 0/absent = no ticks (tests). */
  widthPx?: number;
}): {
  dense: OutlierStripDenseBin[];
  /** Max metric value across buckets; 0 when the range has no data. */
  maxValue: number;
  ticks: OutlierStripTick[];
} {
  const stepMs = params.stepSeconds * 1000;
  const def = OUTLIER_STRIP_METRICS[params.metric];
  const agg = resolveAggregation(params.metric, params.aggregation);
  const column = outlierStripResultColumn(def.measure, agg.queryAggregation);

  const byBucketMs = new Map<number, OutlierStripBin>();
  for (const bin of params.bins) {
    byBucketMs.set(bin.bucketStart.getTime(), bin);
  }

  // Snap the grid's phase to the server's buckets (non-UTC ClickHouse aligns
  // day+ buckets to its own timezone; a phase-0 grid would miss every bucket).
  const phase =
    params.bins.length > 0
      ? ((params.bins[0].bucketStart.getTime() % stepMs) + stepMs) % stepMs
      : 0;
  const firstBucketMs =
    Math.floor((params.fromMs - phase) / stepMs) * stepMs + phase;
  const dense: OutlierStripDenseBin[] = [];
  let maxValue = 0;

  for (
    let bucketMs = firstBucketMs;
    // Exclusive: a `to` exactly on a boundary must not add a trailing bucket
    // that covers zero time. MAX_DENSE_BINS guards URL-injected absurd ranges.
    bucketMs < params.toMs && dense.length < MAX_DENSE_BINS;
    bucketMs += stepMs
  ) {
    const bin = byBucketMs.get(bucketMs);
    const raw = bin ? (bin.values[column] ?? null) : null;
    const value = raw === null ? null : def.fromRaw(raw);
    if (value !== null && value > maxValue) maxValue = value;
    dense.push({
      bucketStartMs: bucketMs,
      count: bin?.count ?? 0,
      value,
    });
  }

  // Gridline ticks — phase-aware, presentation-ready labels.
  const ticks: OutlierStripTick[] = [];
  if (params.widthPx && params.widthPx > 0 && dense.length > 0) {
    const slotPx = params.widthPx / dense.length;
    const tickStepMs = pickTickStepMs(stepMs, slotPx, TICK_MIN_SPACING_PX);
    for (let i = 1; i < dense.length; i++) {
      if ((dense[i].bucketStartMs - phase) % tickStepMs === 0) {
        ticks.push({
          index: i,
          label: format(
            new Date(dense[i].bucketStartMs),
            tickStepMs >= 86_400_000 ? "MMM d" : "HH:mm",
          ),
        });
      }
    }
  }

  return { dense, maxValue, ticks };
}
