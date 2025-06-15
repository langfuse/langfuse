import React from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip } from "@/src/components/ui/chart";
import { compactNumberFormatter } from "@/src/utils/numbers";

interface HistogramDataPoint {
  binLabel: string;
  count: number;
  lower?: number;
  upper?: number;
  height?: number;
}

const HistogramChart = ({ data }: { data: DataPoint[] }) => {
  const transformHistogramData = (data: DataPoint[]): HistogramDataPoint[] => {
    if (!data.length) return [];

    // Check if this is ClickHouse histogram format (array of tuples)
    const firstDataPoint = data[0];
    if (firstDataPoint?.metric && Array.isArray(firstDataPoint.metric)) {
      // ClickHouse histogram format: [(lower, upper, height), ...]
      return (firstDataPoint.metric as [number, number, number][]).map(
        ([lower, upper, height]) => ({
          binLabel: `[${compactNumberFormatter(lower)}, ${compactNumberFormatter(upper)}]`,
          count: height,
          lower,
          upper,
          height,
        }),
      );
    }

    // Fallback: treat as regular data points with binLabel
    return data.map((item) => ({
      binLabel: item.dimension || `Bin ${data.indexOf(item) + 1}`,
      count: (item.metric as number) || 0,
    }));
  };

  const histogramData = transformHistogramData(data);

  // Chart configuration
  const config = {
    count: {
      label: "Count",
      color: "hsl(var(--chart-1))",
    },
  };

  if (!histogramData.length) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ChartContainer config={config}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={histogramData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <XAxis
            dataKey="binLabel"
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            angle={-45}
            textAnchor="end"
            height={90}
          />
          <YAxis
            stroke="hsl(var(--chart-grid))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Bar
            dataKey="count"
            fill="hsl(var(--chart-1))"
            radius={[2, 2, 0, 0]}
          />
          <ChartTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            formatter={(value, name) => [
              `${value}`,
              name === "count" ? "Count" : name,
            ]}
            labelFormatter={(label) => `Bin: ${label}`}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default HistogramChart;
