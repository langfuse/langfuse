import { type ChartConfig } from "@/src/components/ui/chart";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number | Array<Array<number>>;
}

export type LegendPosition = "above" | "none";

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

export interface ChartProps {
  data: DataPoint[];
  config?: ChartConfig;
  accessibilityLayer?: boolean;
  metricFormatter?: MetricFormatterFunction;
  legendPosition?: LegendPosition;
  showValueLabels?: boolean;
  showDataPointDots?: boolean;
  subtleFill?: boolean;
}
