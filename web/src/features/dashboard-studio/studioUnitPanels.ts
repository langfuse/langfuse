import {
  type StudioSeries,
  type StudioRow,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  type ChartProps,
  type MetricFormatterFunction,
} from "../widgets/chart-library/chart-props";
import {
  parseChartTimestamp,
  prepareTimeAxis,
} from "../widgets/chart-library/prepareTimeAxis";
import { prepareVisibleSeries } from "../widgets/chart-library/prepareVisibleSeries";
import { toFullMetricString } from "../widgets/chart-library/utils";

type PanelColors = Record<
  string,
  { label: string; color: string; fillColor: string }
>;
type PanelVisualization = Extract<
  Visualization,
  { type: "line" | "area" | "stacked-bar" | "bar" | "horizontal-bar" }
>;
type StudioUnitPanel = {
  id: string;
  label: string;
  unit: string | undefined;
  visibleSeries: StudioSeries[];
  colors: PanelColors;
  data: ChartProps["data"];
  visualization: PanelVisualization;
};

export const studioUnitKey = (unit: string | undefined) =>
  unit === "%" ? "percent" : (unit ?? "number");
const unitLabel = (unit: string | undefined) => {
  const labels: Record<string, string> = {
    USD: "US dollars",
    ratio: "Ratio",
    percent: "Percentage",
    milliseconds: "Duration",
    seconds: "Duration (seconds)",
    days: "Days",
    tokens: "Tokens",
    "tokens/s": "Tokens per second",
    observations: "Observations",
    traces: "Traces",
    scores: "Score records",
    users: "Users",
    sessions: "Sessions",
    tools: "Tools",
    calls: "Calls",
    number: "Number",
  };
  return labels[studioUnitKey(unit)] ?? unit ?? "Number";
};

/** Panels share the union of actual buckets; added markers preserve gaps rather than implying measured zeros. */
export function prepareStudioUnitPanels(
  data: ChartProps["data"],
  series: StudioSeries[],
  colors: PanelColors,
  config: StudioWidgetConfig,
  rows: StudioRow[],
  formatterForUnit: (unit: string | undefined) => MetricFormatterFunction,
): StudioUnitPanel[] {
  const chartType = config.display.chartType;
  if (
    chartType !== "LINE_TIME_SERIES" &&
    chartType !== "AREA_TIME_SERIES" &&
    chartType !== "BAR_TIME_SERIES" &&
    chartType !== "VERTICAL_BAR" &&
    chartType !== "HORIZONTAL_BAR"
  )
    return [];
  const timeValues = new Map<number, string>();
  for (const point of data) {
    const date = parseChartTimestamp(point.time_dimension);
    if (date && point.time_dimension)
      timeValues.set(date.getTime(), point.time_dimension);
  }
  const times = [...timeValues.keys()].sort((a, b) => a - b);
  const axis = prepareTimeAxis(times);
  const groups = new Map<string, StudioSeries[]>();
  for (const item of series) {
    const key = studioUnitKey(item.unit);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups].map(([key, visibleSeries]) => {
    const unit = visibleSeries[0]?.unit;
    const selectedIds = new Set(visibleSeries.map((series) => series.id));
    const formatter = formatterForUnit(unit);
    const valueFormatter = (value: number) =>
      toFullMetricString(formatter(value, { style: "compact" }));
    const panelColors = Object.fromEntries(
      visibleSeries.map((series) => [series.id, colors[series.id]!]),
    );
    if (chartType === "VERTICAL_BAR" || chartType === "HORIZONTAL_BAR") {
      const panelRows = rows.filter((row) => selectedIds.has(row.seriesId));
      const explicitSort = visibleSeries.some(
        (series) =>
          config.queries.find((query) => query.id === series.queryId)?.orderBy
            ?.length,
      );
      if (chartType === "HORIZONTAL_BAR" && !explicitSort) {
        const order = new Map(
          visibleSeries.map((series, index) => [series.id, index]),
        );
        panelRows.sort((a, b) => {
          const aFinite =
            typeof a.value === "number" && Number.isFinite(a.value);
          const bFinite =
            typeof b.value === "number" && Number.isFinite(b.value);
          if (aFinite !== bFinite) return aFinite ? -1 : 1;
          if (aFinite && bFinite) {
            const difference = (b.value ?? 0) - (a.value ?? 0);
            if (difference) return difference;
          }
          return (
            (order.get(a.seriesId) ?? order.size) -
            (order.get(b.seriesId) ?? order.size)
          );
        });
      }
      const points = panelRows
        .slice(0, config.display.rowLimit ?? 100)
        .map((row) => ({
          label: colors[row.seriesId]!.label,
          value: row.value,
          color: colors[row.seriesId]!.fillColor,
        }));
      const visualization: PanelVisualization =
        chartType === "VERTICAL_BAR"
          ? {
              type: "bar",
              data: points,
              valueFormatter,
              zeroBaseline: true,
              legend:
                config.display.legend === false
                  ? undefined
                  : {
                      items: [
                        ...new Map(
                          visibleSeries.map((series) => [
                            series.id,
                            {
                              id: series.id,
                              label: series.label,
                              color: colors[series.id]!.color,
                            },
                          ]),
                        ).values(),
                      ],
                    },
            }
          : { type: "horizontal-bar", data: points, valueFormatter };
      return {
        id: key,
        label: unitLabel(unit),
        unit,
        visibleSeries,
        colors: panelColors,
        data: points.map((point) => ({
          dimension: point.label,
          time_dimension: undefined,
          metric: point.value,
        })),
        visualization,
      };
    }
    const byTime = new Map<number, ChartProps["data"]>();
    for (const point of data) {
      if (!point.dimension || !selectedIds.has(point.dimension)) continue;
      const date = parseChartTimestamp(point.time_dimension);
      if (!date) continue;
      const bucket = byTime.get(date.getTime()) ?? [];
      bucket.push({ ...point, time_dimension: timeValues.get(date.getTime()) });
      byTime.set(date.getTime(), bucket);
    }
    const aligned = times.flatMap(
      (time) =>
        byTime.get(time) ?? [
          {
            dimension: visibleSeries[0]!.id,
            time_dimension: timeValues.get(time),
            metric: null,
          },
        ],
    );
    const rendered = prepareVisibleSeries(
      aligned,
      visibleSeries.map((series) => series.id),
    );
    const valuesAt = new Map(
      times.map((time) => [
        time,
        new Map(
          (byTime.get(time) ?? []).map((point) => [
            point.dimension,
            typeof point.metric === "number" ? point.metric : null,
          ]),
        ),
      ]),
    );
    const values = (time: number) =>
      Object.fromEntries(
        rendered.visible.map((id) => [id, valuesAt.get(time)?.get(id) ?? null]),
      );
    const legend =
      config.display.legend === false
        ? { visibility: "hidden" as const }
        : {
            visibility: "visible" as const,
            interaction: "toggle" as const,
            summary: "none" as const,
          };
    const chartSeries = rendered.visible.map((id) => ({
      id,
      label: colors[id]!.label,
      color:
        chartType === "BAR_TIME_SERIES"
          ? colors[id]!.fillColor
          : colors[id]!.color,
      fillColor: colors[id]!.fillColor,
    }));
    const seriesOverflow = {
      visibleCount: rendered.visible.length,
      totalCount: rendered.total,
    };
    let visualization: PanelVisualization;
    if (chartType === "BAR_TIME_SERIES")
      visualization = {
        type: "stacked-bar",
        data: times.map((time) => ({
          key: String(time),
          values: values(time),
        })),
        series: chartSeries,
        legend,
        valueFormatter,
        tickFormatter: (key) => axis.formatTick(Number(key)),
        tooltipFormatter: (key) => axis.formatTooltip(Number(key)),
        seriesOverflow,
      };
    else {
      const common = {
        data: times.map((time) => ({
          x: new Date(time),
          values: values(time),
        })),
        series: chartSeries,
        xAxis: { type: "time" as const },
        legend,
        valueFormatter,
        connectNulls: false,
        seriesOverflow,
      };
      visualization =
        chartType === "AREA_TIME_SERIES"
          ? { type: "area", ...common }
          : { type: "line", ...common };
    }
    return {
      id: key,
      label: unitLabel(unit),
      unit,
      visibleSeries,
      colors: panelColors,
      data: aligned,
      visualization,
    };
  });
}
