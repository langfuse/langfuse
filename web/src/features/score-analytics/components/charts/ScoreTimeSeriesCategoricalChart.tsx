import { useMemo } from "react";
import { LineChart } from "@/src/components/design-system/charts/LineChart/LineChart";

export interface CategoricalTimeSeriesChartProps {
  data: Array<{ timestamp: Date; category: string; count: number }>;
  score1Name: string;
  score2Name?: string;
  colors: Record<string, string>;
}

export function ScoreTimeSeriesCategoricalChart({
  data,
  score1Name: _score1Name,
  score2Name: _score2Name,
  colors,
}: CategoricalTimeSeriesChartProps) {
  const { chartData, series } = useMemo(() => {
    const grouped = new Map<number, Record<string, number>>();
    const categories = new Set<string>();
    for (const item of data) {
      const key = item.timestamp.getTime();
      const values = grouped.get(key) ?? {};
      values[item.category] = item.count;
      grouped.set(key, values);
      categories.add(item.category);
    }
    const sorted = [...categories].sort();
    return {
      chartData: [...grouped]
        .sort(([a], [b]) => a - b)
        .map(([timestamp, values]) => ({
          x: new Date(timestamp),
          values: Object.fromEntries(
            sorted.map((category) => [category, values[category] ?? 0]),
          ) as Record<string, number>,
        })),
      series: sorted.map((category) => ({
        id: category,
        label: category,
        color:
          colors[category] ?? Object.values(colors)[0] ?? "hsl(var(--chart-1))",
      })),
    };
  }, [data, colors]);

  if (chartData.length === 0 || series.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
        No time series data available
      </div>
    );
  }
  if (
    !chartData.some((item) =>
      series.some((category) => item.values[category.id]! > 0),
    )
  ) {
    return (
      <div className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
        No data points available for the selected time range
      </div>
    );
  }

  return (
    <LineChart
      data={chartData}
      series={series}
      xAxis={{
        type: "time",
      }}
      valueFormatter={(value) => value.toLocaleString()}
      showDataPointDots
      connectNulls
      legend={{ visibility: "visible", interaction: "toggle", summary: "none" }}
    />
  );
}
