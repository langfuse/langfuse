import { type ChartConfig } from "@/src/components/ui/chart";
import type tailwindColors from "tailwindcss/colors";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  /**
   * `null` means "measured nothing here": the bucket exists but the metric has
   * no honest value (e.g. an average over zero events). Time-series charts
   * render it as a gap; it is never coerced to `0`. A point with `null` metric
   * AND no dimension is a pure bucket marker — it keeps the bucket on the time
   * axis without contributing a series. (LFE-10694)
   */
  metric: number | null | Array<Array<number>>;
}

/**
 * What a time-series chart shows for a (bucket, series) cell that has no data
 * point:
 * - `"zero"`: additive metrics (counts, sums) — zero events happened, so the
 *   honest value is a real `0` and the line stays continuous.
 * - `"gap"`: non-additive metrics (avg/min/max/percentiles) — no honest value
 *   exists, so the cell becomes `null` and the line breaks instead of
 *   fabricating a trend across the gap.
 *
 * The choice is a property of the metric's aggregation and is decided by the
 * caller (who knows it), not the chart. Defaults to `"gap"` — never invent a
 * number. (LFE-10694, manifesto V2)
 */
export type MissingBucketValue = "zero" | "gap";

/**
 * Whether a time-series chart shows its legend (always rendered below the
 * plot):
 * - `"auto"` (default): only when the chart draws more than one series — a
 *   multi-series chart is unreadable without one, while a single-series legend
 *   just echoes the card title.
 * - `"below"`: always.
 * - `"none"`: never.
 * (LFE-10576)
 */
export type LegendPosition = "auto" | "below" | "none";

/**
 * Whether a chart legend shows a per-series summary across its time buckets:
 * - `"sum"`: the additive total (event counts, token totals, cost) — reconciles
 *   with the card's headline number.
 * - `"none"`: no per-series summary (default).
 *
 * Only additive metrics get a legend value. A summary is deliberately *not*
 * offered for non-additive metrics (latency percentiles, scores): a cross-bucket
 * sum is meaningless for them, a correct average can't be computed here because
 * the upstream pipeline pads missing buckets with real `0`s (it would deflate the
 * mean), and an unlabeled non-sum number reads ambiguously. Such charts show the
 * bare series name (the `"none"` default). The mode is chosen per call-site
 * because additivity is a property of the metric's aggregation, decided upstream
 * of the chart. (LFE-10498, LFE-10549)
 */
export type LegendSummaryMode = "sum" | "none";

/**
 * How clicking a legend entry behaves on a multi-series time chart:
 * - `"highlight"` (default): clicking a series focuses it and mutes the rest;
 *   clicking again clears. All series stay rendered. (Historical behavior.)
 * - `"toggle"`: clicking a series shows/hides it; hidden series are dropped from
 *   the plot and greyed in the legend. Pairs with `maxVisibleSeries` to tame
 *   overloaded charts by hiding the long tail by default. (LFE-10549)
 */
export type LegendInteraction = "highlight" | "toggle";

export interface FormattedMetric {
  negative?: boolean;
  prefix?: string;
  main: string;
  suffix?: string;
}

export type FormatMetricOptions = {
  unit?: string;
  style: "full" | "compact";
  maxCharacters?: number;
};

export type MetricFormatterFunction = (
  value: number,
  options: FormatMetricOptions,
) => FormattedMetric;

/** ChartThresholdOperator picks the violation region a chart tints around a threshold. */
export type ChartThresholdOperator = "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ";

/** ChartThresholdColor is one of Tailwind's palette family names. */
export type ChartThresholdColor = {
  [K in keyof typeof tailwindColors]: (typeof tailwindColors)[K] extends Record<
    string,
    string
  >
    ? K
    : never;
}[keyof typeof tailwindColors] &
  string;

/** ChartThreshold renders a horizontal reference line plus an operator-derived tinted violation region. */
export interface ChartThreshold {
  value: number;
  operator: ChartThresholdOperator;
  color: ChartThresholdColor;
  label?: string;
}

export interface ChartProps {
  data: DataPoint[];
  config?: ChartConfig;
  accessibilityLayer?: boolean;
  metricFormatter?: MetricFormatterFunction;
  legendPosition?: LegendPosition;
  legendSummary?: LegendSummaryMode;
  /** How a legend click behaves (focus-vs-toggle). Defaults to `"highlight"`. */
  legendInteraction?: LegendInteraction;
  /**
   * Cap the number of series drawn by default (top-N by magnitude); the rest
   * start hidden but remain toggleable from the legend. Only meaningful with
   * `legendInteraction="toggle"`. Undefined = draw every series. (LFE-10549)
   */
  maxVisibleSeries?: number;
  /**
   * Shared sync group: charts on the same dashboard timeline that pass the same
   * `syncId` show a synced hover crosshair + tooltip — hovering one moves the
   * vertical time marker on all of them. (LFE-10549)
   */
  syncId?: string;
  showValueLabels?: boolean;
  showDataPointDots?: boolean;
  subtleFill?: boolean;
  thresholds?: ChartThreshold[];
  /** See {@link MissingBucketValue}. Defaults to `"gap"`. */
  missingValue?: MissingBucketValue;
  /**
   * Whether a line/area bridges `null` cells instead of breaking. Defaults to
   * `false`: drawing across a no-data bucket fabricates values that were never
   * measured. Opt in only when the series semantically continues across the
   * gap. (LFE-10694, manifesto V2)
   */
  connectNulls?: boolean;
  /**
   * Hide the x-axis tick labels on a categorical (entity-name) axis, keeping the
   * full name in the hover tooltip. Off by default. Opt in for the experiments /
   * dataset-compare charts, whose long entity names clutter the axis with little
   * value. Forwarded to `prepareTimeAxis` as `hideCategoryTickLabels`, so it only
   * affects a categorical axis — a temporal axis keeps its timestamp labels.
   */
  hideXAxisLabels?: boolean;
}
