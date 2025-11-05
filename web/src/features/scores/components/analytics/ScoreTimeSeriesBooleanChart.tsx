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
  // Transform categorical data into pivot format for Recharts
  // Detect if categories are prefixed (e.g., "correctness-True") vs plain (e.g., "True")
  const { chartData, categories, isPrefixedMode } = useMemo(() => {
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

    // Detect if categories are prefixed (e.g., "correctness-True", "hallucination-False")
    // This happens in "both" tab when comparing different scores
    const categoryList = Array.from(allCategories).sort();
    const isPrefixed = categoryList.some((cat) =>
      cat.match(/-(?:True|False)$/i),
    );

    // Convert to chart data format
    // Sort by numeric timestamp BEFORE formatting to ensure chronological order
    const formattedData = Array.from(groupedByTimestamp.entries())
      .sort(([tsA], [tsB]) => tsA - tsB)
      .map(([timestamp, categoryMap]) => {
        const formattedTimestamp = formatTimestamp(
          new Date(timestamp),
          interval,
        );

        if (isPrefixed) {
          // Prefixed mode: Create columns for each prefixed category
          const dataPoint: Record<string, string | number> = {
            time_dimension: formattedTimestamp,
          };

          categoryList.forEach((category) => {
            dataPoint[category] = categoryMap.get(category) ?? 0;
          });

          return dataPoint;
        }

        // Non-prefixed mode: Standard True/False columns
        return {
          time_dimension: formattedTimestamp,
          True: categoryMap.get("true") ?? categoryMap.get("True") ?? 0,
          False: categoryMap.get("false") ?? categoryMap.get("False") ?? 0,
        };
      });

    return {
      chartData: formattedData,
      categories: categoryList,
      isPrefixedMode: isPrefixed,
    };
  }, [data, interval]);

  // Chart colors - use consistent chart-1 through chart-5 colors
  const chartColors = useMemo(
    () => [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
    ],
    [],
  );

  // Create chart config based on mode
  const config: ChartConfig = useMemo(() => {
    if (!isPrefixedMode) {
      // Non-prefixed mode: True/False with chart-1 and chart-2
      return {
        True: {
          label: "True",
          theme: {
            light: chartColors[0], // chart-1
            dark: chartColors[0],
          },
        },
        False: {
          label: "False",
          theme: {
            light: chartColors[1], // chart-2
            dark: chartColors[1],
          },
        },
      };
    }

    // Prefixed mode: Use chart colors like categorical chart
    const cfg: ChartConfig = {};

    categories.forEach((category, index) => {
      const colorIndex = index % chartColors.length;
      cfg[category] = {
        label: category,
        theme: {
          light: chartColors[colorIndex],
          dark: chartColors[colorIndex],
        },
      };
    });

    return cfg;
  }, [isPrefixedMode, categories, chartColors]);

  if (chartData.length === 0 || categories.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No time series data available
      </div>
    );
  }

  // Check if all values are zero (no data in the selected time range)
  const hasAnyData = chartData.some((item) => {
    if (isPrefixedMode) {
      // Check all category columns in prefixed mode
      return categories.some((category) => (item[category] as number) > 0);
    }
    // Check True/False columns in non-prefixed mode
    return (item.True as number) > 0 || (item.False as number) > 0;
  });

  if (!hasAnyData) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No data points available for the selected time range
      </div>
    );
  }

  console.log("chartData", chartData);
  console.log("categories", categories);
  console.log("isPrefixedMode", isPrefixedMode);
  console.log("config", config);

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
        {isPrefixedMode ? (
          // Prefixed mode: Render dynamic lines for each category
          categories.map((category, index) => {
            const chartColors = [
              "hsl(var(--chart-1))",
              "hsl(var(--chart-2))",
              "hsl(var(--chart-3))",
              "hsl(var(--chart-4))",
              "hsl(var(--chart-5))",
            ];
            const colorIndex = index % chartColors.length;

            return (
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                stroke={chartColors[colorIndex]}
                strokeWidth={2}
                dot={true}
                activeDot={{ r: 6, strokeWidth: 0 }}
                connectNulls
              />
            );
          })
        ) : (
          // Non-prefixed mode: Render standard True/False lines
          <>
            <Line
              type="monotone"
              dataKey="True"
              stroke={chartColors[0]} // chart-1
              strokeWidth={2}
              dot={true}
              activeDot={{ r: 6, strokeWidth: 0 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="False"
              stroke={chartColors[1]} // chart-2
              strokeWidth={2}
              dot={true}
              activeDot={{ r: 6, strokeWidth: 0 }}
              connectNulls
            />
          </>
        )}
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
