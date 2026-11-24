import { useMemo } from "react";

import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { type NotebookBlock } from "@/src/features/notebooks/schema";
import {
  type ChartProps,
  type DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { parseChartTimestamp } from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { usePreparedWidgetChart } from "@/src/features/widgets/components/usePreparedWidgetChart";

type ChartBlock = Extract<NotebookBlock, { schema: "chart@1" }>;

export function useNotebookMetricVisualization({
  field,
  label,
  rows,
  dimensions,
  hasTimeDimension,
  kind,
}: {
  field: string;
  label: string;
  rows: Record<string, unknown>[];
  dimensions: ChartBlock["props"]["query"]["dimensions"];
  hasTimeDimension: boolean;
  kind: Exclude<ChartBlock["props"]["display"]["kind"], "big-number">;
}): Visualization {
  const { data, config } = useMemo(() => {
    const config: NonNullable<ChartProps["config"]> = {};
    const data = rows.flatMap<DataPoint>((row) => {
      const rawValue = row[field];
      const value =
        typeof rawValue === "string" && rawValue.trim() !== ""
          ? Number(rawValue)
          : rawValue;
      const metric =
        typeof value === "number" && Number.isFinite(value) ? value : null;
      const values = dimensions.map(({ field }) => row[field]);
      const time = hasTimeDimension
        ? parseChartTimestamp(row.time_dimension)
        : null;
      if (hasTimeDimension && !time) return [];

      if (
        time &&
        values.length > 0 &&
        values.every((value) => value == null || value === "") &&
        metric === null
      ) {
        return [
          { time_dimension: time.toISOString(), dimension: undefined, metric },
        ];
      }

      const category = dimensions
        .map(({ field }, index) => `${field}: ${String(values[index] ?? "—")}`)
        .join(" · ");
      // Series IDs must not collide with object keys used by the chart preparer.
      const series = `series:${category}`;
      config[series] = { label: time && category ? category : label };

      return [
        {
          time_dimension: time?.toISOString() ?? (category || "Total"),
          dimension: time || kind === "line" ? series : category || "Total",
          metric,
        },
      ];
    });
    return { data, config };
  }, [dimensions, field, hasTimeDimension, kind, label, rows]);

  const chartType = (() => {
    if (kind === "line") return "LINE_TIME_SERIES";
    return hasTimeDimension ? "BAR_TIME_SERIES" : "VERTICAL_BAR";
  })();
  const prepared = usePreparedWidgetChart({
    data,
    config,
    chartType,
    chartConfig: { type: chartType, show_data_point_dots: data.length <= 20 },
    active: true,
    zeroBaseline: true,
    rowLimit: data.length,
  });
  if (prepared.confirmation) {
    return prepared.confirmation;
  }
  if (isChartDataEmpty(data)) return { type: "empty" };
  if (prepared.visualization.type === "stacked-bar") {
    return { ...prepared.visualization, type: "grouped-bar" };
  }
  return prepared.visualization;
}
