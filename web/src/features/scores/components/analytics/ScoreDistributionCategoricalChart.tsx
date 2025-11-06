import { useMemo, useState, useCallback } from "react";
import { Bar, BarChart, XAxis, YAxis, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { ScoreChartLegendContent } from "./ScoreChartLegendContent";
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

    // Separate regular categories from __unmatched__
    // This ensures __unmatched__ is always last for consistent color assignment
    const regularStacks = Array.from(
      new Set([...Array.from(stacksFromData), ...score2Categories]),
    )
      .filter((key) => key !== "__unmatched__")
      .sort();

    // Add __unmatched__ at the end if it exists in the actual data
    // Don't add it based on score2Categories since that never includes __unmatched__
    const hasUnmatched = stacksFromData.has("__unmatched__");

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
        grouped.get(item.score1Category)![item.score2Stack] = item.count;
      });

      // Normalize: ensure every category has all stack keys, even if count is 0
      return Array.from(grouped.entries())
        .sort()
        .map(([category, stacks]) => {
          const normalizedStacks: Record<string, number> = {};
          allStackKeys.forEach((stackKey) => {
            normalizedStacks[stackKey] = stacks[stackKey] ?? 0;
          });
          return {
            name: category,
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

  const hasManyCategories = chartData.length > 10;

  // Configure chart colors and config
  const config: ChartConfig = useMemo(() => {
    if (hasStackedData && allStackKeys.length > 0) {
      // Stacked mode: create config for all stack keys including __unmatched__
      const chartColors = [
        "hsl(var(--chart-1))",
        "hsl(var(--chart-2))",
        "hsl(var(--chart-3))",
        "hsl(var(--chart-4))",
        "hsl(var(--chart-5))",
      ];

      const stackConfig: ChartConfig = {};
      allStackKeys.forEach((key, index) => {
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
  }, [hasStackedData, allStackKeys, score1Name]);

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

  // Toggle handler with safety check (prevent hiding all items)
  const handleVisibilityToggle = useCallback(
    (key: string, visible: boolean) => {
      // Prevent hiding the last visible item
      if (!visible) {
        const visibleCount = allStackKeys.filter(
          (k) => !hiddenKeys.has(k),
        ).length;
        if (visibleCount <= 1) {
          return;
        }
      }

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
    [hiddenKeys, allStackKeys],
  );

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
          allStackKeys.map((stackKey) => {
            const isHidden = hiddenKeys.has(stackKey);

            return (
              <Bar
                key={stackKey}
                dataKey={stackKey}
                stackId="stack"
                fill={config[stackKey]?.theme?.light ?? "hsl(var(--chart-1))"}
                fillOpacity={isHidden ? 0 : 1}
                radius={[0, 0, 0, 0]}
              />
            );
          })}
        {!hasStackedData && (
          <Bar
            key="pv"
            dataKey="pv"
            fill="hsl(var(--chart-3))"
            radius={[4, 4, 0, 0]}
          />
        )}

        {hasStackedData && (
          <Legend
            content={
              <ScoreChartLegendContent
                interactive={true}
                visibilityState={visibilityState}
                onVisibilityChange={handleVisibilityToggle}
              />
            }
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}
