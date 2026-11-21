import { useMemo } from "react";
import { GroupedBarChart } from "@/src/components/design-system/charts/GroupedBarChart/GroupedBarChart";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { buildNumericDistributionChartData } from "../../lib/score-analytics-transformers";

interface NumericChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  binLabels: string[];
  score1Name: string;
  score2Name?: string;
  colors: { score1: string; score2?: string };
}

export function ScoreDistributionNumericChart({
  distribution1,
  distribution2,
  binLabels,
  score1Name,
  score2Name,
  colors,
}: NumericChartProps) {
  const comparison = Boolean(distribution2 && score2Name);
  const chart = useMemo(
    () =>
      buildNumericDistributionChartData({
        distribution1,
        distribution2: comparison ? distribution2 : undefined,
        binLabels,
      }),
    [distribution1, distribution2, binLabels, comparison],
  );
  const series = useMemo(
    () => [
      { id: "score1", label: score1Name, color: colors.score1 },
      ...(comparison
        ? [
            {
              id: "score2",
              label: score2Name ?? "Score 2",
              color: colors.score2 ?? colors.score1,
            },
          ]
        : []),
    ],
    [score1Name, score2Name, colors, comparison],
  );

  return (
    <GroupedBarChart
      data={chart.data}
      series={series}
      tickFormatter={chart.labelForKey}
      tooltipFormatter={chart.labelForKey}
      valueFormatter={(value) => compactNumberFormatter(value, 1)}
      legend={{
        visibility: "visible",
        interaction: comparison ? "toggle" : "highlight",
        summary: "none",
      }}
    />
  );
}
