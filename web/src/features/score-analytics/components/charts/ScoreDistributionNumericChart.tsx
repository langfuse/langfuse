import { useMemo, useState, useCallback } from "react";
import { Bar, BarChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { ScoreChartTooltip } from "../../lib/ScoreChartTooltip";

interface NumericChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  binLabels: string[];
  score1Name: string;
  score2Name?: string;
  colors: { score1: string; score2?: string };
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
  colors,
}: NumericChartProps) {
  const isComparisonMode = Boolean(distribution2 && score2Name);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    const dist2Map = distribution2
      ? new Map(distribution2.map((d) => [d.binIndex, d.count]))
      : null;

    return [...distribution1]
      .sort((a, b) => a.binIndex - b.binIndex)
      .map((item) => {
        const label = binLabels[item.binIndex] ?? `Bin ${item.binIndex}`;

        if (isComparisonMode && dist2Map) {
          // Two score mode: use simple keys to avoid CSS variable name issues
          return {
            dimension: label,
            pv: item.count,
            uv: dist2Map.get(item.binIndex) ?? 0,
          };
        } else {
          // Single score mode - also use 'pv' for consistency with Bar dataKey
          return {
            dimension: label,
            pv: item.count,
          };
        }
      });
  }, [distribution1, distribution2, binLabels, isComparisonMode]);

  // Configure chart config
  const config: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {
      pv: {
        label: score1Name,
        color: colors.score1,
      },
    };

    if (isComparisonMode && score2Name) {
      cfg.uv = {
        label: score2Name,
        color: colors.score2,
      };
    }

    return cfg;
  }, [isComparisonMode, score1Name, score2Name, colors]);

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

  return (
    <ChartContainer
      config={config}
      className="[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-transparent"
    >
      <BarChart accessibilityLayer data={chartData} margin={{ bottom: 20 }}>
        <XAxis
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: "hsl(var(--border) / 0.5)" }}
          interval={1}
        />
        <YAxis
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => compactNumberFormatter(value)}
        />
        <ChartTooltip
          content={
            <ScoreChartTooltip
              valueFormatter={compactNumberFormatter}
              labelFormatter={(label) => String(label)}
            />
          }
        />

        <Bar
          dataKey="pv"
          fill={colors.score1}
          fillOpacity={hiddenKeys.has("pv") ? 0 : 1}
          radius={[4, 4, 0, 0]}
        />

        {isComparisonMode && (
          <Bar
            dataKey="uv"
            fill={colors.score2}
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
