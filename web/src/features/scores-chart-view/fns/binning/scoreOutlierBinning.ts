import { format } from "date-fns";
import {
  OUTLIER_STRIP_STEP_LADDER_SECONDS,
  outlierStripResultColumn,
} from "@/src/features/events/components/outlier-strip/lib/binning";
import { parseChartTimestamp } from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { SCORE_OUTLIER_STRIP_METRICS } from "@/src/features/scores-chart-view/constants/scoreOutlierStripMetrics";
import {
  type ScoreOutlierBin,
  type ScoreOutlierDenseBin,
  type ScoreOutlierMetricKey,
  type ScoreOutlierQueryRow,
  type ScoreOutlierTick,
  type ScoreOutlierYTick,
} from "@/src/features/scores-chart-view/types";

/**
 * The outlier strip's ("Pulse") binning math — one module because every
 * function here operates on the same bin/row shapes and only the strip
 * container (`ScoresOutlierStrip`) calls them, always together in the same
 * pipeline: rows → bins → merged bins → dense series → ticks.
 */

// ---------------------------------------------------------------------------
// Query metrics
// ---------------------------------------------------------------------------

type ScoreOutlierQueryMetric = {
  measure: string;
  aggregation: "count" | "avg" | "min" | "max";
};

const queryMetricsFor = (
  metric: ScoreOutlierMetricKey,
): ScoreOutlierQueryMetric[] => {
  const def = SCORE_OUTLIER_STRIP_METRICS[metric];
  return def.aggregations.map((agg) => ({
    measure: def.measure,
    aggregation: agg.queryAggregation,
  }));
};

/** "Count" mode's executeQuery `metrics`, against the count-only `scores-listable-count` view. */
export const scoreOutlierCountQueryMetrics = (): ScoreOutlierQueryMetric[] =>
  queryMetricsFor("count");

/** "Value" mode's executeQuery `metrics`, against the unchanged `scores-numeric` view. */
export const scoreOutlierValueQueryMetrics = (): ScoreOutlierQueryMetric[] =>
  queryMetricsFor("value");

/** Resolves an aggregation option, falling back to the metric's default. */
export const resolveScoreOutlierAggregation = (
  metric: ScoreOutlierMetricKey,
  aggregation: string | undefined,
) => {
  const def = SCORE_OUTLIER_STRIP_METRICS[metric];
  return (
    def.aggregations.find((agg) => agg.key === aggregation) ??
    def.aggregations[0]
  );
};

// ---------------------------------------------------------------------------
// Rows → bins
// ---------------------------------------------------------------------------

const toNumberOrNull = (raw: unknown): number | null =>
  raw === null || raw === undefined ? null : Number(raw);

/**
 * Maps executeQuery rows to strip bins. Mirrors the observations strip's
 * `rowsToOutlierBins`: a WITH FILL row (count 0) is dropped rather than
 * mapped, since the client densifies empty buckets to honest nulls anyway.
 */
export const rowsToScoreOutlierBins = (
  rows: ScoreOutlierQueryRow[],
): ScoreOutlierBin[] =>
  rows.flatMap((row) => {
    const bucketStart = parseChartTimestamp(row.time_dimension);
    const count = Number(row.count_count ?? 0);
    if (!bucketStart || count === 0) return [];
    const values: Record<string, number | null> = {};
    for (const def of Object.values(SCORE_OUTLIER_STRIP_METRICS)) {
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

/**
 * Combines the count query's rows with the value query's rows, keyed by
 * time bucket. `count_count` always comes from the count rows; value
 * columns are layered on top where present — no summing involved.
 */
export const mergeScoreOutlierRows = (
  countRows: ScoreOutlierQueryRow[],
  valueRows: ScoreOutlierQueryRow[],
): ScoreOutlierQueryRow[] => {
  const rowsByTimestamp = new Map<string, ScoreOutlierQueryRow>();

  for (const row of countRows) {
    if (typeof row.time_dimension === "string") {
      rowsByTimestamp.set(row.time_dimension, { ...row });
    }
  }

  for (const row of valueRows) {
    if (typeof row.time_dimension !== "string") continue;

    // Count rows are the only source of truth for which buckets exist; a
    // value row with no matching count bucket is dropped, not invented.
    const existing = rowsByTimestamp.get(row.time_dimension);
    if (existing) {
      Object.assign(existing, row);
    }
  }

  return [...rowsByTimestamp.values()].sort((a, b) =>
    String(a.time_dimension).localeCompare(String(b.time_dimension)),
  );
};

// ---------------------------------------------------------------------------
// Bins → dense series + gridline ticks
// ---------------------------------------------------------------------------

/** Even the coarsest preset on an URL-injected absurd custom range must not
 *  build an unbounded client-side array. */
const MAX_DENSE_BINS = 4000;
/** Minimum horizontal pixels between gridline ticks / labels. */
const TICK_MIN_SPACING_PX = 110;

/**
 * Smallest "nice" tick step at least `minPx` wide at the current bar slot.
 * Ticks must be MULTIPLES of the bucket step — mirrors the observations
 * strip's private `pickTickStepMs`.
 */
function pickScoreOutlierTickStepMs(
  stepMs: number,
  slotPx: number,
  minPx: number,
): number {
  for (const step of OUTLIER_STRIP_STEP_LADDER_SECONDS) {
    const tickMs = step * 1000;
    if (tickMs % stepMs === 0 && (tickMs / stepMs) * slotPx >= minPx) {
      return tickMs;
    }
  }
  return Math.max(1, Math.ceil(minPx / slotPx)) * stepMs;
}

/**
 * Densifies server buckets onto the bucket grid covering [fromMs, toMs),
 * extracts one metric/aggregation via the registry, and places gridline
 * ticks. Mirrors the observations strip's `prepareOutlierSeries` — same grid
 * math (phase-snapped to the server's own buckets), same densification.
 */
export function prepareScoreOutlierSeries(params: {
  bins: ScoreOutlierBin[];
  metric: ScoreOutlierMetricKey;
  /** Aggregation option key; invalid values fall back to the metric default. */
  aggregation?: string;
  fromMs: number;
  toMs: number;
  stepSeconds: number;
  /** Plot width; drives tick spacing. 0/absent = no ticks (tests). */
  widthPx?: number;
}): {
  dense: ScoreOutlierDenseBin[];
  /** Max metric value across buckets; 0 when the range has no data. */
  maxValue: number;
  ticks: ScoreOutlierTick[];
} {
  const stepMs = params.stepSeconds * 1000;
  const def = SCORE_OUTLIER_STRIP_METRICS[params.metric];
  const agg = resolveScoreOutlierAggregation(params.metric, params.aggregation);
  const column = outlierStripResultColumn(def.measure, agg.queryAggregation);

  const byBucketMs = new Map<number, ScoreOutlierBin>();
  for (const bin of params.bins) {
    byBucketMs.set(bin.bucketStart.getTime(), bin);
  }

  const phase =
    params.bins.length > 0
      ? ((params.bins[0].bucketStart.getTime() % stepMs) + stepMs) % stepMs
      : 0;
  const firstBucketMs =
    Math.floor((params.fromMs - phase) / stepMs) * stepMs + phase;
  const dense: ScoreOutlierDenseBin[] = [];
  let maxValue = 0;

  for (
    let bucketMs = firstBucketMs;
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

  const ticks: ScoreOutlierTick[] = [];
  if (params.widthPx && params.widthPx > 0 && dense.length > 0) {
    const slotPx = params.widthPx / dense.length;
    const tickStepMs = pickScoreOutlierTickStepMs(
      stepMs,
      slotPx,
      TICK_MIN_SPACING_PX,
    );
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

/** Vertical room a 9px axis label needs between accepted gridlines. */
const Y_TICK_MIN_SPACING_PX = 14;
/** Ticks closer to the baseline than this collide with activity ticks. */
const Y_TICK_MIN_OFFSET_PX = 10;
const Y_TICK_MAX_COUNT = 3;

/**
 * Descending "nice" tick candidates <= maxValue: 1-2-5 decades below the max
 * — neither of the two score metrics has a natural "step ladder" (unlike the
 * observations strip's latency), so this always takes the decade path.
 * Mirrors the observations strip's private `descendNiceValues`.
 */
function* descendNiceScoreOutlierValues(maxValue: number): Generator<number> {
  for (let exp = Math.ceil(Math.log10(maxValue)); ; exp--) {
    for (const mantissa of [5, 2, 1]) {
      const value = mantissa * 10 ** exp;
      if (value <= maxValue) yield value;
    }
  }
}

/**
 * Places horizontal value gridlines for the strip: nice values below the
 * max, walked top-down and accepted only where the label fits. Mirrors the
 * observations strip's `prepareOutlierYTicks`.
 */
export function prepareScoreOutlierYTicks(params: {
  /** Max metric value across buckets (the bar scale's domain). */
  maxValue: number;
  metric: ScoreOutlierMetricKey;
  /** Bar canvas height above the baseline. */
  plotHeightPx: number;
  /** Must match the visualiser's bar-height scale. */
  scale: "linear" | "sqrt";
}): ScoreOutlierYTick[] {
  const { maxValue, plotHeightPx } = params;
  if (
    !Number.isFinite(maxValue) ||
    maxValue <= 0 ||
    plotHeightPx <= Y_TICK_MIN_OFFSET_PX
  ) {
    return [];
  }
  const def = SCORE_OUTLIER_STRIP_METRICS[params.metric];
  const toOffsetPx = (value: number) => {
    const fraction = value / maxValue;
    const scaled = params.scale === "sqrt" ? Math.sqrt(fraction) : fraction;
    return scaled * plotHeightPx;
  };

  const ticks: ScoreOutlierYTick[] = [];
  let lastOffsetPx = Number.POSITIVE_INFINITY;
  for (const value of descendNiceScoreOutlierValues(maxValue)) {
    const offsetPx = toOffsetPx(value);
    if (offsetPx < Y_TICK_MIN_OFFSET_PX) break;
    if (lastOffsetPx - offsetPx < Y_TICK_MIN_SPACING_PX) continue;
    ticks.push({ value, label: def.format(value), offsetPx });
    if (ticks.length >= Y_TICK_MAX_COUNT) break;
    lastOffsetPx = offsetPx;
  }
  return ticks;
}
