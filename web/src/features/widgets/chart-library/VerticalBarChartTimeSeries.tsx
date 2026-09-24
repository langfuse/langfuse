import { useMemo } from "react";

import { StackedBarChart } from "@/src/components/design-system/charts/StackedBarChart/StackedBarChart";
import type { LineChartLegend } from "@/src/components/design-system/charts/LineChart/LineChart";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import {
  parseChartTimestamp,
  prepareTimeAxis,
} from "@/src/features/widgets/chart-library/prepareTimeAxis";
import { prepareVisibleSeries } from "@/src/features/widgets/chart-library/prepareVisibleSeries";
import {
  seriesColor,
  SeriesOverflowNote,
} from "@/src/features/widgets/chart-library/TimeSeriesLegend";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";

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
}: Omit<ChartProps, "subtleFill">) {
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
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));
  const chartData = groupedData.map((datum) => ({
    key: String(datum.time_dimension ?? ""),
    values: Object.fromEntries(
      visibleSeries.visible.map((dimension) => [
        dimension,
        typeof datum[dimension] === "number" ? datum[dimension] : null,
      ]),
    ),
  }));
  const chartSeries = visibleSeries.visible.map((dimension, index) => ({
    id: dimension,
    label:
      getPlainTextFromReactNode(config?.[dimension]?.label ?? dimension) ??
      dimension,
    color: seriesColor(index),
  }));
  let chartLegend: LineChartLegend = { visibility: "hidden" };
  if (legendPosition !== "none" && legendInteraction === "toggle") {
    chartLegend = {
      visibility: legendPosition === "auto" ? "auto" : "visible",
      interaction: "toggle",
      summary: legendSummary,
      maxVisibleSeries,
    };
  } else if (legendPosition !== "none") {
    chartLegend = {
      visibility: legendPosition === "auto" ? "auto" : "visible",
      interaction: "highlight",
      summary: legendSummary,
    };
  }

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
          tooltipFormatter={(key) => timeAxis.formatTooltip(key)}
          hideXAxisLabels={hideXAxisLabels && timeAxis.mode === "category"}
          sync={
            sync
              ? {
                  activeKey: groupedData.find(
                    (datum) =>
                      String(
                        parseChartTimestamp(datum.time_dimension)?.getTime() ??
                          datum.time_dimension,
                      ) === sync.activeKey,
                  )?.time_dimension,
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
