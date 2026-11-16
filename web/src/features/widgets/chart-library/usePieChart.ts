import { useMemo } from "react";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

export function usePieChart({
  data,
  metricFormatter = (value, options) => formatMetric(value, options),
}: Pick<ChartProps, "data" | "metricFormatter">) {
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  const chartData = useMemo(() => {
    return data.map((item) => ({
      label: item.dimension || "Unknown",
      value: typeof item.metric === "number" ? item.metric : 0,
    }));
  }, [data]);

  const chart = { data: chartData, valueFormatter: formatValue };
  return { visualization: { type: "pie" as const, ...chart } };
}
