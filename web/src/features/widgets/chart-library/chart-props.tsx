export interface DataPoint {
  time_dimension: string | undefined;
  dimension: string | undefined;
  metric: number;
}

export interface ChartProps {
  data: DataPoint[];
  config?: {
    metric?: {
      theme?: {
        light: string;
        dark: string;
      };
    };
  };
  accessibilityLayer?: boolean;
}
