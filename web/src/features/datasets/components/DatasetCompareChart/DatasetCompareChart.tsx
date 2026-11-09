import { useMemo } from "react";
import { useLineChartTimeSeries } from "@/src/features/widgets/chart-library/useLineChartTimeSeries";
import { useVerticalBarChartTimeSeries } from "@/src/features/widgets/chart-library/useVerticalBarChartTimeSeries";
import { formatMetric } from "@/src/features/widgets/chart-library/utils";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  useLargeDatasetGuard,
  LARGE_DATASET_CONFIRMATION,
} from "@/src/features/widgets/chart-library/useLargeDatasetGuard";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import {
  type DataPoint,
  type FormatMetricOptions,
} from "@/src/features/widgets/chart-library/chart-props";

export function DatasetCompareChart({
  data,
  chartType,
  unit,
  hideXAxisLabels,
}: {
  data: DataPoint[];
  chartType: "LINE_TIME_SERIES" | "BAR_TIME_SERIES";
  unit: string | undefined;
  hideXAxisLabels?: boolean;
}) {
  const { shouldWarn, proceed } = useLargeDatasetGuard(data.length, false);
  const metricFormatter = useMemo(
    () => (value: number, options: FormatMetricOptions) =>
      formatMetric(value, { ...options, unit }),
    [unit],
  );
  const line = useLineChartTimeSeries({
    data: !shouldWarn && chartType === "LINE_TIME_SERIES" ? data : [],
    metricFormatter,
    hideXAxisLabels,
  });
  const bar = useVerticalBarChartTimeSeries({
    data: !shouldWarn && chartType === "BAR_TIME_SERIES" ? data : [],
    metricFormatter,
    hideXAxisLabels,
  });
  if (shouldWarn)
    return (
      <VisualizationFrame
        content={{ ...LARGE_DATASET_CONFIRMATION, onConfirm: proceed }}
      />
    );
  if (isChartDataEmpty(data))
    return <VisualizationFrame content={{ type: "empty" }} />;
  return (
    <VisualizationFrame
      {...(chartType === "LINE_TIME_SERIES" ? line : bar)}
      content={
        chartType === "LINE_TIME_SERIES"
          ? line.visualization
          : bar.visualization
      }
    />
  );
}
