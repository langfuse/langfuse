import { type ChartConfig } from "@/src/components/ui/chart";
import type tailwindColors from "tailwindcss/colors";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number | Array<Array<number>>;
}

export type LegendPosition = "above" | "none";

/**
 * How a chart legend summarizes each series across its time buckets:
 * - `"sum"`: additive total (event counts, token totals, cost) — reconciles
 *   with the card's headline number.
 * - `"average"`: a representative central value for non-additive metrics
 *   (latency percentiles, average scores) where a cross-bucket sum would be
 *   meaningless.
 * - `"none"`: no per-series summary (default).
 *
 * The mode is chosen by each call-site because additivity is a property of the
 * metric's aggregation, which is decided upstream of the chart. (LFE-10498)
 */
export type LegendSummaryMode = "sum" | "average" | "none";

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
