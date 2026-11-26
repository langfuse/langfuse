import { type MultiQueryTab } from "@langfuse/shared/dashboards";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { type MetricFormatterFunction } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  parseMetricUnit,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { type MultiQuerySeries, type MultiQueryValue } from "./multiQueryModel";

export const multiQueryFormatter =
  (unit: string | undefined): MetricFormatterFunction =>
  (value, options) => {
    const formatted = formatMetric(value, {
      ...options,
      unit: parseMetricUnit(unit),
    });
    return unit === "percent"
      ? { ...formatted, suffix: (formatted.suffix ?? "") + "%" }
      : formatted;
  };
const formatMultiQueryValue = (
  value: number | null,
  unit: string | undefined,
) =>
  value === null
    ? "—"
    : toFullMetricString(multiQueryFormatter(unit)(value, { style: "full" }));

export function prepareMultiQueryUnitVisualization(
  config: MultiQueryTab,
  series: MultiQuerySeries[],
  rows: MultiQueryValue[],
  prepared: { visualization: Visualization; confirmation?: Visualization },
): Visualization {
  const unit = series[0]?.unit;
  if (config.display.chartType === "NUMBER") {
    const value = rows[0]?.value;
    return value === null || value === undefined
      ? { type: "empty", message: "No measured value" }
      : { type: "number", value, valueFormatter: multiQueryFormatter(unit) };
  }
  if (
    series.length > 0 &&
    rows.length > 0 &&
    series.every((item) => item.aggregation === "count") &&
    rows.every((item) => item.value === 0)
  ) {
    return {
      type: "empty",
      message: "0 matching records",
      description: "Try a wider time range or change the filters.",
    };
  }
  if (prepared.confirmation) return prepared.confirmation;
  if (config.display.chartType === "HISTOGRAM")
    return {
      type: "histogram",
      data: rows.map((row) => ({
        label: row.bin ?? "Unknown bin",
        value: row.value,
      })),
      valueFormatter: (value) => formatMultiQueryValue(value, "integer"),
      color: series[0]?.fillColor,
    };
  const content = prepared.visualization;
  const byId = new Map(series.map((series) => [series.id, series]));
  if (
    content.type === "line" ||
    content.type === "area" ||
    content.type === "stacked-bar"
  )
    return {
      ...content,
      legend: { visibility: "hidden" },
      series: content.series.map((item) => {
        const original = byId.get(item.id);
        return original
          ? {
              ...item,
              color:
                content.type === "stacked-bar"
                  ? original.fillColor
                  : original.color,
              fillColor: original.fillColor,
            }
          : item;
      }),
    };
  const seriesOrder = new Map(
    series.map((series, index) => [series.id, index]),
  );
  const ordered = [...rows];
  if (
    content.type === "horizontal-bar" &&
    !rows.some(
      (row) =>
        config.queries.find((query) => query.id === row.queryId)?.orderBy
          ?.length,
    )
  )
    ordered.sort((a, b) => {
      if (a.value === null && b.value !== null) return 1;
      if (b.value === null && a.value !== null) return -1;
      return (
        (b.value ?? 0) - (a.value ?? 0) ||
        (seriesOrder.get(a.seriesId) ?? 0) - (seriesOrder.get(b.seriesId) ?? 0)
      );
    });
  if (content.type === "bar" || content.type === "horizontal-bar")
    return {
      ...content,
      data: ordered.map((row) => ({
        label: byId.get(row.seriesId)?.label ?? row.queryLabel,
        value: row.value,
        color: byId.get(row.seriesId)?.fillColor,
      })),
      ...(content.type === "bar" ? { legend: undefined } : {}),
    };
  if (content.type === "pie" && content.variant !== "loading")
    return {
      ...content,
      data: ordered
        .sort(
          (a, b) =>
            (seriesOrder.get(a.seriesId) ?? 0) -
            (seriesOrder.get(b.seriesId) ?? 0),
        )
        .flatMap((row) =>
          row.value !== null && row.value >= 0
            ? [
                {
                  label: byId.get(row.seriesId)?.label ?? row.queryLabel,
                  value: row.value,
                  color: byId.get(row.seriesId)?.fillColor,
                },
              ]
            : [],
        ),
    };
  return content;
}
