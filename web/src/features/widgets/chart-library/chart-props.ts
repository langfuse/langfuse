import { type ChartConfig } from "@/src/components/ui/chart";
import type tailwindColors from "tailwindcss/colors";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number | Array<Array<number>>;
}

export type LegendPosition = "above" | "none";

/**
 * Which per-series summary (if any) a chart legend shows across its time buckets:
 * - `"sum"`: the additive total (event counts, token totals, cost) — reconciles
 *   with the card's headline number.
 * - `"avg"` / `"median"`: central tendency, for non-additive metrics where a sum
 *   is meaningless (scores, latencies). Computed over the buckets the series
 *   carries; mind the LFE-10498 caveat that upstream zero-padding pulls the
 *   mean/median toward `0`.
 * - `"last"`: the most recent bucket's value — a good "current value" gauge for
 *   latency percentiles.
 * - `"none"`: no per-series summary (default).
 *
 * The mode is chosen per call-site because additivity (and what reads as a
 * meaningful summary) is a property of the metric's aggregation, decided
 * upstream of the chart. (LFE-10498, LFE-10549)
 */
export type LegendSummaryMode = "sum" | "avg" | "median" | "last" | "none";

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
  showValueLabels?: boolean;
  showDataPointDots?: boolean;
  subtleFill?: boolean;
  thresholds?: ChartThreshold[];
}
