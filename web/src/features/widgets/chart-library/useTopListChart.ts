import { type ComponentProps } from "react";
import { type HorizontalBarChart } from "@/src/components/design-system/charts/HorizontalBarChart/HorizontalBarChart";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

export function useTopListChart({
  data,
  config,
  metricFormatter = formatMetric,
}: ChartProps) {
  const chart = {
    data: (data ?? []).map((row) => ({
      label: row.dimension ?? "n/a",
      value:
        typeof row.metric === "number" ? row.metric : Number(row.metric ?? 0),
    })),
    valueFormatter: (value: number) =>
      toFullMetricString(metricFormatter(value, { style: "compact" })),
    color: config?.metric?.color ?? "hsl(var(--chart-fill-1))",
  } satisfies ComponentProps<typeof HorizontalBarChart>;
  return { visualization: { type: "horizontal-bar" as const, ...chart } };
}
