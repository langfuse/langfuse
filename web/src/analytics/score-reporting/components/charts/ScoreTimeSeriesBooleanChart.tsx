import {
  ScoreTimeSeriesCategoricalChart,
  type CategoricalTimeSeriesChartProps,
} from "./ScoreTimeSeriesCategoricalChart";

export type BooleanTimeSeriesChartProps = CategoricalTimeSeriesChartProps;

export function ScoreTimeSeriesBooleanChart(
  props: BooleanTimeSeriesChartProps,
) {
  return <ScoreTimeSeriesCategoricalChart {...props} />;
}
