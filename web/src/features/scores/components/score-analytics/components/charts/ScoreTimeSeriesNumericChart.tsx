import { useMemo, useState, useCallback } from "react";
import { Line, LineChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/src/components/ui/chart";
import {
  type IntervalConfig,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { formatChartTimestamp } from "../../libs/chart-formatters";
import { ScoreChartTooltip } from "../../libs/ScoreChartTooltip";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";

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
  timeRange: TimeRange;
  colors: { score1: string; score2?: string };
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
  timeRange,
  colors,
}: NumericTimeSeriesChartProps) {
  const isComparisonMode = Boolean(score2Name);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    return data.map((item) => {
      // Format timestamp based on interval and time range
      const timestamp = formatChartTimestamp(
        item.timestamp,
        interval,
        timeRange,
      );

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
  }, [data, score1Name, score2Name, interval, timeRange, isComparisonMode]);

  // Visibility state for interactive legend (comparison mode only)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Create visibility state object for legend
  const visibilityState = useMemo(() => {
    if (!isComparisonMode) return undefined;
    return {
      [score1Name]: !hiddenKeys.has(score1Name),
      ...(score2Name && { [score2Name]: !hiddenKeys.has(score2Name) }),
    };
  }, [hiddenKeys, score1Name, score2Name, isComparisonMode]);

  // Toggle handler
  const handleVisibilityToggle = useCallback(
    (key: string, visible: boolean) => {
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
    [],
  );

  const config: ChartConfig = useMemo(() => {
    if (isComparisonMode && score2Name) {
      return {
        [score1Name]: {
          label: score1Name,
          color: colors.score1,
        },
        [score2Name]: {
          label: score2Name,
          color: colors.score2,
        },
      };
    }
    return {
      [score1Name]: {
        label: score1Name,
        color: colors.score1,
      },
    };
  }, [score1Name, score2Name, isComparisonMode, colors]);

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
          axisLine={{ stroke: "hsl(var(--border) / 0.5)" }}
          interval={1}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => compactNumberFormatter(value)}
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
          content={
            <ScoreChartTooltip
              interval={interval}
              timeRange={timeRange}
              valueFormatter={compactNumberFormatter}
            />
          }
        />
        <Legend
          content={
            <ScoreChartLegendContent
              interactive={isComparisonMode}
              visibilityState={visibilityState}
              onVisibilityChange={handleVisibilityToggle}
            />
          }
        />
      </LineChart>
    </ChartContainer>
  );
}
