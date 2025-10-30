import { useMemo } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";

export interface ScoreTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    avg1: number | null;
    avg2: number | null;
    count: number;
  }>;
  scoreName: string;
  interval: "hour" | "day" | "week" | "month";
  overallAverage: number;
}

export function ScoreTimeSeriesChart({
  data,
  scoreName,
  interval,
}: ScoreTimeSeriesChartProps) {
  console.log("[ScoreTimeSeriesChart] Rendering:", {
    dataLength: data.length,
    scoreName,
    interval,
  });

  // Transform data for Recharts
  const chartData = useMemo(() => {
    const transformed = data.map((item) => {
      // Format timestamp based on interval
      const timestamp = formatTimestamp(item.timestamp, interval);

      return {
        time_dimension: timestamp,
        [scoreName]: item.avg1,
      };
    });
    console.log("[ScoreTimeSeriesChart] Transformed data:", transformed);
    return transformed;
  }, [data, scoreName, interval]);

  const config: ChartConfig = {
    [scoreName]: {
      theme: {
        light: "hsl(var(--chart-1))",
        dark: "hsl(var(--chart-1))",
      },
    },
  };

  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No time series data available
      </div>
    );
  }

  return (
    <ChartContainer config={config}>
      <LineChart accessibilityLayer data={chartData}>
        <XAxis
          dataKey="time_dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Line
          type="monotone"
          dataKey={scoreName}
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          dot={true}
          activeDot={{ r: 6, strokeWidth: 0 }}
          connectNulls
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </LineChart>
    </ChartContainer>
  );
}

/**
 * Format timestamp based on aggregation interval
 */
function formatTimestamp(
  date: Date,
  interval: "hour" | "day" | "week" | "month",
): string {
  const showMinutes = interval === "hour";

  if (showMinutes) {
    return date.toLocaleTimeString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}
