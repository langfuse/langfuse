import { useMemo } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import {
  getSingleScoreChartConfig,
  getSingleScoreColor,
} from "@/src/features/scores/lib/color-scales";
import { type IntervalConfig } from "@/src/utils/date-range-utils";

export interface ScoreTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    avg1: number | null;
    avg2: number | null;
    count: number;
  }>;
  scoreName: string;
  interval: IntervalConfig;
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

  const config: ChartConfig = getSingleScoreChartConfig(scoreName);

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
          stroke={getSingleScoreColor()}
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
 * Intelligently shows seconds/minutes/hours/dates based on interval granularity
 */
function formatTimestamp(date: Date, interval: IntervalConfig): string {
  const { unit } = interval;

  // For second and minute intervals, show full time
  if (unit === "second" || unit === "minute") {
    return date.toLocaleTimeString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: unit === "second" ? "2-digit" : undefined,
    });
  }

  // For hour intervals, show date and time (no seconds)
  if (unit === "hour") {
    return date.toLocaleTimeString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // For day/month/year intervals, show only date
  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}
