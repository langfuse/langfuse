import {
  CategoricalChart,
  NumericChart,
} from "@/src/features/scores/components/ScoreChart";
import { type TimeseriesChartProps } from "@/src/features/scores/types";

function ChartWrapper(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative z-50 mb-2 flex max-h-full min-h-0 min-w-0 max-w-full flex-none flex-col">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

export function TimeseriesChart({
  chartData,
  chartLabels,
  title,
  type,
  index,
  maxFractionDigits,
}: TimeseriesChartProps) {
  const chartIndex = index ?? "binLabel";

  return (
    <ChartWrapper title={title}>
      <div className="mt-2 flex max-h-full min-h-0 min-w-0 max-w-full">
        {type === "categorical" ? (
          <CategoricalChart
            chartLabels={chartLabels}
            chartData={chartData}
            showXAxis={chartData.length < 3}
          />
        ) : (
          <NumericChart
            chartLabels={chartLabels}
            chartData={chartData}
            index={chartIndex}
            maxFractionDigits={maxFractionDigits}
          />
        )}
      </div>
    </ChartWrapper>
  );
}
