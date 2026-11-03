import { useMemo } from "react";
import { GroupedBarChart } from "@/src/components/design-system/charts/GroupedBarChart/GroupedBarChart";
import { compactNumberFormatter } from "@/src/utils/numbers";

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
  const data = useMemo(() => {
    const second = new Map(
      distribution2?.map((item) => [item.binIndex, item.count]),
    );
    return [...distribution1]
      .sort((a, b) => a.binIndex - b.binIndex)
      .map((item) => ({
        key: binLabels[item.binIndex] ?? `Bin ${item.binIndex}`,
        values: {
          score1: item.count,
          ...(comparison ? { score2: second.get(item.binIndex) ?? 0 } : {}),
        },
      }));
  }, [distribution1, distribution2, binLabels, comparison]);
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
      data={data}
      series={series}
      valueFormatter={compactNumberFormatter}
      legend={{
        visibility: "visible",
        interaction: comparison ? "toggle" : "highlight",
        summary: "none",
      }}
    />
  );
}
