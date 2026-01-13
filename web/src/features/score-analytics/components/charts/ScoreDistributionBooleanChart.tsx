import { useMemo, useState, useCallback } from "react";
import { Bar, BarChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";
import { ScoreChartTooltip } from "../../lib/ScoreChartTooltip";

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

  // Detect if we have namespaced category keys (e.g., "Color (annotation): True")
  // This happens in "all" and "matched" tabs when comparing scores
  const namespacedKeys = useMemo(() => {
    const colorKeys = Object.keys(colors);
    // Check if any key contains ":" which indicates namespacing
    const hasNamespacing = colorKeys.some((key) => key.includes(":"));

    if (!hasNamespacing) {
      return null;
    }

    // Extract namespaced keys for each category
    const keys: Record<string, string[]> = {};
    categories.forEach((category) => {
      keys[category] = colorKeys.filter((key) => key.endsWith(`: ${category}`));
    });

    return keys;
  }, [colors, categories]);

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
          // Use namespaced keys if available, otherwise fall back to pv/uv
          if (namespacedKeys && namespacedKeys[label]) {
            const keys = namespacedKeys[label];
            const score1Key = keys[0] ?? "pv";
            const score2Key = keys[1] ?? "uv";

            return {
              name: label,
              [score1Key]: item.count,
              [score2Key]: dist2Map.get(item.binIndex) ?? 0,
            };
          }

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
  }, [
    distribution1,
    distribution2,
    categories,
    isComparisonMode,
    namespacedKeys,
  ]);

  // Extract actual dataKeys being used in the chart
  const dataKeys = useMemo(() => {
    if (!isComparisonMode) {
      return { score1Key: "pv", score2Key: null };
    }

    // If we have namespaced keys, use the first category's keys as representative
    if (namespacedKeys && categories.length > 0) {
      const firstCategory = categories[0];
      const keys = namespacedKeys[firstCategory];
      if (keys && keys.length >= 2) {
        return { score1Key: keys[0], score2Key: keys[1] };
      }
    }

    // Fall back to pv/uv
    return { score1Key: "pv", score2Key: "uv" };
  }, [isComparisonMode, namespacedKeys, categories]);

  // Visibility state for interactive legend (comparison mode only)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Create visibility state object for legend
  const visibilityState = useMemo(() => {
    if (!isComparisonMode) return undefined;
    return {
      [dataKeys.score1Key]: !hiddenKeys.has(dataKeys.score1Key),
      ...(dataKeys.score2Key && {
        [dataKeys.score2Key]: !hiddenKeys.has(dataKeys.score2Key),
      }),
    };
  }, [hiddenKeys, isComparisonMode, dataKeys]);

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

  // Build chart config
  const config: ChartConfig = useMemo(() => {
    // If we have namespaced keys, use them with their colors
    if (namespacedKeys && isComparisonMode) {
      const cfg: ChartConfig = {};

      // Add config for score1Key
      cfg[dataKeys.score1Key] = {
        label: dataKeys.score1Key,
        color: colors[dataKeys.score1Key] || Object.values(colors)[0],
      };

      // Add config for score2Key if it exists
      if (dataKeys.score2Key) {
        cfg[dataKeys.score2Key] = {
          label: dataKeys.score2Key,
          color: colors[dataKeys.score2Key] || Object.values(colors)[1],
        };
      }

      return cfg;
    }

    // Fall back to original logic without namespacing
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
  }, [
    isComparisonMode,
    score1Name,
    score2Name,
    colors,
    namespacedKeys,
    dataKeys,
  ]);

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
          axisLine={{ stroke: "hsl(var(--border) / 0.5)" }}
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
        <Bar
          dataKey={dataKeys.score1Key}
          fill={config[dataKeys.score1Key]?.color}
          fillOpacity={hiddenKeys.has(dataKeys.score1Key) ? 0 : 1}
          radius={[4, 4, 0, 0]}
        />
        {isComparisonMode && dataKeys.score2Key && (
          <Bar
            dataKey={dataKeys.score2Key}
            fill={config[dataKeys.score2Key]?.color}
            fillOpacity={hiddenKeys.has(dataKeys.score2Key) ? 0 : 1}
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
