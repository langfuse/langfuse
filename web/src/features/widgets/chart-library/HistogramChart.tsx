import { HistogramChart as DesignSystemHistogramChart } from "@/src/components/design-system/charts/HistogramChart/HistogramChart";
import {
  type DataPoint,
  type MetricFormatterFunction,
  type ChartProps,
} from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

const HistogramChart = ({
  data,
  config = {
    count: {
      label: "Count",
      color: "hsl(var(--chart-1))",
    },
  },
  metricFormatter = (value, options) => formatMetric(value, options),
}: {
  data: DataPoint[];
  config?: ChartProps["config"];
  metricFormatter?: MetricFormatterFunction;
}) => {
  const formatBinEdge = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  const transformHistogramData = (data: DataPoint[]) => {
    if (!data.length) return [];

    const firstDataPoint = data[0];
    if (firstDataPoint?.metric && Array.isArray(firstDataPoint.metric)) {
      return (firstDataPoint.metric as [number, number, number][]).map(
        ([lower, upper, height]) => ({
          label: `[${formatBinEdge(lower)}, ${formatBinEdge(upper)}]`,
          value: height,
        }),
      );
    }

    return data.map((item, index) => ({
      label: item.dimension || `Bin ${index + 1}`,
      value: (item.metric as number) || 0,
    }));
  };

  const histogramData = transformHistogramData(data);

  if (!histogramData.length) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        No data available
      </div>
    );
  }

  return (
    <DesignSystemHistogramChart
      data={histogramData}
      color={config.count?.color ?? "hsl(var(--chart-1))"}
      valueFormatter={(value) =>
        toFullMetricString(formatMetric(value, { style: "compact" }))
      }
      ariaLabel="Histogram"
      tooltipHeading={(label) => `Bin: ${label}`}
      tooltipValueLabel="Count"
    />
  );
};

export default HistogramChart;
