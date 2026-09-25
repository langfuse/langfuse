import { useMemo } from "react";
import { LineChart } from "@/src/components/design-system/charts/LineChart/LineChart";
import {
  type IntervalConfig,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  formatChartTimestamp,
  formatChartTooltipTimestamp,
} from "../../lib/chart-formatters";

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

export function ScoreTimeSeriesNumericChart({
  data,
  score1Name,
  score2Name,
  interval,
  timeRange,
  colors,
}: NumericTimeSeriesChartProps) {
  const chartData = useMemo(
    () =>
      data.map((item) => ({
        x: item.timestamp,
        values: {
          score1: item.avg1,
          ...(score2Name ? { score2: item.avg2 } : {}),
        },
      })),
    [data, score2Name],
  );
  const series = useMemo(
    () => [
      { id: "score1", label: score1Name, color: colors.score1 },
      ...(score2Name
        ? [
            {
              id: "score2",
              label: score2Name,
              color: colors.score2 ?? colors.score1,
            },
          ]
        : []),
    ],
    [score1Name, score2Name, colors],
  );

  if (chartData.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
        No time series data available
      </div>
    );
  }
  if (
    !chartData.some(
      (item) =>
        item.values.score1 != null ||
        (score2Name && item.values.score2 != null),
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
        tickFormatter: (value) =>
          formatChartTimestamp(value, interval, timeRange),
        tooltipFormatter: (value) =>
          formatChartTooltipTimestamp(value, interval, timeRange),
      }}
      valueFormatter={compactNumberFormatter}
      showDataPointDots
      connectNulls
      legend={{
        visibility: "visible",
        interaction: score2Name ? "toggle" : "highlight",
        summary: "none",
      }}
    />
  );
}
