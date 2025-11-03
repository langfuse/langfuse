import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { getSingleScoreColor } from "@/src/features/scores/lib/color-scales";

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
}

/**
 * Categorical distribution chart component
 * Renders stacked bar charts for categorical score distributions
 * - Single score: One bar per category
 * - Two scores: Stacked bars showing score2 category breakdown within each score1 category
 */
export function ScoreDistributionCategoricalChart({
  distribution1,
  categories,
  score1Name,
  stackedDistribution,
  score2Categories,
}: CategoricalChartProps) {
  const hasStackedData = Boolean(
    stackedDistribution && stackedDistribution.length > 0,
  );

  // Transform data for Recharts
  const chartData = useMemo(() => {
    // If we have stacked distribution data (two-score comparison)
    if (hasStackedData && stackedDistribution) {
      const grouped = new Map<string, Record<string, number>>();

      stackedDistribution.forEach((item) => {
        if (!grouped.has(item.score1Category)) {
          grouped.set(item.score1Category, {});
        }
        grouped.get(item.score1Category)![item.score2Stack] = item.count;
      });

      return Array.from(grouped.entries())
        .sort()
        .map(([category, stacks]) => ({
          name: category,
          ...stacks,
        }));
    }

    // Single score: simple bar chart
    return distribution1.map((item) => {
      const label = categories[item.binIndex] ?? `Category ${item.binIndex}`;
      return {
        name: label,
        pv: item.count,
      };
    });
  }, [distribution1, categories, hasStackedData, stackedDistribution]);

  const hasManyCategories = chartData.length > 10;

  // Configure chart colors and config
  const config: ChartConfig = useMemo(() => {
    if (hasStackedData && score2Categories) {
      // Stacked mode: create config for all score2 categories + unmatched
      const stackKeys = [...score2Categories, "__unmatched__"];
      const chartColors = [
        "hsl(var(--chart-1))",
        "hsl(var(--chart-2))",
        "hsl(var(--chart-3))",
        "hsl(var(--chart-4))",
        "hsl(var(--chart-5))",
      ];

      const stackConfig: ChartConfig = {};
      stackKeys.forEach((key, index) => {
        stackConfig[key] = {
          label: key === "__unmatched__" ? "Unmatched" : key,
          theme: {
            light:
              key === "__unmatched__"
                ? "hsl(var(--muted-foreground))"
                : chartColors[index % chartColors.length]!,
            dark:
              key === "__unmatched__"
                ? "hsl(var(--muted-foreground))"
                : chartColors[index % chartColors.length]!,
          },
        };
      });
      return stackConfig;
    }

    // Single score mode: simple config
    return {
      pv: {
        label: score1Name,
        theme: {
          light: getSingleScoreColor(),
          dark: getSingleScoreColor(),
        },
      },
    };
  }, [hasStackedData, score2Categories, score1Name]);

  // Get stack keys for stacked mode
  const stackKeys = useMemo(() => {
    if (!hasStackedData || !score2Categories) return [];
    return [...score2Categories, "__unmatched__"];
  }, [hasStackedData, score2Categories]);

  return (
    <ChartContainer
      config={config}
      className="[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-transparent"
    >
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ bottom: hasManyCategories ? 60 : 20 }}
      >
        <XAxis
          dataKey="name"
          stroke="hsl(var(--chart-grid))"
          fontSize={8}
          tickLine={false}
          axisLine={false}
          angle={hasManyCategories ? -45 : 0}
          textAnchor={hasManyCategories ? "end" : "middle"}
          height={hasManyCategories ? 90 : 30}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={8}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />

        {hasStackedData &&
          stackKeys.map((stackKey) => (
            <Bar
              key={stackKey}
              dataKey={stackKey}
              stackId="stack"
              fill={config[stackKey]?.theme?.light ?? "hsl(var(--chart-1))"}
              radius={[0, 0, 0, 0]}
            />
          ))}
        {!hasStackedData && (
          <Bar
            key="pv"
            dataKey="pv"
            fill="hsl(var(--chart-3))"
            radius={[4, 4, 0, 0]}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}
