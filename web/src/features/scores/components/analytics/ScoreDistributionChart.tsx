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
  getSingleScoreColor,
  getBarChartHoverOpacity,
} from "@/src/features/scores/lib/color-scales";

export interface ScoreDistributionChartProps {
  data: Array<{ binIndex: number; count: number }>;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  scoreName: string;
  totalCount: number;
  // For numeric scores, provide bin labels
  binLabels?: string[];
  // For categorical scores, provide category names
  categories?: string[];
}

export function ScoreDistributionChart({
  data,
  dataType,
  binLabels,
  categories,
}: ScoreDistributionChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Debug logging
  console.log("[ScoreDistributionChart] Rendering:", {
    dataLength: data.length,
    dataType,
    binLabels: binLabels?.length,
    categories: categories?.length,
  });

  // Transform data for Recharts
  const chartData = useMemo(() => {
    const transformed = data.map((item) => {
      let label: string;

      if (dataType === "NUMERIC" && binLabels) {
        // Use bin labels for numeric scores
        label = binLabels[item.binIndex] ?? `Bin ${item.binIndex}`;
      } else if (
        (dataType === "CATEGORICAL" || dataType === "BOOLEAN") &&
        categories
      ) {
        // Use category names for categorical/boolean scores
        label = categories[item.binIndex] ?? `Category ${item.binIndex}`;
      } else {
        // Fallback
        label = `${item.binIndex}`;
      }

      return {
        dimension: label,
        metric: item.count,
      };
    });
    console.log("[ScoreDistributionChart] Transformed data:", transformed);
    return transformed;
  }, [data, dataType, binLabels, categories]);

  const config: ChartConfig = getSingleScoreChartConfig("metric");

  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No distribution data available
      </div>
    );
  }

  // Use angled labels if there are many categories
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
        <Bar
          dataKey="metric"
          radius={[4, 4, 0, 0]}
          onMouseEnter={(_, index) => setActiveIndex(index)}
        >
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getSingleScoreColor()}
              fillOpacity={getBarChartHoverOpacity(
                index === activeIndex,
                activeIndex !== null,
              )}
            />
          ))}
        </Bar>
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </BarChart>
    </ChartContainer>
  );
}
