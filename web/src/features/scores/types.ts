import { type ScoreDataType } from "@langfuse/shared";

export type HistogramBin = { binLabel: string; count: number };
export type CategoryCounts = Record<string, number>;
export type ChartBin = { binLabel: string } & CategoryCounts;

export type TimeseriesChartProps = {
  chartData: ChartBin[];
  chartLabels: string[];
  title: string;
  type: "numeric" | "categorical";
  index?: string;
};

export type ChartData = {
  chartData: ChartBin[];
  chartLabels: string[];
};

export type ScoreData = {
  key: string;
  name: string;
  dataType: ScoreDataType;
  source: string;
};

// Adapter interface to standardize data transformation
export interface TimeseriesDataTransformer {
  toChartData(): ChartData;
}
