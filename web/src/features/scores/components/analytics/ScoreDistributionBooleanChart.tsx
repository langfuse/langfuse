import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import {
  getSingleScoreColor,
  getTwoScoreColors,
} from "@/src/features/scores/lib/color-scales";

interface BooleanChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  categories: string[]; // Should always be ["False", "True"]
  score1Name: string;
  score2Name?: string;
}

/**
 * Boolean distribution chart component
 * Renders bar charts for boolean score distributions
 * - Single score: One bar per value (False/True)
 * - Two scores: Grouped bars for comparison
 */
export function ScoreDistributionBooleanChart({
  distribution1,
  distribution2,
  categories,
  score1Name,
  score2Name,
}: BooleanChartProps) {
  const isComparisonMode = Boolean(distribution2 && score2Name);

  // Transform data for Recharts - grouped bars
  const chartData = useMemo(() => {
    const dist2Map = distribution2
      ? new Map(distribution2.map((d) => [d.binIndex, d.count]))
      : null;

    return distribution1.map((item) => {
      const label = categories[item.binIndex] ?? `Value ${item.binIndex}`;

      if (isComparisonMode && dist2Map) {
        return {
          name: label,
          pv: item.count,
          uv: dist2Map.get(item.binIndex) ?? 0,
        };
      } else {
        return {
          name: label,
          pv: item.count,
        };
      }
    });
  }, [distribution1, distribution2, categories, isComparisonMode]);

  // Configure chart colors
  const colors = getTwoScoreColors();
  const config: ChartConfig = isComparisonMode
    ? {
        pv: {
          label: score1Name,
          theme: {
            light: colors.score1,
            dark: colors.score1,
          },
        },
        uv: {
          label: score2Name,
          theme: {
            light: colors.score2,
            dark: colors.score2,
          },
        },
      }
    : {
        pv: {
          label: score1Name,
          theme: {
            light: getSingleScoreColor(),
            dark: getSingleScoreColor(),
          },
        },
      };

  return (
    <ChartContainer
      config={config}
      className="[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-transparent"
    >
      <BarChart accessibilityLayer data={chartData} margin={{ bottom: 20 }}>
        <XAxis
          dataKey="name"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Bar dataKey="pv" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
        {isComparisonMode && (
          <Bar dataKey="uv" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ChartContainer>
  );
}
