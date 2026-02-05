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
  /** Optional formatter for tooltip values (e.g. USD, compact number). */
  valueFormatter?: (value: number) => string;
  /** Legend placement. 'above' = horizontal legend row above the chart. */
  legendPosition?: LegendPosition;
}
