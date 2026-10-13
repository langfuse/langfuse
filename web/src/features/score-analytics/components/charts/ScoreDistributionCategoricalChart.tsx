import { useMemo } from "react";
import { BarChart } from "@/src/components/design-system/charts/BarChart/BarChart";
import { StackedBarChart } from "@/src/components/design-system/charts/StackedBarChart/StackedBarChart";

interface CategoricalChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  categories: string[];
  score1Name: string;
  stackedDistribution?: Array<{
    score1Category: string;
    score2Stack: string;
    count: number;
  }>;
  score2Categories?: string[];
  score2Name?: string;
  score2Source?: string;
  colors: Record<string, string>;
}

export function ScoreDistributionCategoricalChart({
  distribution1,
  categories,
  score1Name,
  stackedDistribution,
  score2Categories,
  score2Name,
  score2Source,
  colors,
}: CategoricalChartProps) {
  const unmatched = (key: string) =>
    key === "__unmatched__" || key === "0" || key === "" || key === "null";
  const { data, series } = useMemo(() => {
    const stacks = new Set(
      (score2Categories ?? []).filter((key) => !unmatched(key)),
    );
    const grouped = new Map<string, Record<string, number>>();
    for (const item of stackedDistribution ?? []) {
      const key = unmatched(item.score2Stack)
        ? "__unmatched__"
        : item.score2Stack;
      stacks.add(key);
      const values = grouped.get(item.score1Category) ?? {};
      values[key] = (values[key] ?? 0) + item.count;
      grouped.set(item.score1Category, values);
    }
    const keys = [...stacks].filter((key) => key !== "__unmatched__").sort();
    if (stacks.has("__unmatched__")) keys.push("__unmatched__");
    return {
      data: [...grouped]
        .sort(([a], [b]) => {
          if (a === "__unmatched__") return 1;
          if (b === "__unmatched__") return -1;
          return a.localeCompare(b);
        })
        .map(([key, values]) => ({
          key: key === "__unmatched__" ? "no match" : key,
          values: Object.fromEntries(
            keys.map((stack) => [stack, values[stack] ?? 0]),
          ),
        })),
      series: keys.map((key) => ({
        id: key,
        label: key === "__unmatched__" ? "no match" : key,
        color:
          key === "__unmatched__"
            ? "hsl(var(--muted))"
            : (colors[`${score2Name} (${score2Source}): ${key}`] ??
              colors[key] ??
              Object.values(colors)[0] ??
              "hsl(var(--chart-1))"),
      })),
    };
  }, [stackedDistribution, score2Categories, score2Name, score2Source, colors]);

  if (stackedDistribution?.length && score2Categories) {
    return (
      <StackedBarChart
        data={data}
        series={series}
        categoryXAxisLabels
        legend={{
          visibility: "visible",
          interaction: "toggle",
          summary: "none",
        }}
      />
    );
  }
  const firstColor = categories[0]
    ? colors[categories[0]]
    : Object.values(colors)[0];
  return (
    <BarChart
      data={[...distribution1]
        .sort((a, b) => a.binIndex - b.binIndex)
        .map((item) => ({
          label: categories[item.binIndex] ?? `Category ${item.binIndex}`,
          value: item.count,
        }))}
      color={firstColor}
      tooltipValueLabel={score1Name}
      tooltipHeading={(label) => label}
      legend={{
        items: [
          {
            id: "score1",
            label: score1Name,
            color: firstColor ?? "hsl(var(--chart-1))",
          },
        ],
      }}
    />
  );
}
