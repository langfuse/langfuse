import { useMemo, useState, useCallback } from "react";
import { Bar, BarChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";
import { ScoreChartTooltip } from "../../lib/ScoreChartTooltip";

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
  score2Name,
  score2Source,
  colors,
}: CategoricalChartProps) {
  const hasStackedData = Boolean(
    stackedDistribution && stackedDistribution.length > 0,
  );

  // Helper: Check if a key represents an unmatched category
  // Backend can send: "__unmatched__", "0", "", or null
  const isUnmatchedKey = (key: string): boolean => {
    return (
      key === "__unmatched__" || key === "0" || key === "" || key === "null"
    );
  };

  // Calculate all possible stack keys from actual data
  // This ensures we include ALL categories present in the data, including those
  // not in score2Categories (e.g., "0" or other values) and __unmatched__
  const allStackKeys = useMemo(() => {
    if (!hasStackedData || !stackedDistribution || !score2Categories) {
      return [];
    }

    // Extract all unique score2 stack values from the actual data
    const stacksFromData = new Set<string>();
    stackedDistribution.forEach((item) => {
      stacksFromData.add(item.score2Stack);
    });

    // Normalize all unmatched variations to "__unmatched__" for consistent handling
    const normalizedStacks = Array.from(stacksFromData).map((key) =>
      isUnmatchedKey(key) ? "__unmatched__" : key,
    );

    // Separate regular categories from __unmatched__
    // This ensures __unmatched__ is always last for consistent color assignment
    const regularStacks = Array.from(
      new Set([...normalizedStacks, ...score2Categories]),
    )
      .filter((key) => key !== "__unmatched__")
      .sort(); // Sort alphabetically for stable color assignment

    // Add __unmatched__ at the end if it exists in the actual data
    const hasUnmatched = normalizedStacks.includes("__unmatched__");

    return hasUnmatched ? [...regularStacks, "__unmatched__"] : regularStacks;
  }, [hasStackedData, stackedDistribution, score2Categories]);

  // Transform data for Recharts
  const chartData = useMemo(() => {
    // If we have stacked distribution data (two-score comparison)
    if (hasStackedData && stackedDistribution && score2Categories) {
      const grouped = new Map<string, Record<string, number>>();

      stackedDistribution.forEach((item) => {
        if (!grouped.has(item.score1Category)) {
          grouped.set(item.score1Category, {});
        }
        // Normalize unmatched keys to "__unmatched__"
        const normalizedKey = isUnmatchedKey(item.score2Stack)
          ? "__unmatched__"
          : item.score2Stack;
        grouped.get(item.score1Category)![normalizedKey] = item.count;
      });

      // Normalize: ensure every category has all stack keys, even if count is 0
      return Array.from(grouped.entries())
        .sort((a, b) => {
          // Put __unmatched__ last (rightmost column)
          if (a[0] === "__unmatched__") return 1;
          if (b[0] === "__unmatched__") return -1;
          return a[0].localeCompare(b[0]);
        })
        .map(([category, stacks]) => {
          const normalizedStacks: Record<string, number> = {};
          allStackKeys.forEach((stackKey) => {
            normalizedStacks[stackKey] = stacks[stackKey] ?? 0;
          });
          return {
            name: category === "__unmatched__" ? "no match" : category,
            ...normalizedStacks,
          };
        });
    }

    // Single score: simple bar chart
    return [...distribution1]
      .sort((a, b) => a.binIndex - b.binIndex)
      .map((item) => {
        const label = categories[item.binIndex] ?? `Category ${item.binIndex}`;
        return {
          name: label,
          pv: item.count,
        };
      });
  }, [
    distribution1,
    categories,
    hasStackedData,
    stackedDistribution,
    score2Categories,
    allStackKeys,
  ]);

  // Visibility state for interactive legend (stacked mode only)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Create visibility state object for legend
  const visibilityState = useMemo(() => {
    if (!hasStackedData) return {};
    const state: Record<string, boolean> = {};
    allStackKeys.forEach((key) => {
      state[key] = !hiddenKeys.has(key);
    });
    return state;
  }, [hiddenKeys, hasStackedData, allStackKeys]);

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

  // Configure chart colors and config using provided colors
  const config: ChartConfig = useMemo(() => {
    if (hasStackedData && allStackKeys.length > 0) {
      // Stacked mode: create config for all stack keys using color mappings
      const stackConfig: ChartConfig = {};
      allStackKeys.forEach((key) => {
        // Special handling for unmatched category
        if (key === "__unmatched__") {
          stackConfig[key] = {
            label: "no match",
            color: "hsl(var(--muted))", // Light grey for unmatched
          };
          return;
        }

        // Try namespaced key first (for when score1 and score2 have same category names)
        // Format: "ScoreName (source): category"
        let color: string | undefined;

        if (score2Name && score2Source) {
          const namespacedKey = `${score2Name} (${score2Source}): ${key}`;
          color = colors[namespacedKey];
        }

        // Fallback to non-namespaced key
        if (!color) {
          color = colors[key];
        }

        // Final fallback to first available color
        if (!color) {
          color = Object.values(colors)[0];
        }

        stackConfig[key] = {
          label: key,
          color,
        };
      });
      return stackConfig;
    }

    // Single score mode: use score name as label (category shown via custom tooltip)
    const firstColor = categories[0]
      ? colors[categories[0]]
      : Object.values(colors)[0];
    return {
      pv: {
        label: score1Name,
        color: firstColor,
      },
    };
  }, [
    hasStackedData,
    allStackKeys,
    score1Name,
    score2Name,
    score2Source,
    colors,
    categories,
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

        {hasStackedData &&
          allStackKeys.map((stackKey) => {
            const isHidden = hiddenKeys.has(stackKey);
            return (
              <Bar
                key={stackKey}
                dataKey={stackKey}
                stackId="stack"
                fill={config[stackKey]?.color ?? "hsl(var(--chart-1))"}
                fillOpacity={isHidden ? 0 : 1}
                radius={[0, 0, 0, 0]}
              />
            );
          })}
        {!hasStackedData && (
          <Bar
            key="pv"
            dataKey="pv"
            fill={config.pv.color}
            radius={[4, 4, 0, 0]}
          />
        )}

        <Legend
          content={
            <ScoreChartLegendContent
              interactive={hasStackedData}
              visibilityState={visibilityState}
              onVisibilityChange={handleVisibilityToggle}
            />
          }
        />
      </BarChart>
    </ChartContainer>
  );
}
