import { type ChartConfig } from "@/src/components/ui/chart";

export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number | Array<Array<number>>;
}

export interface ChartProps {
  data: DataPoint[];
  config?: ChartConfig;
  accessibilityLayer?: boolean;
}
