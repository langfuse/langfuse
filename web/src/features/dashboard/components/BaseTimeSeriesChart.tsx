import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { AreaChart, type CustomTooltipProps, LineChart } from "@tremor/react";
import { Tooltip } from "@/src/features/dashboard/components/Tooltip";
import {
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";

export type TimeSeriesChartDataPoint = {
  ts: number;
  values: { label: string; value?: number }[];
};

export function BaseTimeSeriesChart(props: {
  className?: string;
  agg: DashboardDateRangeAggregationOption;
  data: TimeSeriesChartDataPoint[];
  showLegend?: boolean;
  connectNulls?: boolean;
  valueFormatter?: (value: number) => string;
  chartType?: "line" | "area";
}) {
  const labels = new Set(
    props.data.flatMap((d) => d.values.map((v) => v.label)),
  );

  type ChartInput = { timestamp: string } & {
    [key: string]: number | undefined;
  };

  function transformArray(array: TimeSeriesChartDataPoint[]): ChartInput[] {
    return array.map((item) => {
      const outputObject: ChartInput = {
        timestamp: convertDate(item.ts, props.agg),
      } as ChartInput;

      item.values.forEach((valueObject) => {
        outputObject[valueObject.label] = valueObject.value;
      });

      return outputObject;
    });
  }

  const convertDate = (
    date: number,
    agg: DashboardDateRangeAggregationOption,
  ) => {
    const showMinutes = ["minute", "hour"].includes(
      dashboardDateRangeAggregationSettings[agg].date_trunc,
    );

    if (showMinutes) {
      return new Date(date).toLocaleTimeString("en-US", {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return new Date(date).toLocaleDateString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
    });
  };

  const ChartComponent = props.chartType === "area" ? AreaChart : LineChart;
  const TooltipComponent = (tooltipProps: CustomTooltipProps) => (
    <Tooltip
      {...tooltipProps}
      formatter={props.valueFormatter ?? compactNumberFormatter}
    />
  );
  const colors = getColorsForCategories(Array.from(labels));

  return (
    <ChartComponent
      className={cn("mt-4", props.className)}
      data={transformArray(props.data)}
      index="timestamp"
      categories={Array.from(labels)}
      connectNulls={props.connectNulls}
      colors={colors}
      valueFormatter={props.valueFormatter ?? compactNumberFormatter}
      noDataText="No data"
      showLegend={props.showLegend}
      showAnimation={true}
      onValueChange={() => {}}
      enableLegendSlider={true}
      customTooltip={TooltipComponent}
    />
  );
}
