import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";

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
  // Transform data for Recharts
  const chartData = useMemo(() => {
    return data.map((item) => {
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
  }, [data, dataType, binLabels, categories]);

  const config: ChartConfig = {
    metric: {
      theme: {
        light: "hsl(var(--chart-1))",
        dark: "hsl(var(--chart-1))",
      },
    },
  };

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
          className="fill-[--color-metric]"
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
        />
      </BarChart>
    </ChartContainer>
  );
}
