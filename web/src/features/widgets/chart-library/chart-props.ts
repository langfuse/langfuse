import { type ChartConfig } from "@/src/components/ui/chart";
import type tailwindColors from "tailwindcss/colors";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number | Array<Array<number>>;
}

export type LegendPosition = "above" | "none";

/**
 * Whether a chart legend shows a per-series summary across its time buckets:
 * - `"sum"`: the additive total (event counts, token totals, cost) — reconciles
 *   with the card's headline number.
 * - `"none"`: no per-series summary (default).
 *
 * Only additive metrics get a summary. A summary is deliberately *not* offered
 * for non-additive metrics (latency percentiles, average scores): a cross-bucket
 * sum is meaningless for them, and a correct average can't be computed here
 * because the upstream pipeline pads missing buckets with real `0`s (it would
 * deflate the mean). Such charts opt out via the `"none"` default. The mode is
 * chosen per call-site because additivity is a property of the metric's
 * aggregation, decided upstream of the chart. (LFE-10498)
 */
export type LegendSummaryMode = "sum" | "none";

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
  showValueLabels?: boolean;
  showDataPointDots?: boolean;
  subtleFill?: boolean;
  thresholds?: ChartThreshold[];
}
