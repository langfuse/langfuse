import { type ChartConfig } from "@/src/components/ui/chart";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number | Array<Array<number>>;
}

export type LegendPosition = "above" | "none";

export interface ChartProps {
  data: DataPoint[];
  config?: ChartConfig;
  accessibilityLayer?: boolean;
  valueFormatter?: (value: number) => string;
  legendPosition?: LegendPosition;
  showValueLabels?: boolean;
  showDataPointDots?: boolean;
  subtleFill?: boolean;
}
