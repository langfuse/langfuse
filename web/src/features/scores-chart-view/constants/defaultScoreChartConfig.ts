import { type ScoreChartViewConfig } from "@/src/features/scores-chart-view/types";

export const DEFAULT_SCORE_CHART_CONFIG: ScoreChartViewConfig = {
  dataset: "numeric",
  metric: "count",
  aggregation: "count",
  breakdown: "name",
  chartType: "LINE_TIME_SERIES",
  timeGranularity: "hour",
};
