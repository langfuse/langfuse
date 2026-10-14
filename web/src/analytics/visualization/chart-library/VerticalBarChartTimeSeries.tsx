import { useMemo } from "react";

import { StackedBarChart } from "@/src/app/design-system/charts/StackedBarChart/StackedBarChart";
import type { LineChartLegend } from "@/src/app/design-system/charts/LineChart/LineChart";
import { type ChartProps } from "@/src/analytics/visualization/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/analytics/visualization/chart-library/utils";
import {
  parseChartTimestamp,
  prepareTimeAxis,
} from "@/src/analytics/visualization/chart-library/prepareTimeAxis";
import { prepareVisibleSeries } from "@/src/analytics/visualization/chart-library/prepareVisibleSeries";
import {
  seriesColor,
  SeriesOverflowNote,
} from "@/src/analytics/visualization/chart-library/TimeSeriesLegend";
import { getPlainTextFromReactNode } from "@/src/app/utils/react-node-plain-text";

export function VerticalBarChartTimeSeries({
  data,
  config,
  metricFormatter = formatMetric,
  legendPosition = "auto",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  sync,
  hideXAxisLabels = false,
}: ChartProps) {
  const groupedData = useMemo(() => groupDataByTimeDimension(data), [data]);
  const dimensions = useMemo(() => getUniqueDimensions(data), [data]);
  const visibleSeries = useMemo(
    () => prepareVisibleSeries(data, dimensions),
    [data, dimensions],
  );
  const timeAxis = useMemo(
    () =>
      prepareTimeAxis(
        groupedData.map((datum) => datum.time_dimension),
        undefined,
        {
          hideCategoryTickLabels: hideXAxisLabels,
        },
      ),
    [groupedData, hideXAxisLabels],
  );
  const formatValue = useMemo(
    () => (value: number) =>
      toFullMetricString(metricFormatter(value, { style: "compact" })),
    [metricFormatter],
  );
  const chartData = useMemo(
    () =>
      groupedData.map((datum) => ({
        key: String(datum.time_dimension ?? ""),
        values: Object.fromEntries(
          visibleSeries.visible.map((dimension) => [
            dimension,
            typeof datum[dimension] === "number" ? datum[dimension] : null,
          ]),
        ),
      })),
    [groupedData, visibleSeries],
  );
  const chartSeries = useMemo(
    () =>
      visibleSeries.visible.map((dimension, index) => ({
        id: dimension,
        label:
          getPlainTextFromReactNode(config?.[dimension]?.label ?? dimension) ??
          dimension,
        color: seriesColor(index),
      })),
    [visibleSeries, config],
  );
  const chartLegend = useMemo<LineChartLegend>(() => {
    if (legendPosition === "none") return { visibility: "hidden" };
    if (legendInteraction === "toggle") {
      return {
        visibility: legendPosition === "auto" ? "auto" : "visible",
        interaction: "toggle",
        summary: legendSummary,
        maxVisibleSeries,
      };
    }
    return {
      visibility: legendPosition === "auto" ? "auto" : "visible",
      interaction: "highlight",
      summary: legendSummary,
    };
  }, [legendPosition, legendInteraction, legendSummary, maxVisibleSeries]);

  return (
    <div className="flex size-full min-w-0 flex-col">
      {visibleSeries.total > visibleSeries.visible.length ? (
        <SeriesOverflowNote
          visibleCount={visibleSeries.visible.length}
          totalCount={visibleSeries.total}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <StackedBarChart
          data={chartData}
          series={chartSeries}
          legend={chartLegend}
          valueFormatter={formatValue}
          tickFormatter={(key) => timeAxis.formatTick(key)}
          categoryXAxisLabels={timeAxis.mode === "category"}
          tooltipFormatter={(key) => timeAxis.formatTooltip(key)}
          hideXAxisLabels={hideXAxisLabels && timeAxis.mode === "category"}
          sync={
            sync
              ? {
                  activeKey: chartData.find(
                    (_, index) =>
                      String(
                        parseChartTimestamp(
                          groupedData[index]?.time_dimension,
                        )?.getTime() ?? groupedData[index]?.time_dimension,
                      ) === sync.activeKey,
                  )?.key,
                  onActiveKeyChange: (key) =>
                    sync.onActiveKeyChange(
                      key === undefined
                        ? undefined
                        : String(parseChartTimestamp(key)?.getTime() ?? key),
                    ),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
