import { type IntervalConfig } from "@/src/utils/date-range-utils";
import { ScoreTimeSeriesNumericChart } from "./ScoreTimeSeriesNumericChart";
import { ScoreTimeSeriesBooleanChart } from "./ScoreTimeSeriesBooleanChart";
import { ScoreTimeSeriesCategoricalChart } from "./ScoreTimeSeriesCategoricalChart";

export interface ScoreTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    avg1: number | null;
    avg2: number | null;
    count: number;
  }>;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  score1Name: string;
  score2Name?: string;
  interval: IntervalConfig;
}

/**
 * Score time series chart router component
 * Routes to the appropriate chart component based on data type:
 * - NUMERIC → ScoreTimeSeriesNumericChart (line charts)
 * - BOOLEAN → ScoreTimeSeriesBooleanChart (stacked bars - Phase 2)
 * - CATEGORICAL → ScoreTimeSeriesCategoricalChart (stacked bars - Phase 2)
 */
export function ScoreTimeSeriesChart({
  data,
  dataType,
  score1Name,
  score2Name,
  interval,
}: ScoreTimeSeriesChartProps) {
  const commonProps = {
    data,
    score1Name,
    score2Name,
    interval,
  };

  switch (dataType) {
    case "NUMERIC":
      return <ScoreTimeSeriesNumericChart {...commonProps} />;
    case "BOOLEAN":
      return <ScoreTimeSeriesBooleanChart {...commonProps} />;
    case "CATEGORICAL":
      return <ScoreTimeSeriesCategoricalChart {...commonProps} />;
  }
}
