import { useMemo, useState, useCallback } from "react";
import { Bar, BarChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";

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

  // Visibility state for interactive legend (comparison mode only)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Create visibility state object for legend
  const visibilityState = useMemo(() => {
    if (!isComparisonMode) return undefined;
    return {
      pv: !hiddenKeys.has("pv"),
      uv: !hiddenKeys.has("uv"),
    };
  }, [hiddenKeys, isComparisonMode]);

  // Toggle handler
  const handleVisibilityToggle = useCallback(
    (key: string, visible: boolean) => {
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        if (visible) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [],
  );

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
          fill={config.pv.color}
          fillOpacity={hiddenKeys.has("pv") ? 0 : 1}
          radius={[4, 4, 0, 0]}
        />
        {isComparisonMode && (
          <Bar
            dataKey="uv"
            fill={config.uv?.color}
            fillOpacity={hiddenKeys.has("uv") ? 0 : 1}
            radius={[4, 4, 0, 0]}
          />
        )}

        <Legend
          content={
            <ScoreChartLegendContent
              interactive={isComparisonMode}
              visibilityState={visibilityState}
              onVisibilityChange={handleVisibilityToggle}
            />
          }
        />
      </BarChart>
    </ChartContainer>
  );
}
