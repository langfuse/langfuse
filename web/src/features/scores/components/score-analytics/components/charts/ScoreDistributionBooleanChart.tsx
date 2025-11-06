import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartTooltip } from "../../libs/ScoreChartTooltip";

interface BooleanChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  categories: string[]; // Should always be ["False", "True"]
  score1Name: string;
  score2Name?: string;
  colors: Record<string, string>;
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
  colors,
}: BooleanChartProps) {
  const isComparisonMode = Boolean(distribution2 && score2Name);

  // Transform data for Recharts - grouped bars
  const chartData = useMemo(() => {
    const dist2Map = distribution2
      ? new Map(distribution2.map((d) => [d.binIndex, d.count]))
      : null;

    return [...distribution1]
      .sort((a, b) => a.binIndex - b.binIndex)
      .map((item) => {
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

  // Build chart config - use average color from boolean values
  const config: ChartConfig = useMemo(() => {
    // For boolean charts, use the first color we can find (True or False)
    const firstColor =
      colors["True"] || colors["False"] || Object.values(colors)[0];

    const cfg: ChartConfig = {
      pv: {
        label: score1Name,
        color: firstColor,
      },
    };

    if (isComparisonMode && score2Name) {
      cfg.uv = {
        label: score2Name,
        color:
          colors["__score2_True"] ||
          colors["__score2_False"] ||
          Object.values(colors)[1] ||
          firstColor,
      };
    }

    return cfg;
  }, [isComparisonMode, score1Name, score2Name, colors]);

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
          interval={0}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value.toLocaleString()}
        />
        <ChartTooltip
          content={
            <ScoreChartTooltip
              valueFormatter={(value) => value.toLocaleString()}
              labelFormatter={(label) => String(label)}
            />
          }
        />
        <Bar dataKey="pv" fill={config.pv.color} radius={[4, 4, 0, 0]} />
        {isComparisonMode && (
          <Bar dataKey="uv" fill={config.uv?.color} radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ChartContainer>
  );
}
