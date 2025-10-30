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

interface NumericChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  binLabels: string[];
  score1Name: string;
  score2Name?: string;
}

/**
 * Numeric distribution chart component
 * Renders bar charts for numeric score distributions
 * - Single score: One bar per bin with hover effects
 * - Two scores: Grouped bars (side-by-side) for comparison
 */
export function ScoreDistributionNumericChart({
  distribution1,
  distribution2,
  binLabels,
  score1Name,
  score2Name,
}: NumericChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const isComparisonMode = Boolean(distribution2 && score2Name);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    const dist2Map = distribution2
      ? new Map(distribution2.map((d) => [d.binIndex, d.count]))
      : null;

    return distribution1.map((item) => {
      const label = binLabels[item.binIndex] ?? `Bin ${item.binIndex}`;

      if (isComparisonMode && dist2Map) {
        // Two score mode: create object with both scores
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
    binLabels,
    score1Name,
    score2Name,
    isComparisonMode,
  ]);

  // Configure colors and chart config
  const colors = getTwoScoreColors();
  const singleColor = getSingleScoreColor();
  const config: ChartConfig = isComparisonMode
    ? getTwoScoreChartConfig(score1Name, score2Name!)
    : getSingleScoreChartConfig("metric");

  const hasManyBins = chartData.length > 10;

  return (
    <ChartContainer
      config={config}
      className="[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-transparent"
    >
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ bottom: hasManyBins ? 60 : 20 }}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <XAxis
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          angle={hasManyBins ? -45 : 0}
          textAnchor={hasManyBins ? "end" : "middle"}
          height={hasManyBins ? 90 : 30}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />

        {isComparisonMode ? (
          // Grouped bars for comparison mode
          <>
            <Bar
              dataKey={score1Name}
              fill={colors.score1}
              radius={[4, 4, 0, 0]}
              onMouseEnter={(_, index) => setActiveIndex(index)}
            />
            <Bar
              dataKey={score2Name!}
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
