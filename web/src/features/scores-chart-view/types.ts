import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type AggregationFn,
  type TimeGranularity,
} from "@/src/features/chart-view/types";

/**
 * All types for the scores chart view + outlier strip, in one module —
 * mostly small type aliases/interfaces with no runtime logic, so splitting
 * them into a dozen one-liner files added navigation overhead without
 * adding isolation.
 */

// ---------------------------------------------------------------------------
// Chart view config
// ---------------------------------------------------------------------------

/**
 * Which underlying scores view the chart queries — matches the three views
 * the query engine already exposes for scores (`packages/shared/src/features/
 * query/dataModel.ts`) and the same three-way split the rest of the app uses
 * (`viewLabels` in `@/src/features/monitors/helpers/monitorLabels`, the
 * scores filter groups in `@/src/features/experiments/config/
 * experiment-items-filter-config`):
 * - "numeric": the `scores-numeric` view. NUMERIC scores, average/sum/min/max-able.
 * - "boolean": the `scores-boolean` view. BOOLEAN scores; its "value" measure
 *   is the 0/1 average, i.e. the true-rate.
 * - "categorical": the `scores-categorical` view, count-only — categorical
 *   scores have no numeric magnitude to aggregate.
 */
export type ScoreChartDataset = "numeric" | "boolean" | "categorical";

/**
 * The two measures the `scores-numeric` view exposes (see
 * `packages/shared/src/features/query/dataModel.ts`). Query surface is
 * deliberately smaller than the events/observations chart view
 * (`@/src/features/chart-view`): the scores table only ever charts one view,
 * so there is no per-view picker.
 */
export type ScoreMetricKey = "count" | "value";

export interface ScoreMetricDef {
  key: ScoreMetricKey;
  label: string;
  /** Which view (`scores-numeric` or `scores-categorical`) this metric queries. */
  dataset: ScoreChartDataset;
  /** The measure name this metric aggregates over on that view. */
  measure: string;
  aggregations: AggregationFn[];
  /** Passed through to the shared `ChartCanvas` so axes/tooltips render units. */
  unit?: string;
}

/**
 * The breakdown dimensions the scores chart view offers are read directly
 * off each view's real dimension declaration (see
 * `getScoreDimensionsForDataset`) — the same source the dashboard widget
 * builder reads — rather than a fixed, hand-maintained enum that could drift
 * from it. So this is just a plain string, not a closed union.
 */
export type ScoreDimensionKey = string;

export interface ScoreDimensionDef {
  key: ScoreDimensionKey;
  label: string;
  /** The dimension field on the active dataset's view; `null` for "no breakdown". */
  field: string | null;
}

export interface ScoreChartViewConfig {
  /** Which scores view ("Scores (numeric)" vs "Scores (categorical)") to chart. */
  dataset: ScoreChartDataset;
  metric: ScoreMetricKey;
  // Reuses the observations chart view's `AggregationFn`/`TimeGranularity` —
  // both are already view-agnostic (they only describe a SQL aggregation and
  // a bucket size, not a specific metric or dimension).
  aggregation: AggregationFn;
  breakdown: ScoreDimensionKey;
  chartType: DashboardWidgetChartType;
  timeGranularity: TimeGranularity;
}

// ---------------------------------------------------------------------------
// Outlier strip ("Pulse")
// ---------------------------------------------------------------------------

/**
 * The metrics the scores outlier strip can plot — mirrors the observations
 * strip's `OutlierStripMetricKey`
 * (`@/src/features/events/components/outlier-strip`), trimmed to the two
 * measures `scores-numeric` exposes.
 */
export type ScoreOutlierMetricKey = "count" | "value";

export type ScoreOutlierAggKey = "count" | "avg" | "min" | "max";

/** One executeQuery row; metric columns are looked up via the registry. */
export type ScoreOutlierQueryRow = Record<string, unknown> & {
  time_dimension?: string;
  count_count?: unknown;
};

/** One bucket of aggregates, keyed by result column (`agg_measure`). */
export type ScoreOutlierBin = {
  bucketStart: Date;
  count: number;
  values: Record<string, number | null>;
};

/** One bucket on the dense grid; `value` null = no data in this bucket. */
export type ScoreOutlierDenseBin = {
  bucketStartMs: number;
  count: number;
  value: number | null;
};

/** A prepared gridline tick: dense-bin index + presentation-ready label. */
export type ScoreOutlierTick = { index: number; label: string };

/** A prepared horizontal value gridline. */
export type ScoreOutlierYTick = {
  value: number;
  label: string;
  /** px above the baseline, already mapped through the bar-height scale. */
  offsetPx: number;
};
