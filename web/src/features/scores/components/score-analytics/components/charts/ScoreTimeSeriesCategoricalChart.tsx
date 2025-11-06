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
import { formatChartTimestamp } from "../../libs/chart-formatters";
import { ScoreChartTooltip } from "../../libs/ScoreChartTooltip";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";

export interface CategoricalTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    category: string;
    count: number;
  }>;
  score1Name: string;
  score2Name?: string;
  interval: IntervalConfig;
  timeRange: TimeRange;
  colors: Record<string, string>;
}

/**
 * Categorical time series chart component
 * Renders line charts showing counts for each category over time
 * One line per category with dynamic colors
 */
export function ScoreTimeSeriesCategoricalChart({
  data,
  score1Name: _score1Name,
  score2Name: _score2Name,
  interval,
  timeRange,
  colors,
}: CategoricalTimeSeriesChartProps) {
  // Transform categorical data into pivot format for Recharts
  const { chartData, categories } = useMemo(() => {
    // Group by timestamp and collect all categories
    const groupedByTimestamp = new Map<number, Map<string, number>>();
    const allCategories = new Set<string>();

    data.forEach((item) => {
      const timestampKey = item.timestamp.getTime();
      if (!groupedByTimestamp.has(timestampKey)) {
        groupedByTimestamp.set(timestampKey, new Map());
      }
      const categoryMap = groupedByTimestamp.get(timestampKey)!;
      categoryMap.set(item.category, item.count);
      allCategories.add(item.category);
    });

    // Convert to chart data format
    // Sort by numeric timestamp BEFORE formatting to ensure chronological order
    const formattedData = Array.from(groupedByTimestamp.entries())
      .sort(([tsA], [tsB]) => tsA - tsB)
      .map(([timestamp, categoryMap]) => {
        const formattedTimestamp = formatChartTimestamp(
          new Date(timestamp),
          interval,
          timeRange,
        );

        const dataPoint: Record<string, string | number> = {
          time_dimension: formattedTimestamp,
        };

        // Add each category as a separate column
        allCategories.forEach((category) => {
          dataPoint[category] = categoryMap.get(category) ?? 0;
        });

        return dataPoint;
      });

    return {
      chartData: formattedData,
      categories: Array.from(allCategories).sort(),
    };
  }, [data, interval, timeRange]);

  // Visibility state for interactive legend
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Create visibility state object for legend
  const visibilityState = useMemo(() => {
    const state: Record<string, boolean> = {};
    categories.forEach((category) => {
      state[category] = !hiddenKeys.has(category);
    });
    return state;
  }, [hiddenKeys, categories]);

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

  // Create chart config with colors for each category
  const config: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};

    categories.forEach((category) => {
      cfg[category] = {
        label: category,
        color: colors[category] || Object.values(colors)[0],
      };
    });

    return cfg;
  }, [categories, colors]);

  if (chartData.length === 0 || categories.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No time series data available
      </div>
    );
  }

  // Check if all values are zero (no data in the selected time range)
  const hasAnyData = chartData.some((item) =>
    categories.some((category) => (item[category] as number) > 0),
  );

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
          label={{ value: "Count", angle: -90, position: "insideLeft" }}
          tickFormatter={(value) => value.toLocaleString()}
        />
        {categories.map((category) => {
          const isHidden = hiddenKeys.has(category);
          return (
            <Line
              key={category}
              type="monotone"
              dataKey={category}
              stroke={config[category]?.color}
              strokeWidth={2}
              strokeOpacity={isHidden ? 0 : 1}
              dot={!isHidden}
              activeDot={!isHidden ? { r: 6, strokeWidth: 0 } : false}
              connectNulls
            />
          );
        })}
        <ChartTooltip
          content={
            <ScoreChartTooltip
              interval={interval}
              timeRange={timeRange}
              valueFormatter={(value) => value.toLocaleString()}
            />
          }
        />
        <Legend
          content={
            <ScoreChartLegendContent
              interactive={true}
              visibilityState={visibilityState}
              onVisibilityChange={handleVisibilityToggle}
            />
          }
        />
      </LineChart>
    </ChartContainer>
  );
}
