import { useMemo } from "react";

import {
  LineChart as DesignSystemLineChart,
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
import {
  seriesColor,
  SeriesOverflowNote,
} from "@/src/features/widgets/chart-library/TimeSeriesLegend";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";

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

/**
 * Widget adapter for the design-system D3 line chart. Query-specific data
 * shaping and legend state stay here; drawing belongs to the design system.
 */
export function LineChartTimeSeries({
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
  showDataPointDots = false,
  thresholds,
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
      <DesignSystemLineChart
        data={chartData}
        series={chartSeries}
        valueFormatter={formatValue}
        showDataPointDots={showDataPointDots}
        connectNulls={connectNulls}
        thresholds={thresholds?.map(toDesignSystemThreshold)}
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
      <DesignSystemLineChart
        data={chartData.flatMap((datum) => {
          const date = parseChartTimestamp(datum.x);
          return date ? [{ ...datum, x: date }] : [];
        })}
        series={chartSeries}
        valueFormatter={formatValue}
        showDataPointDots={showDataPointDots}
        connectNulls={connectNulls}
        thresholds={thresholds?.map(toDesignSystemThreshold)}
        sync={sync}
        legend={chartLegend}
        xAxis={{
          type: "time",
          tickFormatter: (value) => timeAxis.formatTick(value.getTime()),
          tooltipFormatter: (value) => timeAxis.formatTooltip(value.getTime()),
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
