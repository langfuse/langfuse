import {
  CategoricalChart,
  NumericChart,
} from "@/src/features/scores/components/ScoreChart";
import { type TimeseriesChartProps } from "@/src/features/scores/types";

function ChartWrapper(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex w-[400px] flex-none flex-col overflow-hidden">
      <div className="shrink-0 text-sm font-medium">{props.title}</div>
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
}: TimeseriesChartProps) {
  const chartIndex = index ?? "binLabel";

  return (
    <ChartWrapper title={title}>
      <div className="mt-2 min-h-0 flex-1">
        {type === "categorical" ? (
          <CategoricalChart
            chartLabels={chartLabels}
            chartData={chartData}
            className="h-full"
            chartClass="h-full mt-0"
            showXAxis={chartData.length < 3}
          />
        ) : (
          <NumericChart
            chartLabels={chartLabels}
            chartData={chartData}
            index={chartIndex}
          />
        )}
      </div>
    </ChartWrapper>
  );
}
