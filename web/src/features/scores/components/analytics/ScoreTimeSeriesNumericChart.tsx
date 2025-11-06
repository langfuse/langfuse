import { useMemo, useState, useCallback } from "react";
import { Line, LineChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";
import {
  getSingleScoreChartConfig,
  getTwoScoreChartConfig,
  getTwoScoreColors,
} from "@/src/features/scores/lib/color-scales";
import { type IntervalConfig } from "@/src/utils/date-range-utils";

export interface NumericTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    avg1: number | null;
    avg2: number | null;
    count: number;
  }>;
  score1Name: string;
  score2Name?: string;
  interval: IntervalConfig;
}

/**
 * Numeric time series chart component
 * Renders line charts for numeric score time series
 * - Single score: One line
 * - Two scores: Two lines for comparison
 */
export function ScoreTimeSeriesNumericChart({
  data,
  score1Name,
  score2Name,
  interval,
}: NumericTimeSeriesChartProps) {
  const isComparisonMode = Boolean(score2Name);

  // Visibility state for interactive legend (comparison mode only)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Create visibility state object for legend
  const visibilityState = useMemo(() => {
    if (!isComparisonMode) return {};
    const state: Record<string, boolean> = {};
    state[score1Name] = !hiddenKeys.has(score1Name);
    if (score2Name) {
      state[score2Name] = !hiddenKeys.has(score2Name);
    }
    return state;
  }, [hiddenKeys, score1Name, score2Name, isComparisonMode]);

  // Toggle handler with safety check (prevent hiding all items)
  const handleVisibilityToggle = useCallback(
    (key: string, visible: boolean) => {
      if (!visible && hiddenKeys.size >= 1) {
        // Keep at least one visible
        return;
      }

      setHiddenKeys((prev) => {
        const next = new Set(prev);
        if (visible) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [hiddenKeys],
  );

  // Transform data for Recharts
  const chartData = useMemo(() => {
    return data.map((item) => {
      // Format timestamp based on interval
      const timestamp = formatTimestamp(item.timestamp, interval);

      if (isComparisonMode) {
        return {
          time_dimension: timestamp,
          [score1Name]: item.avg1,
          [score2Name!]: item.avg2,
        };
      }

      return {
        time_dimension: timestamp,
        [score1Name]: item.avg1,
      };
    });
  }, [data, score1Name, score2Name, interval, isComparisonMode]);

  const config: ChartConfig = isComparisonMode
    ? getTwoScoreChartConfig(score1Name, score2Name!)
    : getSingleScoreChartConfig(score1Name);

  const colors = getTwoScoreColors();

  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No time series data available
      </div>
    );
  }

  // Check if all values are null (no data in the selected time range)
  const hasAnyData = chartData.some((item) => {
    if (isComparisonMode) {
      return item[score1Name] !== null || item[score2Name!] !== null;
    }
    return item[score1Name] !== null;
  });

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
        />
        <Line
          type="monotone"
          dataKey={score1Name}
          stroke={colors.score1}
          strokeWidth={2}
          strokeOpacity={hiddenKeys.has(score1Name) ? 0 : 1}
          dot={!hiddenKeys.has(score1Name)}
          activeDot={
            !hiddenKeys.has(score1Name) ? { r: 6, strokeWidth: 0 } : false
          }
          connectNulls
        />
        {isComparisonMode && score2Name && (
          <Line
            type="monotone"
            dataKey={score2Name}
            stroke={colors.score2}
            strokeWidth={2}
            strokeOpacity={hiddenKeys.has(score2Name) ? 0 : 1}
            dot={!hiddenKeys.has(score2Name)}
            activeDot={
              !hiddenKeys.has(score2Name) ? { r: 6, strokeWidth: 0 } : false
            }
            connectNulls
          />
        )}
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
        {isComparisonMode && (
          <Legend
            content={
              <ScoreChartLegendContent
                interactive={true}
                visibilityState={visibilityState}
                onVisibilityChange={handleVisibilityToggle}
              />
            }
          />
        )}
      </LineChart>
    </ChartContainer>
  );
}

/**
 * Format timestamp based on aggregation interval
 * Matches the dashboard pattern from BaseTimeSeriesChart.tsx
 *
 * For fine-grained intervals (second, minute, hour): shows full datetime
 * For coarse intervals (day, month, year): shows date only
 */
export function formatTimestamp(date: Date, interval: IntervalConfig): string {
  const { unit } = interval;

  // Fine-grained intervals: show date and time
  // Pattern matches dashboard's convertDate for "minute" and "hour" dateTrunc
  if (unit === "second" || unit === "minute" || unit === "hour") {
    return date.toLocaleTimeString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Coarse intervals: show date only
  // Pattern matches dashboard's convertDate for "day", "week", "month" dateTrunc
  return date.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}
