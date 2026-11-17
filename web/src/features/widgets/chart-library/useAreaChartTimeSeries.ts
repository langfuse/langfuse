import { type ComponentProps, useMemo } from "react";

import { type AreaChart as DesignSystemAreaChart } from "@/src/components/design-system/charts/AreaChart/AreaChart";
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
  seriesFillColor,
} from "@/src/features/widgets/chart-library/seriesColors";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";

export function useAreaChartTimeSeries({
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
}: ChartProps) {
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
    fillColor: seriesFillColor(index),
  }));
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
  const axisProps: ComponentProps<typeof DesignSystemAreaChart> =
    timeAxis.mode === "category" || hasNonTimestampBucket
      ? {
          data: chartData,
          series: chartSeries,
          xAxis: {
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
          },
        }
      : {
          data: chartData.flatMap((datum) => {
            const date = parseChartTimestamp(datum.x);
            return date ? [{ ...datum, x: date }] : [];
          }),
          series: chartSeries,
          xAxis: {
            type: "time",
          },
        };

  const chartProps = {
    ...axisProps,
    valueFormatter: formatValue,
    connectNulls,
    sync,
    legend: chartLegend,
  };
  return {
    visualization: {
      type: "area" as const,
      ...chartProps,
      seriesOverflow: {
        visibleCount: dimensions.length,
        totalCount: visibleSeries.total,
      },
    },
  };
}
