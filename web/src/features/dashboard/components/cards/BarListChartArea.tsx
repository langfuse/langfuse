import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type MetricFormatterFunction } from "@/src/features/widgets/chart-library/chart-props";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";

export type BarListDataPoint = {
  name: string;
  value: number;
};

/**
 * Chart area for the horizontal bar cards (Traces, User consumption). The
 * TopListChart lays its rows out with a fixed 20–56px rhythm and scrolls
 * internally when they don't fit, so this wrapper only has to bound the
 * height: `flex-1 min-h-0` takes the card's leftover space and the chart
 * fills it. No measurement, no expand state; replaces the previous
 * fit-row-count height-measuring hook.
 */
export function BarListChartArea({
  data,
  maxBars,
  metricLabel,
  unit,
  metricFormatter,
}: {
  /** Bars to show, already capped by the caller's query row limit. */
  data: BarListDataPoint[];
  maxBars: number;
  metricLabel: string;
  unit: string;
  metricFormatter?: MetricFormatterFunction;
}) {
  return (
    <div className="mt-4 min-h-0 w-full flex-1">
      <Chart
        chartType="HORIZONTAL_BAR"
        data={barListToDataPoints(data)}
        metricFormatter={metricFormatter}
        config={{ metric: { label: metricLabel } }}
        rowLimit={maxBars}
        chartConfig={{
          type: "HORIZONTAL_BAR",
          row_limit: maxBars,
          unit,
          show_value_labels: true,
        }}
      />
    </div>
  );
}
