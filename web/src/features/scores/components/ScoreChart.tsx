import { compactNumberFormatter } from "@/src/utils/numbers";
import { getColorsForCategories } from "@/src/features/dashboard/utils/getColorsForCategories";
import { isEmptyChart } from "@/src/features/dashboard/lib/score-analytics-utils";
import { BarChart, LineChart } from "@tremor/react";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Card } from "@/src/components/ui/card";
import { type ChartBin } from "@/src/features/scores/types";
import { cn } from "@/src/utils/tailwind";

export function CategoricalChart(props: {
  chartData: ChartBin[];
  chartLabels: string[];
  isLoading?: boolean;
  stack?: boolean;
  showXAxis?: boolean;
  className?: string;
  chartClass?: string;
}) {
  const barCategoryGap = (chartLength: number): string => {
    if (chartLength > 7) return "10%";
    if (chartLength > 5) return "20%";
    if (chartLength > 3) return "30%";
    else return "40%";
  };
  const colors = getColorsForCategories(props.chartLabels);

  return isEmptyChart({ data: props.chartData }) ? (
    <NoDataOrLoading
      isLoading={props.isLoading ?? false}
      className={props.chartClass}
    />
  ) : (
    <Card
      className={cn(
        "max-h-full min-h-0 min-w-0 max-w-full flex-1 rounded-tremor-default border",
        props.className,
      )}
    >
      <BarChart
        className={cn(
          "max-h-full min-h-0 min-w-0 max-w-full",
          props.chartClass,
        )}
        data={props.chartData}
        index="binLabel"
        categories={props.chartLabels}
        colors={colors}
        valueFormatter={(number: number) =>
          Intl.NumberFormat("en-US").format(number).toString()
        }
        yAxisWidth={48}
        barCategoryGap={barCategoryGap(props.chartData.length)}
        stack={props.stack ?? true}
        showXAxis={props.showXAxis ?? true}
      />
    </Card>
  );
}

export function NumericChart(props: {
  chartData: ChartBin[];
  chartLabels: string[];
  index: string;
  maxFractionDigits?: number;
}) {
  const colors = getColorsForCategories(props.chartLabels);

  return isEmptyChart({ data: props.chartData }) ? (
    <NoDataOrLoading isLoading={false} />
  ) : (
    <Card className="max-h-full min-h-0 min-w-0 max-w-full flex-1 rounded-tremor-default border">
      <LineChart
        className="max-h-full min-h-0 min-w-0 max-w-full"
        data={props.chartData}
        index={props.index}
        categories={props.chartLabels}
        colors={colors}
        valueFormatter={(value) => {
          return compactNumberFormatter(value, props.maxFractionDigits);
        }}
        noDataText="No data"
        showAnimation={true}
        onValueChange={() => {}}
        enableLegendSlider={true}
        showXAxis={false}
      />
    </Card>
  );
}
