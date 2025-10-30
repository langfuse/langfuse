import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import {
  getSingleScoreChartConfig,
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

  const hasManyCategories = chartData.length > 10;

  // Configure chart labels for tooltip
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
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ bottom: hasManyCategories ? 60 : 20 }}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <XAxis
          dataKey="name"
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
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Bar
          dataKey="pv"
          fill="hsl(var(--chart-3))"
          radius={[4, 4, 0, 0]}
          onMouseEnter={(_, index) => setActiveIndex(index)}
        />
        {isComparisonMode && (
          <Bar
            dataKey="uv"
            fill="hsl(var(--chart-2))"
            radius={[4, 4, 0, 0]}
            onMouseEnter={(_, index) => setActiveIndex(index)}
          />
        )}
      </BarChart>
    </ChartContainer>
  );

  /* COMMENTED OUT - Original implementation
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
        // Two score mode: use simple keys to avoid CSS variable name issues
        return {
          dimension: label,
          score1: item.count,
          score2: dist2Map.get(item.binIndex) ?? 0,
        };
      } else {
        // Single score mode
        return {
          dimension: label,
          metric: item.count,
        };
      }
    });
  }, [distribution1, distribution2, categories, isComparisonMode]);

  // Configure colors and chart config
  const colors = getTwoScoreColors();
  const singleColor = getSingleScoreColor();
  const config: ChartConfig = isComparisonMode
    ? {
        score1: {
          label: score1Name,
          theme: {
            light: colors.score1,
            dark: colors.score1,
          },
        },
        score2: {
          label: score2Name,
          theme: {
            light: colors.score2,
            dark: colors.score2,
          },
        },
      }
    : getSingleScoreChartConfig("metric");

  const hasManyCategories = chartData.length > 10;

  return (
    <ChartContainer
      config={config}
      className="[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-transparent"
    >
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
              dataKey="score1"
              stackId="comparison"
              fill={colors.score1}
              radius={[0, 0, 0, 0]}
              onMouseEnter={(_, index) => setActiveIndex(index)}
            />
            <Bar
              dataKey="score2"
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
  */
}
