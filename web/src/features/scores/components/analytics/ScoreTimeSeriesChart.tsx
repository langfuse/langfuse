import { type IntervalConfig } from "@/src/utils/date-range-utils";
import { ScoreTimeSeriesNumericChart } from "./ScoreTimeSeriesNumericChart";
import { ScoreTimeSeriesBooleanChart } from "./ScoreTimeSeriesBooleanChart";
import { ScoreTimeSeriesCategoricalChart } from "./ScoreTimeSeriesCategoricalChart";

// Numeric data shape
type NumericTimeSeriesData = Array<{
  timestamp: Date;
  avg1: number | null;
  avg2: number | null;
  count: number;
}>;

// Categorical/Boolean data shape
type CategoricalTimeSeriesData = Array<{
  timestamp: Date;
  category: string;
  count: number;
}>;

export interface ScoreTimeSeriesChartProps {
  data: NumericTimeSeriesData | CategoricalTimeSeriesData;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  score1Name: string;
  score2Name?: string;
  interval: IntervalConfig;
}

/**
 * Score time series chart router component
 * Routes to the appropriate chart component based on data type:
 * - NUMERIC → ScoreTimeSeriesNumericChart (line charts)
 * - BOOLEAN → ScoreTimeSeriesBooleanChart (line charts with True/False)
 * - CATEGORICAL → ScoreTimeSeriesCategoricalChart (line charts with categories)
 */
export function ScoreTimeSeriesChart({
  data,
  dataType,
  score1Name,
  score2Name,
  interval,
}: ScoreTimeSeriesChartProps) {
  switch (dataType) {
    case "NUMERIC":
      return (
        <ScoreTimeSeriesNumericChart
          data={data as NumericTimeSeriesData}
          score1Name={score1Name}
          score2Name={score2Name}
          interval={interval}
        />
      );
    case "BOOLEAN":
      return (
        <ScoreTimeSeriesBooleanChart
          data={data as CategoricalTimeSeriesData}
          score1Name={score1Name}
          score2Name={score2Name}
          interval={interval}
        />
      );
    case "CATEGORICAL":
      return (
        <ScoreTimeSeriesCategoricalChart
          data={data as CategoricalTimeSeriesData}
          score1Name={score1Name}
          score2Name={score2Name}
          interval={interval}
        />
      );
  }
}
