import { useMemo } from "react";

import { AreaChart as DesignSystemAreaChart } from "@/src/components/design-system/charts/AreaChart/AreaChart";
import { type LineChartLegend } from "@/src/components/design-system/charts/LineChart/LineChart";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  getUniqueDimensions,
  groupDataByTimeDimension,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { prepareDenseSeries } from "@/src/features/widgets/chart-library/prepareDenseSeries";
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

export function AreaChartTimeSeries({
  data,
  config = {
    metric: {
      theme: {
        light: "hsl(var(--chart-1))",
        dark: "hsl(var(--chart-1))",
      },
    },
  },
  metricFormatter = (value, options) => formatMetric(value, options),
  legendPosition = "auto",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  sync,
  missingValue = "gap",
  connectNulls = false,
  hideXAxisLabels = false,
}: Omit<ChartProps, "subtleFill">) {
  const allDimensions = useMemo(() => getUniqueDimensions(data), [data]);
  const groupedData = useMemo(
    () =>
      prepareDenseSeries(
        groupDataByTimeDimension(data),
        allDimensions,
        missingValue,
      ),
    [data, allDimensions, missingValue],
  );
  const visibleSeries = useMemo(
    () => prepareVisibleSeries(data, allDimensions),
    [data, allDimensions],
  );
  const dimensions = visibleSeries.visible;
  const hasNonTimestampBucket = groupedData.some(
    (datum) => !parseChartTimestamp(datum.time_dimension),
  );
  const timeAxis = useMemo(
    () =>
      prepareTimeAxis(
        groupedData.map((datum) => datum.time_dimension),
        undefined,
        { hideCategoryTickLabels: hideXAxisLabels },
      ),
    [groupedData, hideXAxisLabels],
  );
  const dateAxis = useMemo(() => {
    if (timeAxis.mode !== "category") return timeAxis;
    const dates = groupedData.flatMap((datum) => {
      const date = parseChartTimestamp(datum.time_dimension);
      return date ? [date.getTime()] : [];
    });
    return dates.length ? prepareTimeAxis(dates) : timeAxis;
  }, [groupedData, timeAxis]);
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));
  const chartData = useMemo(
    () =>
      groupedData.map((datum) => ({
        x: String(datum.time_dimension ?? ""),
        values: Object.fromEntries(
          dimensions.map((dimension) => {
            const value = datum[dimension];
            return [dimension, typeof value === "number" ? value : null];
          }),
        ),
      })),
    [dimensions, groupedData],
  );
  const chartSeries = dimensions.map((dimension, index) => ({
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
  const chart =
    timeAxis.mode === "category" || hasNonTimestampBucket ? (
      <DesignSystemAreaChart
        data={chartData}
        series={chartSeries}
        valueFormatter={formatValue}
        connectNulls={connectNulls}
        sync={sync}
        legend={chartLegend}
        xAxis={{
          type: "category",
          labels: hideXAxisLabels ? "hidden" : "visible",
          tickFormatter: (value) => {
            const date = parseChartTimestamp(value);
            return date
              ? dateAxis.formatTick(date.getTime())
              : timeAxis.formatTick(value);
          },
          tooltipFormatter: (value) => {
            const date = parseChartTimestamp(value);
            return date
              ? dateAxis.formatTooltip(date.getTime())
              : timeAxis.formatTooltip(value);
          },
        }}
      />
    ) : (
      <DesignSystemAreaChart
        data={chartData.flatMap((datum) => {
          const date = parseChartTimestamp(datum.x);
          return date ? [{ ...datum, x: date }] : [];
        })}
        series={chartSeries}
        valueFormatter={formatValue}
        connectNulls={connectNulls}
        sync={sync}
        legend={chartLegend}
        xAxis={{
          type: "time",
        }}
      />
    );

  return (
    <div className="flex size-full min-w-0 flex-col">
      {visibleSeries.total > dimensions.length ? (
        <SeriesOverflowNote
          visibleCount={dimensions.length}
          totalCount={visibleSeries.total}
        />
      ) : null}
      <div className="min-h-0 flex-1">{chart}</div>
    </div>
  );
}
