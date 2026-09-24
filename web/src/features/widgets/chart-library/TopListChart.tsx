import { HorizontalBarChart } from "@/src/components/design-system/charts/HorizontalBarChart/HorizontalBarChart";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

export function TopListChart({
  data,
  config,
  metricFormatter = formatMetric,
}: ChartProps) {
  return (
    <HorizontalBarChart
      data={(data ?? []).map((row) => ({
        label: row.dimension ?? "n/a",
        value:
          typeof row.metric === "number" ? row.metric : Number(row.metric ?? 0),
      }))}
      valueFormatter={(value) =>
        toFullMetricString(metricFormatter(value, { style: "compact" }))
      }
      color={config?.metric?.color ?? "hsl(var(--chart-1))"}
    />
  );
}
