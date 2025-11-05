import { useMemo } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { type IntervalConfig } from "@/src/utils/date-range-utils";
import { formatTimestamp } from "./ScoreTimeSeriesNumericChart";
import { getTwoScoreColors } from "@/src/features/scores/lib/color-scales";

export interface BooleanTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    category: string;
    count: number;
  }>;
  score1Name: string;
  score2Name?: string;
  interval: IntervalConfig;
}

/**
 * Boolean time series chart component
 * Renders line charts showing counts for True/False values over time
 * - Single score: Two lines (True, False)
 * - Two scores: Four lines (Score1-True, Score1-False, Score2-True, Score2-False)
 */
export function ScoreTimeSeriesBooleanChart({
  data,
  score1Name: _score1Name,
  score2Name: _score2Name,
  interval,
}: BooleanTimeSeriesChartProps) {
  const isComparisonMode = Boolean(_score2Name);

  // Transform categorical data into pivot format for Recharts
  const chartData = useMemo(() => {
    // Group by timestamp
    const groupedByTimestamp = new Map<number, Map<string, number>>();

    data.forEach((item) => {
      const timestampKey = item.timestamp.getTime();
      if (!groupedByTimestamp.has(timestampKey)) {
        groupedByTimestamp.set(timestampKey, new Map());
      }
      const categoryMap = groupedByTimestamp.get(timestampKey)!;
      categoryMap.set(item.category, item.count);
    });

    // Convert to chart data format
    // Sort by numeric timestamp BEFORE formatting to ensure chronological order
    return Array.from(groupedByTimestamp.entries())
      .sort(([tsA], [tsB]) => tsA - tsB)
      .map(([timestamp, categories]) => {
        const formattedTimestamp = formatTimestamp(
          new Date(timestamp),
          interval,
        );

        if (isComparisonMode) {
          // For comparison mode, we won't have score-specific data in this component
          // The parent will call this component separately for each score
          return {
            time_dimension: formattedTimestamp,
            True: categories.get("true") ?? categories.get("True") ?? 0,
            False: categories.get("false") ?? categories.get("False") ?? 0,
          };
        }

        return {
          time_dimension: formattedTimestamp,
          True: categories.get("true") ?? categories.get("True") ?? 0,
          False: categories.get("false") ?? categories.get("False") ?? 0,
        };
      });
  }, [data, interval, isComparisonMode]);

  // Get colors - use score-specific colors in comparison mode
  const colors = getTwoScoreColors();

  // Create chart config for True/False lines
  // Use score-specific colors to match numeric chart
  const config: ChartConfig = {
    True: {
      label: "True",
      theme: {
        light: colors.score1,
        dark: colors.score1,
      },
    },
    False: {
      label: "False",
      theme: {
        light: colors.score2,
        dark: colors.score2,
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

  // Check if all values are zero (no data in the selected time range)
  const hasAnyData = chartData.some((item) => item.True > 0 || item.False > 0);

  if (!hasAnyData) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No data points available for the selected time range
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
          interval={0}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          label={{ value: "Count", angle: -90, position: "insideLeft" }}
        />
        <Line
          type="monotone"
          dataKey="True"
          stroke={colors.score1}
          strokeWidth={2}
          dot={true}
          activeDot={{ r: 6, strokeWidth: 0 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="False"
          stroke={colors.score2}
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
