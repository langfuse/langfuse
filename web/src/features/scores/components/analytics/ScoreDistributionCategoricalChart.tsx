import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import {
  getSingleScoreChartConfig,
  getTwoScoreChartConfig,
  getSingleScoreColor,
  getTwoScoreColors,
  getBarChartHoverOpacity,
} from "@/src/features/scores/lib/color-scales";

interface CategoricalChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  categories: string[];
  score1Name: string;
  score2Name?: string;
}

/**
 * Categorical distribution chart component
 * Renders bar charts for categorical/boolean score distributions
 * - Single score: One bar per category with hover effects
 * - Two scores: Stacked bars for comparison
 */
export function ScoreDistributionCategoricalChart({
  distribution1,
  distribution2,
  categories,
  score1Name,
  score2Name,
}: CategoricalChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const isComparisonMode = Boolean(distribution2 && score2Name);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    const dist2Map = distribution2
      ? new Map(distribution2.map((d) => [d.binIndex, d.count]))
      : null;

    return distribution1.map((item) => {
      const label = categories[item.binIndex] ?? `Category ${item.binIndex}`;

      if (isComparisonMode && dist2Map) {
        // Two score mode: create object with both scores (for stacking)
        return {
          dimension: label,
          [score1Name]: item.count,
          [score2Name!]: dist2Map.get(item.binIndex) ?? 0,
        };
      } else {
        // Single score mode
        return {
          dimension: label,
          metric: item.count,
        };
      }
    });
  }, [
    distribution1,
    distribution2,
    categories,
    score1Name,
    score2Name,
    isComparisonMode,
  ]);

  // Configure colors and chart config
  const colors = getTwoScoreColors();
  console.log("colors", colors);
  console.log(score1Name);
  console.log(score2Name);
  const singleColor = getSingleScoreColor();
  const config: ChartConfig = isComparisonMode
    ? getTwoScoreChartConfig(score1Name, score2Name!)
    : getSingleScoreChartConfig("metric");

  const hasManyCategories = chartData.length > 10;

  return (
    <ChartContainer config={config}>
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ bottom: hasManyCategories ? 60 : 20 }}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <XAxis
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          angle={hasManyCategories ? -45 : 0}
          textAnchor={hasManyCategories ? "end" : "middle"}
          height={hasManyCategories ? 90 : 30}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />

        {isComparisonMode ? (
          // Stacked bars for comparison mode
          <>
            <Bar
              dataKey={score1Name}
              stackId="comparison"
              fill={colors.score1}
              radius={[0, 0, 0, 0]}
              onMouseEnter={(_, index) => setActiveIndex(index)}
            />
            <Bar
              dataKey={score2Name!}
              stackId="comparison"
              fill={colors.score2}
              radius={[4, 4, 0, 0]}
              onMouseEnter={(_, index) => setActiveIndex(index)}
            />
          </>
        ) : (
          // Single bar with hover effect
          <Bar
            dataKey="metric"
            radius={[4, 4, 0, 0]}
            onMouseEnter={(_, index) => setActiveIndex(index)}
          >
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={singleColor}
                fillOpacity={getBarChartHoverOpacity(
                  index === activeIndex,
                  activeIndex !== null,
                )}
              />
            ))}
          </Bar>
        )}

        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </BarChart>
    </ChartContainer>
  );
}
