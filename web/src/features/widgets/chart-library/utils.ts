import { type DataPoint } from "./chart-props";
import { type ChartConfig } from "@/src/components/ui/chart";

/**
 * Groups data by dimension to prepare it for time series breakdowns
 * @param data
 */
export const groupDataByTimeDimension = (data: DataPoint[]) => {
  // First, group by time_dimension
  const timeGroups = data.reduce(
    (acc: Record<string, Record<string, number>>, item: DataPoint) => {
      const time = item.time_dimension || "Unknown";
      if (!acc[time]) {
        acc[time] = {};
      }

      const dimension = item.dimension || "Unknown";
      acc[time][dimension] = item.metric;

      return acc;
    },
    {},
  );

  // Convert to array format for Recharts
  return Object.entries(timeGroups).map(([time, dimensions]) => ({
    time_dimension: time,
    ...dimensions,
  }));
};

export const getUniqueDimensions = (data: DataPoint[]) => {
  const uniqueDimensions = new Set<string>();
  data.forEach((item: DataPoint) => {
    if (item.dimension) {
      uniqueDimensions.add(item.dimension);
    }
  });
  return Array.from(uniqueDimensions);
};

export const expandChartConfig = (
  config: ChartConfig,
  dimensions: string[],
) => {
  const result: any = { ...config };

  // Add colors for each dimension
  dimensions.forEach((dimension, index) => {
    const colorIndex = (index % 4) + 1; // We have 4 chart colors defined in CSS
    result[dimension] = {
      color: `hsl(var(--chart-${colorIndex}))`,
    };
  });

  return result as ChartConfig;
};
