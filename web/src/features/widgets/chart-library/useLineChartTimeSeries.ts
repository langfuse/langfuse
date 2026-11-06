import { type ComponentProps, useMemo } from "react";

import {
  type LineChart as DesignSystemLineChart,
  type LineChartLegend,
  type LineChartThreshold,
} from "@/src/components/design-system/charts/LineChart/LineChart";
import {
  type ChartProps,
  type ChartThreshold,
} from "@/src/features/widgets/chart-library/chart-props";
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
import { seriesColor } from "@/src/features/widgets/chart-library/seriesColors";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";

const defaultConfig: NonNullable<ChartProps["config"]> = {
  metric: {
    theme: {
      light: "hsl(var(--chart-1))",
      dark: "hsl(var(--chart-1))",
    },
  },
};

function toDesignSystemThreshold(
  threshold: ChartThreshold,
): LineChartThreshold {
  let region: LineChartThreshold["region"];
  if (threshold.operator === "GT" || threshold.operator === "GTE") {
    region = "above";
  } else if (threshold.operator === "LT" || threshold.operator === "LTE") {
    region = "below";
  } else if (threshold.operator === "EQ") {
    region = "equal";
  } else {
    region = "not-equal";
  }

  return {
    value: threshold.value,
    label: threshold.label,
    color: `var(--color-${threshold.color}-600)`,
    fillColor: `var(--color-${threshold.color}-500)`,
    region,
    lineStyle:
      threshold.operator === "GT" ||
      threshold.operator === "LT" ||
      threshold.operator === "NEQ"
        ? "dashed"
        : "solid",
  };
}

export function useLineChartTimeSeries({
  data,
  config = defaultConfig,
  metricFormatter = formatMetric,
  legendPosition = "auto",
  legendSummary = "none",
  legendInteraction = "highlight",
  maxVisibleSeries,
  sync,
  showDataPointDots = false,
  thresholds,
  missingValue = "gap",
  connectNulls = false,
  hideXAxisLabels = false,
  compactYAxis = false,
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
  const formatValue = useMemo(
    () => (value: number) =>
      toFullMetricString(metricFormatter(value, { style: "compact" })),
    [metricFormatter],
  );
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
  const chartSeries = useMemo(
    () =>
      dimensions.map((dimension, index) => ({
        id: dimension,
        label:
          getPlainTextFromReactNode(config?.[dimension]?.label ?? dimension) ??
          dimension,
        color: seriesColor(index),
      })),
    [dimensions, config],
  );
  const timeChartData = useMemo(
    () =>
      chartData.flatMap((datum) => {
        const date = parseChartTimestamp(datum.x);
        return date ? [{ ...datum, x: date }] : [];
      }),
    [chartData],
  );
  const chartThresholds = useMemo(
    () => thresholds?.map(toDesignSystemThreshold),
    [thresholds],
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
  const axisProps: ComponentProps<typeof DesignSystemLineChart> =
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
          data: timeChartData,
          series: chartSeries,
          xAxis: {
            type: "time",
          },
        };

  const chartProps = {
    ...axisProps,
    valueFormatter: formatValue,
    showDataPointDots,
    connectNulls,
    thresholds: chartThresholds,
    sync,
    legend: chartLegend,
    compactYAxis,
  };
  return {
    visualization: {
      type: "line" as const,
      ...chartProps,
      seriesOverflow: {
        visibleCount: dimensions.length,
        totalCount: visibleSeries.total,
      },
    },
  };
}
