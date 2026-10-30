import { useMemo } from "react";
import { GroupedBarChart } from "@/src/components/design-system/charts/GroupedBarChart/GroupedBarChart";

interface BooleanChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  categories: string[];
  score1Name: string;
  score2Name?: string;
  colors: Record<string, string>;
}

export function ScoreDistributionBooleanChart({
  distribution1,
  distribution2,
  categories,
  score1Name,
  score2Name,
  colors,
}: BooleanChartProps) {
  const comparison = Boolean(distribution2 && score2Name);
  const data = useMemo(() => {
    const second = new Map(
      distribution2?.map((item) => [item.binIndex, item.count]),
    );
    return [...distribution1]
      .sort((a, b) => a.binIndex - b.binIndex)
      .map((item) => ({
        key: categories[item.binIndex] ?? `Value ${item.binIndex}`,
        values: {
          score1: item.count,
          ...(comparison ? { score2: second.get(item.binIndex) ?? 0 } : {}),
        },
      }));
  }, [distribution1, distribution2, categories, comparison]);
  const category = categories[0] ?? "False";
  const score1Key = `${score1Name}: ${category}`;
  const score2Key = score2Name ? `${score2Name}: ${category}` : undefined;
  const firstColor =
    colors.score1 ??
    colors[score1Key] ??
    colors.True ??
    colors.False ??
    Object.values(colors)[0];
  const secondColor =
    colors.score2 ??
    (score2Key ? colors[score2Key] : undefined) ??
    colors.__score2_True ??
    colors.__score2_False;
  const series = [
    {
      id: "score1",
      label: score1Name,
      color: firstColor ?? "hsl(var(--chart-1))",
    },
    ...(comparison
      ? [
          {
            id: "score2",
            label: score2Name ?? "Score 2",
            color: secondColor ?? "hsl(var(--chart-2))",
          },
        ]
      : []),
  ];
  return (
    <GroupedBarChart
      data={data}
      series={series}
      legend={{
        visibility: "visible",
        interaction: comparison ? "toggle" : "highlight",
        summary: "none",
      }}
    />
  );
}
